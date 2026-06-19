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
    modelId="us.anthropic.claude-sonnet-4-6-20260101-v1:0",
    messages=[{"role": "user", "content": [{"text": "Summarise this PR"}]}],
    system=[{"text": "You are a senior reviewer. Be concise."}],
    inferenceConfig={"maxTokens": 1024, "temperature": 0.2},
)
text = response["output"]["message"]["content"][0]["text"]
```

Use `ConverseStream` for token-by-token streaming. The event shape is the same across providers — switching models is a `modelId` change, nothing else.

## Model IDs and Inference Profiles

- **Foundation model ID** — `anthropic.claude-sonnet-4-6-...` (region-bound; only callable where the model is hosted).
- **Cross-region inference profile** — `us.anthropic.claude-sonnet-4-6-...` (`us.*`, `eu.*`, `apac.*`). Routes across AZs/regions for higher availability and throughput. **Default to inference profiles** in production unless data residency forbids it.

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

Cache hits are ~10% of input cost; misses cost a premium. Worth it for any reused prompt prefix over ~2k tokens.

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
            "modelArn": "us.anthropic.claude-sonnet-4-6-20260101-v1:0",
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
- **Provisioned Throughput** only when measured steady RPS justifies the hourly commit. Most teams overprovision.
- **Batch inference** for non-interactive jobs — cheaper than on-demand, hours-scale latency.
- Tag invocations via `requestMetadata.applicationId` (CloudTrail) to attribute spend per feature.
- CloudWatch: alarm on `InvocationThrottles` before they bite.

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
