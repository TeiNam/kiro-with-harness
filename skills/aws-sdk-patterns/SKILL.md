---
name: aws-sdk-patterns
description: >
  AWS SDK and CLI usage patterns — boto3 / aioboto3 (Python), AWS SDK for JavaScript v3,
  and AWS CLI v2. Covers credential resolution (SSO/profiles/OIDC), retry & timeout config
  (adaptive mode), paginators & waiters, ClientError handling, batch/transaction calls,
  async clients, JS v3 command/middleware pattern, and CLI v2 --query/--profile/pager.
  Use when writing AWS SDK code (not architecture — see aws-cloud), debugging throttling,
  credential chain issues, pagination, or scripting the AWS CLI. Triggers: boto3, aioboto3,
  botocore Config, paginator, waiter, ClientError, @aws-sdk/client-*, AWS CLI, aws configure sso,
  --query JMESPath, retry mode, NoCredentialsError, ThrottlingException.
origin: harness
workloads: [cloud]
---

# AWS SDK & CLI Patterns

How to *call* AWS correctly from code and the terminal. Architecture, IAM scoping, and
service selection live in `aws-cloud`; this skill is the client/coding layer that sits on
top of it. The three rules that prevent most production incidents:

1. **Never construct static credentials in code.** Let the default credential chain resolve them.
2. **Always configure retries + timeouts explicitly.** SDK defaults are not safe for production latency budgets.
3. **Never loop a `list_*`/`describe_*` call by hand.** Use paginators — manual `NextToken` loops drop pages.

## When to Activate

- Writing boto3 / aioboto3 / AWS SDK for JS code
- Debugging `NoCredentialsError`, `ExpiredToken`, `ThrottlingException`, or silent pagination truncation
- Choosing client vs resource, sync vs async, paginator vs waiter
- Scripting the AWS CLI (`--query`, profiles, SSO, output formats)
- Tuning retry/timeout behavior for Lambda or latency-critical paths

## Credential Resolution (do not hardcode)

The SDK resolves credentials in a fixed order. Configure the environment, not the code:

1. Explicit constructor params (avoid — only for tests)
2. Environment vars (`AWS_ACCESS_KEY_ID`, `AWS_SESSION_TOKEN`, …)
3. Shared config/credentials files (`~/.aws/credentials`, `~/.aws/config` profiles)
4. SSO cache (`aws sso login`)
5. Container creds (ECS task role via `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`)
6. EC2/EKS instance metadata (IMDSv2) / IRSA web-identity token

```python
import boto3
# Pick credentials by profile/region via a Session, then make clients from it.
session = boto3.Session(profile_name="prod", region_name="ap-northeast-2")
s3 = session.client("s3")
```

- **Local dev**: `aws configure sso` once, then `aws sso login --profile prod`. Reference the profile via `AWS_PROFILE=prod` or `Session(profile_name=...)`.
- **CI**: GitHub OIDC → `role-to-assume` (no static keys). The SDK picks up the web-identity token automatically.
- **Workloads**: ECS task role / EKS IRSA / Lambda execution role — zero config, the chain finds them.
- Never call `sts.get_session_token` to "make creds" for app code; rely on the role the runtime already has.

## boto3: client vs resource

- **`client`** — low-level, 1:1 with API operations, returns dicts, supports paginators/waiters. Prefer this for new code (resources are in maintenance mode).
- **`resource`** — higher-level OO wrappers (`s3.Bucket(...)`); convenient but uneven coverage and no async path.

```python
ddb = session.client("dynamodb")          # low-level, paginator-capable
table = session.resource("dynamodb").Table("orders")  # OO convenience
```

## Retries & Timeouts (always set these)

SDK default is `legacy` retry mode with generous socket timeouts — bad for Lambda. Set a `Config`:

```python
from botocore.config import Config

cfg = Config(
    region_name="ap-northeast-2",
    retries={"max_attempts": 5, "mode": "adaptive"},  # adaptive = client-side rate limiting on throttle
    connect_timeout=3,
    read_timeout=10,
    max_pool_connections=50,  # raise for high-concurrency clients
)
s3 = session.client("s3", config=cfg)
```

- **Retry modes**: `legacy` (default, 4 attempts, limited errors) → `standard` (more error codes, token bucket) → `adaptive` (standard + client-side throttle backoff). Use `adaptive` for high-throughput callers hitting `ThrottlingException`.
- **Timeouts**: in Lambda, `read_timeout` must be < the function timeout, or you get killed mid-retry. Budget: `connect 1–3s`, `read` per-call SLA.
- Reuse one client across invocations/requests — creating a client per call re-resolves credentials and TLS handshakes.

## Paginators (never loop NextToken by hand)

```python
paginator = s3.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket="data", Prefix="2026/", PaginationConfig={"PageSize": 1000}):
    for obj in page.get("Contents", []):
        process(obj["Key"])
```

- Any operation with `NextToken`/`Marker`/`IsTruncated` has a paginator. Manual loops eventually forget the token and silently process page 1 only.
- Use JMESPath `search()` on a paginator to flatten: `paginator.paginate(...).search("Contents[].Key")`.

## Waiters (poll for state, don't sleep-loop)

```python
waiter = s3.get_waiter("object_exists")
waiter.wait(Bucket="data", Key="report.csv", WaiterConfig={"Delay": 5, "MaxAttempts": 20})
```

- Waiters exist for `bucket_exists`, `table_exists`, `instance_running`, `stack_create_complete`, etc. They encode the correct polling interval — don't reimplement with `time.sleep`.

## Error Handling

```python
from botocore.exceptions import ClientError

try:
    s3.head_object(Bucket="data", Key=key)
except ClientError as e:
    code = e.response["Error"]["Code"]          # e.g. "404", "NoSuchKey", "ThrottlingException"
    status = e.response["ResponseMetadata"]["HTTPStatusCode"]
    if code in ("404", "NoSuchKey"):
        return None
    raise
```

- Branch on `e.response["Error"]["Code"]`, not on string matching the message.
- Throttling/5xx are retried by the SDK already; only catch them if you need custom backoff beyond `adaptive`.
- `NoCredentialsError` / `EndpointConnectionError` are `botocore.exceptions`, not `ClientError` — catch separately if needed.

## Batch & Transactions

- **DynamoDB**: `batch_write_item` (max 25), `transact_write_items` (max 100, all-or-nothing). Handle `UnprocessedItems` by re-submitting with backoff. See `dynamodb-guideline` for modeling.
- **S3**: `delete_objects` (max 1000 keys/call) instead of per-key `delete_object`.
- **SQS**: `send_message_batch` / `delete_message_batch` (max 10) — 10x fewer requests, 10x lower cost.

## Async: aioboto3

```python
import aioboto3

session = aioboto3.Session()
async with session.client("s3", config=cfg) as s3:
    resp = await s3.get_object(Bucket="data", Key=key)
    body = await resp["Body"].read()
```

- `aioboto3` wraps `aiobotocore`; clients are async context managers — open once per task scope, not per call.
- Same `Config`/paginator/`ClientError` semantics, but `async for page in paginator.paginate(...)`.
- Use for high-fan-out I/O (hundreds of concurrent S3/DDB calls). For CPU work, async buys nothing.

## AWS SDK for JavaScript v3

Modular, command-based, tree-shakeable. Import only the commands you use:

```ts
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "ap-northeast-2",
  maxAttempts: 5,                       // retries
  requestHandler: { requestTimeout: 10_000, connectionTimeout: 3_000 },
});

const out = await s3.send(new GetObjectCommand({ Bucket: "data", Key: key }));
const body = await out.Body!.transformToString();
```

- **Credential chain** is automatic via `@aws-sdk/credential-providers` (`fromNodeProviderChain`, `fromSSO`, `fromWebToken`). Don't pass keys literally.
- **Pagination**: use `paginateListObjectsV2({ client: s3 }, { Bucket })` helpers — `for await (const page of ...)`.
- **Presigned URLs**: `@aws-sdk/s3-request-presigner` → `getSignedUrl(s3, command, { expiresIn: 300 })`.
- **Middleware stack**: inject custom logic (headers, logging) via `client.middlewareStack.add(...)` rather than wrapping calls.
- Reuse one client per process; it pools connections.

## AWS CLI v2

```bash
# SSO login once per session
aws configure sso          # one-time setup; creates a named profile
aws sso login --profile prod

# Server-side filter + client-side projection (JMESPath)
aws ec2 describe-instances --profile prod \
  --filters "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].{id:InstanceId,type:InstanceType,ip:PrivateIpAddress}" \
  --output table

# Disable the pager for scripts (v2 pipes through a pager by default)
export AWS_PAGER=""        # or pass --no-cli-pager per command
```

- **`--query`** (JMESPath) filters/reshapes client-side; **`--filters`** filters server-side (cheaper, do this first).
- **`--output`**: `json` for scripts (pipe to `jq`), `table` for humans, `text` for `cut`/`awk`.
- **Profiles**: `--profile` or `AWS_PROFILE`. **Region**: `--region` or `AWS_REGION`.
- **`--dry-run`** on mutating EC2 calls to test IAM permissions without effect.
- **Auto-prompt**: `aws --cli-auto-prompt` for interactive command discovery.
- CLI v2 ships as a self-contained bundle (no system Python). Pin it in CI rather than `pip install awscli` (that's v1).

## Common Pitfalls

- **One client per request** — recreating clients re-resolves credentials and re-handshakes TLS; hoist them to module scope.
- **Manual `NextToken` loops** — silently drop pages. Use paginators.
- **No timeout in Lambda** — a hung socket burns the whole function timeout. Always set `read_timeout < function timeout`.
- **`read_timeout` shorter than the operation** — large S3 downloads or long DDB scans fail mid-flight. Size per call.
- **Catching `Exception`** around SDK calls — masks `ThrottlingException` the SDK would otherwise retry. Catch `ClientError` and branch on code.
- **`pip install awscli`** — installs CLI v1. Use the official v2 installer.
- **Hardcoded region** — prefer `AWS_REGION`/profile so the same code runs in multiple regions.
- **Leaking creds via `Session(aws_access_key_id=...)`** in source — use the chain.

## Related

- `aws-cloud` — service selection, IAM scoping, networking, cost (the architecture layer above this)
- `aws-bedrock` — Bedrock Converse/InvokeModel SDK calls specifically
- `dynamodb-guideline` — DynamoDB data modeling + boto3/aioboto3 access patterns
- `terraform-deployment` — provisioning the resources these SDK calls talk to
- devops agent + `@aws-core` / `@aws-documentation` MCP servers — live AWS operations
