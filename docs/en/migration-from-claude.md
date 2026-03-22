# Migration from Claude Code to Kiro

Step-by-step guide for converting a Claude Code harness setup to Kiro IDE native format.

## Concept Mapping

| Claude Code | Kiro IDE | Notes |
|-------------|----------|-------|
| `CLAUDE.md` | `.kiro/steering/*.md` | Split into focused files by topic |
| `.claude/settings.json` | `.kiro/hooks/*.kiro.hook` | Event-driven hooks replace permission settings |
| `.claude/commands/` | Kiro custom agents | Agent markdown files |
| MCP config in Claude | `.kiro/settings/mcp.json` | Same MCP protocol, different config location |
| Project memory | Steering (always inclusion) | Persistent context across sessions |

## Step 1: Convert CLAUDE.md to Steering

Claude Code uses a single `CLAUDE.md` file. Kiro uses multiple focused steering files.

Split your `CLAUDE.md` by topic:

```
CLAUDE.md sections          →  .kiro/steering/ files
─────────────────────────────────────────────────────
Coding standards            →  coding-style.md (always)
Security rules              →  security.md (always)
Testing guidelines          →  testing.md (always)
Git workflow                →  git-workflow.md (always)
Framework-specific rules    →  framework-name.md (manual)
Project-specific context    →  project-context.md (always)
```

### Steering front-matter

```markdown
---
inclusion: always
---
# Coding Style Rules
...
```

Options: `always`, `manual`, or `fileMatch` with `fileMatchPattern`.

## Step 2: Convert Permissions to Hooks

Claude Code uses `settings.json` for tool permissions. Kiro uses hooks for pre/post tool checks.

Example: Claude's "deny write to docs/" becomes a pre-write hook:

```json
{
  "name": "Pre-Write Guard",
  "version": "1.0.0",
  "when": {
    "type": "preToolUse",
    "toolTypes": ["write"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "Check if this write follows project rules."
  }
}
```

## Step 3: Convert Commands to Agents

Claude Code slash commands (`/command`) map to Kiro custom agents in `agents/`.

Each agent is a markdown file with instructions. Reference them in Kiro's agent selector.

## Step 4: Move MCP Config

```bash
# Claude Code location
.claude/mcp.json

# Kiro location
.kiro/settings/mcp.json
```

The MCP server format is the same. Copy your server definitions and adjust paths if needed.

## Step 5: Install via Harness

Instead of manual conversion, use the harness installer:

```bash
# Install a profile that matches your project type
node install.js developer

# Or pick specific modules
node install.js --modules steering-core,hooks-core,mcp-catalog
```

## Key Differences

| Aspect | Claude Code | Kiro |
|--------|-------------|------|
| Context injection | Single CLAUDE.md | Multiple steering files with inclusion types |
| Tool control | Permission allow/deny lists | Event-driven hooks with agent prompts |
| Context loading | All at once | Selective (always, fileMatch, manual) |
| Automation | Bash hooks only | Agent hooks + shell commands |
| Skills | Not native | Manual-inclusion steering for on-demand knowledge |
