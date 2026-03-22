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

## Registering in Manifests

### 1. Add module to `manifests/install-modules.json`

```json
{
  "id": "steering-my-skill",
  "description": "My skill description",
  "sources": [
    { "from": "skills/my-skill/SKILL.md", "output": "my-skill.md", "inclusion": "manual" }
  ],
  "outputDir": ".kiro/steering",
  "defaultInstall": false
}
```

For multi-file skills, add each file as a separate source entry.

### 2. Add module to profiles in `manifests/install-profiles.json`

Add `"steering-my-skill"` to the `modules` array of relevant profiles.

### 3. Install and verify

```bash
node install.js --modules steering-my-skill
node install.js --status
```

## Best Practices

- One skill per domain concept (don't mix Django and Flask in one skill)
- Include concrete code examples, not just abstract guidelines
- Add checklists where applicable
- Keep language-agnostic where possible, or clearly state the target language
- Use tables for quick-reference mappings
- Test the skill by loading it in Kiro chat with `#` and verifying it provides useful context
