---
name: claude-api
description: Anthropic Claude API patterns for Python and TypeScript. Covers Messages API, streaming, tool use, vision, extended thinking, batches, prompt caching, and Claude Agent SDK. Use when building applications with the Claude API or Anthropic SDKs.
origin: harness
workloads: [ai]
---

# Claude API

Build applications with the Anthropic Claude API and SDKs.

## When to Activate

- Building applications that call the Claude API
- Code imports `anthropic` (Python) or `@anthropic-ai/sdk` (TypeScript)
- User asks about Claude API patterns, tool use, streaming, or vision
- Implementing agent workflows with Claude Agent SDK
- Optimizing API costs, token usage, or latency

## Model Selection

| Model | ID | Best For |
|-------|-----|----------|
| Fable 5.1 | `claude-fable-5-1` | Frontier long-horizon agents — $10/$50, cache read 0.025×, default effort `high`, 1M ctx, 128k out (~2.5× Opus 5.5 per token) |
| Opus 5.5 | `claude-opus-5-5` | Complex reasoning, architecture, agentic coding — $4/$20, cache read 0.05×, default effort **`medium`**, 1M ctx, 128k out |
| Sonnet 5.5 | `claude-sonnet-5-5` | Balanced coding, most development tasks — $2/$10 |
| Haiku 4.5 | `claude-haiku-4-5` | Fast responses, high-volume, cost-sensitive — $1/$5 |
| Opus 5 / Opus 4.8 (legacy) | `claude-opus-5` / `claude-opus-4-8` | Refusal fallback targets (Fable 5.1 falls back to these); workloads not yet migrated — $5/$25 |
| Fable 5 (legacy) | `claude-fable-5` | Superseded by Fable 5.1 (same price, cache read 0.1×) |

Default to Opus 5.5 unless the task needs speed/cost optimization (Sonnet/Haiku). IDs from the 4.6 generation onward (`claude-opus-5-5`, `claude-sonnet-5-5`) are pinned snapshots — no date suffix exists or is needed. On Opus 5 / Sonnet 5.x / Fable 5: thinking is adaptive by default, `budget_tokens` and non-default `temperature`/`top_p`/`top_k` return 400, and assistant prefill is rejected. Handle `stop_reason: "refusal"` on Opus 5.5 / Fable 5.1 (safety classifiers), ideally with the server-side `fallbacks` beta.

**Set `effort` explicitly and re-sweep on migration.** Opus 5.5 defaults to `medium` (Opus 5 defaulted to `high`), and level names don't mean the same amount of thinking across models: Opus 5.5 `medium` matches or beats Opus 5 `high` on coding/knowledge evals, and at any given level it thinks *more* per turn — most of all at `xhigh`/`max`. Reserve `xhigh`/`max` for work with a measured gain, and leave room in `max_tokens` (thinking counts toward it; 128k works for long agentic turns). **Sonnet 5.5** defaults to `high` and its levels are recalibrated vs Sonnet 5 (re-sweep, don't carry the old setting): `medium` for well-specified agentic coding, `high` for harder/longer work, `medium`/`low` for latency-sensitive chat. At `low`/`medium` it may stop to check in mid-task or skip verification; at every level it tends to add unrequested tests/docs.

### Opus 5.5 / Fable 5.1 / Sonnet 5.5 breaking changes

| Change | Applies to | Fix |
|--------|-----------|-----|
| Forced tool use: `tool_choice` `{"type":"any"}` / `{"type":"tool",...}` → 400 | Opus 5.5, Fable 5.1, Sonnet 5.5 | Keep `auto`; add `strict: true` (strict tool use) or use structured outputs; say in the prompt when a tool applies |
| `thinking: {"type":"disabled"}` or `{"type":"enabled","budget_tokens":N}` → 400 | Opus 5.5 (Fable already); Sonnet 5.5: `disabled` → use `between_tools` | Omit `thinking` or send `{"type":"adaptive"}`; lower `effort` where you used to disable thinking. Sonnet 5.5 only: `{"type":"between_tools"}` turns off up-front thinking (effort `high` or below; 400 at `xhigh`/`max`, and with `display`/`budget_tokens`/per-message effort) |
| Non-default `temperature`/`top_p`/`top_k`, assistant prefill → 400 | Fable 5.1 (unchanged from Fable 5) | Drop sampling params; steer via prompt/structured outputs |
| Thinking blocks bound to model + conversation | Opus 5.5, Fable 5.1, Sonnet 5.5 | Keep history **append-only**; change instructions/tools via mid-conversation system messages, not edits. Opus 5.5 → Fable 5.1 keeps reasoning; the reverse (and other switches) drops it. Beta `thinking-binding-controls-2026-08-01` + `thinking.block_binding.prefix_mismatch_behavior: "drop_block"` drops instead of 400 and reports it in `input_transformations` |
| `computer_20251124` → 400 | Opus 5.5, Sonnet 5.5 (Claude API / Google Cloud; Bedrock still accepts it) | Migrate to `computer_toolset_20260801` |
| Text between tool calls arrives as `thinking` blocks, empty at default `display: "omitted"` | Opus 5.5, Fable 5.1, Sonnet 5.5 | Select blocks by `type`, not position; set `display: "updates"` (beta `thinking-display-updates-2026-08-18`) to get readable progress notes |

**New betas (both models):** per-message effort — a `role: "system"` message carrying `output_config.effort` (beta `mid-conversation-output-config-2026-07-01`) changes depth without a cache miss, whereas changing top-level `effort` invalidates the cache; turn-scoped system messages via `clear_at: "next_user_message"` (beta `mid-conversation-system-clear-at-2026-08-21`) for per-turn reminders; inline tool definitions in system messages (`inline-tools-2026-09-15`); compaction on demand (`compact-2026-09-04`). Minimum cacheable prompt is 512 tokens.

**Refusals:** Opus 5.5 runs biology, cybersecurity, and `reasoning_extraction` classifiers — don't prompt it to write its reasoning into the response (read `display: "summarized"` thinking instead); `fallbacks: "default"` does not retry `reasoning_extraction` declines. Fable 5.1's permitted fallback targets are Opus 4.8 and Opus 5. **Fast mode:** Opus 5.5 at $8/$40, Claude API only.

## Python SDK

### Installation

```bash
pip install anthropic
```

### Basic Message

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Explain async/await in Python"}
    ]
)
# Claude 5 models may open with a thinking block — select by type, not position
print(next(b.text for b in message.content if b.type == "text"))
```

### Streaming

```python
with client.messages.stream(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Write a haiku about coding"}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

### System Prompt

```python
message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    system="You are a senior Python developer. Be concise.",
    messages=[{"role": "user", "content": "Review this function"}]
)
```

## TypeScript SDK

### Installation

```bash
npm install @anthropic-ai/sdk
```

### Basic Message

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const message = await client.messages.create({
  model: "claude-sonnet-5-5",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Explain async/await in TypeScript" }
  ],
});
// Claude 5 models may open with a thinking block — select by type, not position
const text = message.content.find((b) => b.type === "text");
console.log(text?.type === "text" ? text.text : "");
```

### Streaming

```typescript
const stream = client.messages.stream({
  model: "claude-sonnet-5-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Write a haiku" }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}
```

## Tool Use

Define tools and let Claude call them:

```python
tools = [
    {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["location"]
        }
    }
]

message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "What's the weather in SF?"}]
)

# Handle tool use response
for block in message.content:
    if block.type == "tool_use":
        # Execute the tool with block.input
        result = get_weather(**block.input)
        # Send result back
        follow_up = client.messages.create(
            model="claude-sonnet-5-5",
            max_tokens=1024,
            tools=tools,
            messages=[
                {"role": "user", "content": "What's the weather in SF?"},
                {"role": "assistant", "content": message.content},
                {"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": block.id, "content": str(result)}
                ]}
            ]
        )
```

## Vision

Send images for analysis:

```python
import base64

with open("diagram.png", "rb") as f:
    image_data = base64.standard_b64encode(f.read()).decode("utf-8")

message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_data}},
            {"type": "text", "text": "Describe this diagram"}
        ]
    }]
)
```

## Extended Thinking

For complex reasoning tasks. On Sonnet 5.x / Opus 5 / Fable 5 thinking is adaptive
(the old `budget_tokens` form returns 400; on Opus 5.5 / Fable 5.1 thinking can't be
disabled at all); control depth with `output_config.effort`:

```python
message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000
    },
    messages=[{"role": "user", "content": "Solve this math problem step by step..."}]
)

for block in message.content:
    if block.type == "thinking":
        print(f"Thinking: {block.thinking}")
    elif block.type == "text":
        print(f"Answer: {block.text}")
```

## Prompt Caching

Cache large system prompts or context to reduce costs:

```python
message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    system=[
        {"type": "text", "text": large_system_prompt, "cache_control": {"type": "ephemeral"}}
    ],
    messages=[{"role": "user", "content": "Question about the cached context"}]
)
# Check cache usage
print(f"Cache read: {message.usage.cache_read_input_tokens}")
print(f"Cache creation: {message.usage.cache_creation_input_tokens}")
```

## Batches API

Process large volumes asynchronously at 50% cost reduction:

```python
import time

batch = client.messages.batches.create(
    requests=[
        {
            "custom_id": f"request-{i}",
            "params": {
                "model": "claude-sonnet-5-5",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}]
            }
        }
        for i, prompt in enumerate(prompts)
    ]
)

# Poll for completion
while True:
    status = client.messages.batches.retrieve(batch.id)
    if status.processing_status == "ended":
        break
    time.sleep(30)

# Get results
for result in client.messages.batches.results(batch.id):
    content = result.result.message.content
    print(next(b.text for b in content if b.type == "text"))
```

## Claude Agent SDK

Build multi-step agents:

```python
# Note: Agent SDK API surface may change — check official docs
import anthropic

# Define tools as functions
tools = [{
    "name": "search_codebase",
    "description": "Search the codebase for relevant code",
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"]
    }
}]

# Run an agentic loop with tool use
client = anthropic.Anthropic()
messages = [{"role": "user", "content": "Review the auth module for security issues"}]

while True:
    response = client.messages.create(
        model="claude-sonnet-5-5",
        max_tokens=4096,
        tools=tools,
        messages=messages,
    )
    # Opus 5.5 can end a turn with a text-only progress report while work is
    # still owed — in unattended loops, check a task checklist before breaking
    # and cap automatic continuations at 2-3.
    if response.stop_reason == "end_turn":
        break
    # Handle tool calls and continue the loop
    messages.append({"role": "assistant", "content": response.content})
    # ... execute tools and append tool_result messages
```

## Cost Optimization

| Strategy | Savings | When to Use |
|----------|---------|-------------|
| Prompt caching | Up to 90% on cached tokens (95% on Opus 5.5, 97.5% on Fable 5.1) | Repeated system prompts or context |
| Batches API | 50% | Non-time-sensitive bulk processing |
| Haiku instead of Sonnet | ~50% (Haiku 4.5 $1/$5 vs Sonnet 5.5 $2/$10) | Simple tasks, classification, extraction |
| Shorter max_tokens | Variable | When you know output will be short |
| Streaming | None (same cost) | Better UX, same price |

## Error Handling

```python
import time

from anthropic import APIError, RateLimitError, APIConnectionError

try:
    message = client.messages.create(...)
except RateLimitError:
    # Back off and retry
    time.sleep(60)
except APIConnectionError:
    # Network issue, retry with backoff
    pass
except APIError as e:
    print(f"API error {e.status_code}: {e.message}")
```

## Environment Setup

```bash
# Required
export ANTHROPIC_API_KEY="your-api-key-here"

# Optional: set default model
export ANTHROPIC_MODEL="claude-opus-5-5"
```

Never hardcode API keys. Always use environment variables.
