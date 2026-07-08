---
name: mcp-builder
description: Scaffold and harden Model Context Protocol (MCP) servers from a capability spec — choose stdio vs HTTP transport, define tools/resources/prompts, validate inputs, and register the server with Kiro. Use when the user wants to build, wrap an API as, or debug an MCP server.
origin: harness
workloads: [ai-agent]
---

# MCP Builder

Build Model Context Protocol servers that expose tools, resources, and prompts to Kiro and other MCP clients. MCP is the integration lingua franca — a well-built server turns any API or local capability into an agent tool.

## When to Activate

- The user wants to expose an internal API, database, or local capability as agent tools.
- Building a new MCP server, or debugging one that fails to register/connect.
- Deciding transport (stdio vs streamable HTTP) or structuring tools/resources/prompts.

## Decision: Transport

- **stdio** — default for local, single-user servers launched by the client (Kiro spawns the process). Simplest; no network surface.
- **streamable HTTP** — for remote/shared servers or when multiple clients connect. Requires auth and network hardening.

## Minimal Server (Python, official `mcp` SDK — FastMCP)

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather")

@mcp.tool()
def get_forecast(city: str) -> str:
    """Return today's forecast for a city. Validate input at the boundary."""
    if not city.strip():
        raise ValueError("city must be non-empty")
    return f"Sunny in {city}"

if __name__ == "__main__":
    mcp.run()   # stdio transport by default
```

TypeScript equivalent: `@modelcontextprotocol/sdk` with `McpServer` + `server.tool(name, schema, handler)` and `StdioServerTransport`.

## Primitives

- **Tools** — model-invoked actions (side effects allowed). Give each a precise name + description; the description is the model's only guide to when to call it.
- **Resources** — read-only context the client can load (files, records) via URI.
- **Prompts** — reusable prompt templates the user can invoke.

## Registering with Kiro

Add to `mcp.json` (`~/.kiro/settings/mcp.json` global, or `.kiro/settings/mcp.json` per project):
```json
{ "mcpServers": { "weather": { "command": "python", "args": ["server.py"], "disabled": false } } }
```

## Gotchas (encode these)

- **Tool descriptions are the API.** Vague descriptions cause wrong/missed tool calls. State what it does and when to use it, like a skill description.
- **Validate every tool input at the boundary** — MCP inputs are untrusted; never interpolate them into shell/SQL. Use parameterized queries and allow-lists.
- **Never log or return secrets.** Load credentials from env, not arguments.
- **HTTP transport needs auth + origin checks** before exposure. Do not ship an unauthenticated network MCP server.
- **Test with the MCP Inspector** (`npx @modelcontextprotocol/inspector`) before wiring into Kiro; verify each tool round-trips.
- **Keep the tool surface small.** A handful of sharp tools beats dozens of overlapping ones — it reduces the model's selection errors.

## Reference

See existing `mcp-server-patterns` for deeper patterns, and `mcp-configs/mcp-servers.json` for the harness's curated catalog format.
