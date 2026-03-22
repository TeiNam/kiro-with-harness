# Coding Style Rules

## Immutability (CRITICAL)

Always create new objects; never mutate existing ones:

```
// Pseudocode
Wrong:   modify(original, field, value) → mutates the original directly
Correct: update(original, field, value) → returns a new modified copy
```

Immutable data prevents hidden side effects, simplifies debugging, and enables safe concurrency.

## File Organization

Many small files > few large files:
- High cohesion, low coupling
- Typically 200–400 lines, max 800 lines
- Extract utilities from large modules
- Organize by feature/domain, not by type

## Functions

- Small, focused, and meaningfully named
- Under 50 lines each
- Comment only non-obvious code

## Error Handling

Always handle errors comprehensively:
- Handle errors explicitly at every level
- Provide user-friendly error messages in UI code
- Log detailed error context on the server side
- Never silently swallow errors

## Input Validation

Always validate at system boundaries:
- Validate all user input before processing
- Use schema-based validation when possible
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file contents)

## Code Quality Checklist

Verify before completing work:
- [ ] Code is readable with well-chosen names
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling in place
- [ ] No hardcoded values (use constants or config)
- [ ] No mutations (use immutable patterns)
- [ ] No commented-out code, console.log, or print statements
