---
name: aws-bedrock
description: Amazon Bedrock — Converse API, model invocation (Claude/Llama/Nova/Mistral/Titan), Agents, Knowledge Bases, Guardrails, prompt caching, cross-region inference profiles, and cost tracking. Use when calling foundation models inside an AWS boundary (bedrock-runtime, Converse, retrieve_and_generate, guardrails, embeddings).
origin: harness
workloads: [ai, cloud]
---

# AWS Bedrock

Bedrock is the unified front door to multiple foundation models on AWS, with IAM-based access, regional residency, VPC endpoints, and built-in CloudWatch / CloudTrail. Reach for it when "we need the same model, but inside our AWS boundary, billed on our AWS account" matters more than calling provider SDKs directly.

## When to Activate

- Calling Claude / Nova / Llama / Mistral / Cohere through `bedrock-runtime`
- Building Bedrock Agents or Knowledge Bases (RAG with managed retrieval)
- Adding Bedrock Guardrails (PII, profanity, contextual filters)
- Embeddings via Titan / Cohere
- Comparing Bedrock vs direct provider SDKs (Anthropic, OpenAI)
- Provisioned throughput planning

## Bedrock vs Direct Provider SDKs

| Need | Pick |
|---|---|
| Stay inside one AWS account / billing / IAM | Bedrock |
| Latest Anthropic / OpenAI features same-day | Direct SDK |
| Data residency (EU/AP), VPC endpoints | Bedrock |
| PrivateLink, no public internet | Bedrock |
| Lowest absolute cost on a single model | Often direct SDK |
| Multi-model ensemble in one IAM boundary | Bedrock |

Bedrock typically lags the provider's own API by weeks for new features. Confirm `Converse` supports a feature before designing around it.

## Converse API: The Default

`Converse` (and `ConverseStream`) is the unified, model-agnostic API. Prefer it over `InvokeModel` — it normalises message structure, tool use, and streaming across models.

```python
import boto3

client = boto3.client("bedrock-runtime", region_name="us-east-1")

response = client.converse(
    modelId="us.anthropic.claude-sonnet-5-5",  # Sonnet 5.5 has no in-region ID — call it through an inference profile
    messages=[{"role": "user", "content": [{"text": "Summarise this PR"}]}],
    system=[{"text": "You are a senior reviewer. Be concise."}],
    # No temperature/topP: non-default sampling params return 400 on the Claude 5 family
    inferenceConfig={"maxTokens": 1024},
)
text = response["output"]["message"]["content"][0]["text"]
```

```javascript
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: "us-east-1" });
const out = await client.send(new ConverseCommand({
  modelId: "us.anthropic.claude-sonnet-5-5",
  messages: [{ role: "user", content: [{ text: "Summarise this PR" }] }],
  // No temperature/topP: non-default sampling params return 400 on the Claude 5 family
  inferenceConfig: { maxTokens: 1024 },
}));
```

Use `ConverseStream` for token-by-token streaming. The event shape is the
same across providers — switching models is a `modelId` change, nothing else.

## Model IDs and Inference Profiles

Bedrock model IDs come in two flavours:

- **Foundation model ARN/ID** — `anthropic.claude-sonnet-5-5`
  (region-bound; only callable in regions where the model is hosted).
- **Cross-region inference profile** — `us.anthropic.claude-sonnet-5-5`
  (`us.*`, `eu.*`, `apac.*`, `global.*`). Routes across AZs/regions for higher
  availability and throughput. **Default to inference profiles** in production
  unless data residency forbids it. Regional/multi-region endpoints carry a 10%
  premium over `global.*`.

Current Claude IDs: `anthropic.claude-opus-5-5`, `anthropic.claude-fable-5-1`,
`anthropic.claude-sonnet-5-5`, `anthropic.claude-haiku-5-5` —
e.g. `global.anthropic.claude-opus-5-5`, `global.anthropic.claude-fable-5-1`,
`global.anthropic.claude-sonnet-5-5`, `global.anthropic.claude-haiku-5-5`
(Sonnet 5.5 and Haiku 5.5 have no in-region ID — use a `us.`/`eu.`/`global.` profile).
Haiku 5.5 bills prompts over 100K tokens at 5× its base rate; keep high-volume calls under that.
The previous Haiku generation is `anthropic.claude-haiku-4-5-20251001-v1:0`. Opus 5.5 / Fable 5.1 reject forced
`toolChoice` (`any`/`tool`) and disabled thinking — see `claude-api` for the
full breaking-change table.

Fast mode is not available on Bedrock.

```python
# Cross-region profile — recommended default
modelId = "us.anthropic.claude-sonnet-5-5"
```

Each region has different model availability — check `ListFoundationModels` before assuming.

## Tool Use (Function Calling)

```python
tools = [{
    "toolSpec": {
        "name": "get_order_status",
        "description": "Look up the status of a customer order by order ID.",
        "inputSchema": {"json": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"],
        }},
    },
}]

response = client.converse(modelId=modelId, messages=messages, toolConfig={"tools": tools})

if response["stopReason"] == "tool_use":
    for block in response["output"]["message"]["content"]:
        if "toolUse" in block:
            tu = block["toolUse"]
            result = run_local(tu["name"], tu["input"])
            messages.append(response["output"]["message"])
            messages.append({"role": "user", "content": [{
                "toolResult": {"toolUseId": tu["toolUseId"], "content": [{"json": result}]}
            }]})
            # call converse again with updated messages
```

Tool schemas are JSON Schema. Keep them tight — the model leans on the description as much as the schema; ambiguous descriptions cause hallucinated args.

## Prompt Caching

For Claude on Bedrock, cache stable prefixes (system prompt, large docs):

```python
response = client.converse(
    modelId=modelId,
    system=[{"text": LARGE_SYSTEM_PROMPT, "cachePoint": {"type": "default"}}],
    messages=messages,
)
```

Cache hits are 10% of input cost (5% on Opus 5.5, 2.5% on Fable 5.1); misses
cost a 25% premium. Worth it for any
prompt > ~2k tokens that gets reused.

## Knowledge Bases (Managed RAG)

Bedrock Knowledge Bases handle ingestion → chunking → embedding → vector storage → retrieval → grounded generation in one managed flow.

```python
agent_runtime = boto3.client("bedrock-agent-runtime")

response = agent_runtime.retrieve_and_generate(
    input={"text": "What is our refund policy?"},
    retrieveAndGenerateConfiguration={
        "type": "KNOWLEDGE_BASE",
        "knowledgeBaseConfiguration": {
            "knowledgeBaseId": "ABCDEFGHIJ",
            "modelArn": "us.anthropic.claude-sonnet-5-5",
        },
    },
)
```

Use it for a fast prototype (OpenSearch Serverless / Aurora pgvector backed, no infra to babysit). Roll your own with `Retrieve` + `Converse` when you need custom chunking or hybrid retrieval.

## Guardrails

Pre/post filters for PII, profanity, denied topics, contextual grounding, prompt-injection detection. Model-agnostic — the same guardrail works across Claude / Llama / Nova.

```python
response = client.converse(
    modelId=modelId,
    messages=messages,
    guardrailConfig={"guardrailIdentifier": "abc123", "guardrailVersion": "1", "trace": "enabled"},
)
```

The contextual grounding filter (RAG hallucination check) is the most useful one in practice.

## Embeddings

```python
response = client.invoke_model(
    modelId="amazon.titan-embed-text-v2:0",
    body=json.dumps({"inputText": text, "dimensions": 1024, "normalize": True}),
)
vec = json.loads(response["body"].read())["embedding"]
```

- **Titan Text Embeddings v2** — 1024/512/256 dim, multilingual, cheap default.
- **Cohere Embed v3** — better English retrieval; supports `input_type` (`search_query` vs `search_document`).

Use `InvokeModel` for embeddings — Converse is text-generation only.

## Pricing Discipline

- **On-demand** for spiky / experimental workloads.
- **Provisioned Throughput** only when you've measured a steady RPS that
  justifies the hourly commit (math: monthly commit / on-demand cost at that
  RPS). Most teams overprovision.
  Buying it is a commitment billed by the hour: show the RPS evidence, model
  units, term, and monthly cost, and let the user buy it. Do not call
  `CreateProvisionedModelThroughput` yourself.
- **Batch inference** for non-interactive jobs — 50% cheaper than on-demand,
  hours-scale latency.
- Tag `bedrock-runtime` invocations via the `applicationId` field in
  `requestMetadata` (CloudTrail) to attribute spend per feature.
- CloudWatch metrics: `Invocations`, `InputTokenCount`, `OutputTokenCount`,
  `InvocationThrottles`. Alarm on throttles before they bite.

## Networking

- **VPC interface endpoint** (`com.amazonaws.<region>.bedrock-runtime`) for private-subnet workloads — avoids NAT egress, keeps traffic in AWS.
- **PrivateLink** with the same endpoint name — no public DNS required.
- KMS-encrypted requests via custom CMK if compliance requires customer-managed keys.

## Common Pitfalls

- **Region mismatch** — model not available throws `AccessDeniedException` with a misleading message. Check `ListFoundationModels` for the region.
- **Old model IDs** — pin via inference profile, not bare model ID, to absorb minor version bumps.
- **Streaming + tool use** — partial JSON in tool args; buffer the full `toolUse` block before parsing.
- **Throttling** — default quotas are low; request increases before launch.
- **PII in CloudWatch logs** — disable model invocation logging in compliance environments, or route through a KMS-encrypted destination only.

## Related

- `aws-cloud` — IAM, VPC endpoints, CloudWatch
- `claude-api` — when to call Anthropic directly instead
- `cost-aware-llm-pipeline` — caching, batching, model routing
