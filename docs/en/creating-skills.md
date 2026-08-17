# Creating Custom Skills

Skills are markdown files that provide domain knowledge to Kiro as manual-inclusion steering. This guide covers how to create a new skill and register it in the harness.

## Skill Structure

```
skills/
└── my-skill/
    └── SKILL.md          # Required: main skill file
    └── sub-topic.md      # Optional: additional files for large skills
```

Minimum requirement is a single `SKILL.md` file in a named directory under `skills/`.

## SKILL.md Format

```markdown
# Skill Name

Brief description of what this skill provides.

## When to Use

- Scenario 1
- Scenario 2

## Guidelines

Your domain knowledge, patterns, checklists, code examples, etc.
```

Keep each file under 400 lines. For large skills, split into multiple files (see FastAPI skill as example with 7 sub-files).

## Inclusion Types

| Type | Front-matter | Loaded when |
|------|-------------|-------------|
| manual (default) | `inclusion: manual` or none | User adds via `#` in Kiro chat |
| always | `inclusion: always` | Every session automatically |
| fileMatch | `inclusion: fileMatch` + `fileMatchPattern: '*.py'` | Matching file is opened |

Most skills should be `manual` to avoid bloating context.

## Registering a Skill

Skills are selected by their `workloads:` frontmatter — there is **no manifest to edit**. Add a frontmatter block at the top of `SKILL.md`:

```markdown
---
name: my-skill
description: >
  What the skill does, plus trigger keywords so the agent (and auto-inclusion) knows when to load it.
origin: custom
workloads: [cloud]      # one or more workload keys; [core] installs everywhere
---
```

- The installer selects a skill when its `workloads:` intersects the active workloads (`--workload ...`). `core` is always installed.
- Valid workload keys: see the README Workloads table (python, rust, …, cloud, frontend, mongodb, dynamodb, writing, ai-agent, …).
- No frontmatter? `scripts/lib/tag-assets.js` heuristics fall back to a best-guess classification — but explicit tags are preferred. Bulk re-tag with `node scripts/lib/tag-assets.js` if needed.
- **CLI tier** ships the skill directory as-is (loaded via `skill://`, progressive). **IDE tier** converts `SKILL.md` into a `inclusion: manual` steering file automatically.

### Install and verify

```bash
node install.js ide --workload cloud --dry-run   # preview which skills are selected
node install.js ide --workload cloud             # install
```

## Best Practices

- One skill per domain concept (don't mix Django and Flask in one skill)
- Include concrete code examples, not just abstract guidelines
- Add checklists where applicable
- Keep language-agnostic where possible, or clearly state the target language
- Use tables for quick-reference mappings
- Test the skill by loading it in Kiro chat with `#` and verifying it provides useful context
