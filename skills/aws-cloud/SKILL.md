---
name: aws-cloud
description: AWS service usage and architecture — IAM least-privilege, S3, Lambda, ECS/Fargate, RDS/Aurora, VPC, CloudWatch observability, and cost guardrails. Use for boto3/aws-sdk work, IaC (CDK/Terraform), IAM policy review, service selection (Lambda vs Fargate vs EC2), or pre-launch cost review.
origin: harness
workloads: [cloud]
---

# AWS Cloud Patterns

Pick the lightest service that meets the SLA and the lowest-blast-radius IAM policy that gets the job done. AWS rewards restraint — the default footgun is over-provisioning, the second is wide-open IAM.

## When to Activate

- Designing AWS infrastructure (IaC or console)
- IAM policy review or scoping a new role
- Picking between Lambda / Fargate / EC2 / App Runner
- S3 access patterns (signed URLs, lifecycle, replication, classes)
- RDS / Aurora connection pooling, IAM auth, failover
- Diagnosing CloudWatch logs/metrics, X-Ray traces
- Bill spikes or pre-launch cost review

## IAM: Least Privilege

The two rules that prevent 90% of incidents:

1. **No wildcards in `Action` AND `Resource` together.** Pick one to scope.
2. **Roles, not access keys.** Every long-lived key is a future leak.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::my-bucket/uploads/*"
  }]
}
```

- Use **IAM Identity Center (SSO)** for humans, **IAM roles** for workloads.
- For local dev: `aws configure sso` + short-lived creds (`aws sso login`).
- For CI: OIDC trust policy → no static keys in GitHub Actions.
- **Permissions Boundaries** cap what a role can ever do, regardless of attached policies. Use them on developer-managed roles.
- Run **IAM Access Analyzer** before merging policy changes — it surfaces external access and unused permissions.

## S3 Patterns

```python
import boto3
s3 = boto3.client("s3")

# Pre-signed PUT for direct browser upload (avoids round-tripping through API)
url = s3.generate_presigned_url(
    "put_object",
    Params={"Bucket": "uploads", "Key": f"u/{user_id}/{file_id}", "ContentType": "image/png"},
    ExpiresIn=300,
)
```

- **Storage classes**: `STANDARD` for hot, `INTELLIGENT_TIERING` for unknown access patterns (no minimum duration penalty), `GLACIER_IR` for archive with ms-level retrieval, `DEEP_ARCHIVE` for cold compliance copies.
- **Lifecycle rules** are mandatory for any bucket that grows unbounded — set Intelligent-Tiering or expiration from day one. Retroactive cleanup is painful.
- **Block Public Access** on at the account level. Public access goes through CloudFront + OAC (Origin Access Control), never bare S3 URLs.
- **Versioning + MFA Delete** for buckets holding compliance data.
- **Cross-region replication** is not a backup — it propagates deletes. Use **S3 Object Lock** in compliance mode if you need true immutability.

## Lambda

```python
# Reuse clients across invocations — initialise outside the handler
import boto3
ddb = boto3.resource("dynamodb").Table("orders")

def handler(event, context):
    return {"status": "ok"}
```

- **Cold-start mitigations**, in order of cost-effectiveness:
  1. Smaller package — drop unused deps, use Lambda layers for shared SDKs
  2. Increase memory (CPU scales with memory; often *cheaper* per request)
  3. **Provisioned concurrency** only for latency-critical paths
  4. SnapStart for Java/Python (free, but breaks if code touches randomness/time at init)
- **Container images** when the package > 50 MB zipped or you need a custom runtime. Slower cold start but no layer juggling.
- **Concurrency limits per function** prevent one runaway from starving others.
- **Dead-letter queues** (SQS) for async invocations — silent failures otherwise.
- **Lambda Powertools** (Python/TypeScript) for structured logging, tracing, metrics, idempotency — don't reinvent.

## Container Workloads: Fargate vs ECS-EC2 vs EKS

| Need | Pick |
|---|---|
| 1–20 services, no k8s expertise on team | **ECS + Fargate** |
| GPU / spot / very high density | **ECS on EC2** |
| Multi-tenant, complex routing, k8s ecosystem | **EKS** |
| Single container, HTTP-only, autoscale to zero | **App Runner** |

Fargate task definition essentials:
- `awsvpc` networking — task gets its own ENI, security group, no port mapping
- **Sidecars for logs**: FireLens → CloudWatch / Kinesis / Datadog (avoids CloudWatch ingestion costs at scale)
- **Spot for stateless workloads** — 70% cheaper, 2-min termination notice
- ARM64 (Graviton) — ~20% cheaper, same memory, just rebuild the image

## RDS / Aurora

- **Aurora over plain RDS** for new Postgres/MySQL workloads — better failover, faster restore, separates storage from compute.
- **IAM database auth** instead of static passwords for app code:
  ```python
  token = rds.generate_db_auth_token(host, port, user, region)
  conn = psycopg2.connect(host=host, user=user, password=token, sslmode="require")
  ```
- **RDS Proxy** for Lambda → RDS (avoids connection storms). For ECS/EKS, a PgBouncer sidecar is usually cheaper.
- **Multi-AZ** for any production workload. **Read replicas** are not failover — they have replication lag.
- **Performance Insights** is the first stop for "the DB feels slow." Enable it; the long-term retention tier is worth the small cost.
- **Aurora Serverless v2** for spiky / dev workloads. Don't use it for steady high-throughput — provisioned is cheaper at constant load.

## Networking: VPC Sanity

- **One VPC per environment** (dev/stage/prod). Don't share across accounts.
- **3 AZs minimum** for production — 2 AZs leaves you with 50% capacity during one-AZ failures.
- **Private subnets** for everything except ALB/NAT — Lambda, ECS, RDS all belong in private.
- **VPC Endpoints** for S3, DynamoDB (free), and Secrets Manager / SSM (priced per hour but cheaper than NAT egress at scale).
- **Single NAT Gateway** for dev, **per-AZ NAT** for prod. NAT is one of the silent top-3 line items in most bills.

## Observability

- **CloudWatch Logs Insights** for ad-hoc log queries — set retention (default is forever, which gets expensive).
- **Embedded Metric Format (EMF)** — log structured JSON, get metrics for free, no PutMetric API calls.
- **X-Ray** for tracing across Lambda → SQS → Lambda → DynamoDB chains.
- **CloudWatch Alarms** on: 5xx rate, p99 latency, DLQ depth, RDS CPU, Lambda errors, NAT bytes-out (catches data exfil).

## Cost Guardrails

- **Budgets with alarms** at 50/80/100% of monthly target — set on day one.
- **Cost Anomaly Detection** is free and catches the surprises Budgets miss.
- **Savings Plans** for steady compute (EC2 + Fargate + Lambda) — Compute Savings Plans flex across services.
- **Reserved Instances** are obsolete for new commitments; use Savings Plans.
- **S3 Storage Lens** + **Trusted Advisor** monthly review.
- Tag everything with `Environment`, `Service`, `Owner` from day one — adding tags later is a multi-week archaeology project.
- Pair with the devops agent's `@aws-pricing` (pre-deploy estimate) and `@aws-billing-cost-management` (actuals) MCP servers.

## IaC: CDK vs Terraform

- **CDK** when the team writes TypeScript/Python and stays AWS-only — generates CFN, integrates with the Constructs library.
- **Terraform** when multi-cloud, or when you need readable plan diffs that aren't 4000 lines of CloudFormation. For greenfield Terraform, follow the `terraform-deployment` skill (pin latest stable, lock, remote state).
- Either way: **state in S3 + lock**, **plan in CI**, **apply only from CI** with OIDC, never from a laptop.
- Avoid **drift** by setting `prevent_destroy` / `removalPolicy=RETAIN` on stateful resources (RDS, S3, KMS keys).

## Common Pitfalls

- **NAT Gateway data egress** — biggest surprise on the bill. Use VPC endpoints.
- **CloudWatch Logs default retention = never** — costs grow forever.
- **`s3:*` in policies** — never. Scope to actual actions.
- **Default VPCs** — delete them; only use VPCs you defined.
- **Lambda inside VPC without endpoints** — pulls every Secrets Manager / DDB call through NAT. Add endpoints.
- **Aurora Serverless v1** — deprecated; migrate to v2.

## Related

- `aws-bedrock` — Bedrock LLM calls + agents
- `terraform-deployment` — greenfield Terraform version pinning + first deploy
- `cost-aware-llm-pipeline` — cost discipline applies to LLM workloads too
