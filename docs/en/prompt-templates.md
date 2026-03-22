# Prompt Templates Guide

Reusable prompt patterns for common Kiro workflows. Copy, customize, and use.

## Template Categories

### 1. New Feature
```
Implement [feature] using [tech stack].

Requirements:
- [requirement 1]
- [requirement 2]

Acceptance criteria:
- [ ] [criterion 1]
- [ ] [criterion 2]

Do NOT:
- [scope boundary 1]
- [scope boundary 2]
```

### 2. Bug Fix
```
Fix: [describe the bug]

Current behavior: [what happens now]
Expected behavior: [what should happen]
Steps to reproduce: [1, 2, 3]

Root cause analysis needed before fixing.
Write a failing test first, then fix.
```

### 3. Code Review
```
Review the recent changes for:
1. Security issues (OWASP Top 10)
2. Error handling completeness
3. Type safety
4. Performance concerns
5. Test coverage gaps

Report findings by severity: CRITICAL > HIGH > MEDIUM > LOW.
Only report issues with >80% confidence.
```

### 4. Refactoring
```
Refactor [module/file] to:
- [improvement 1]
- [improvement 2]

Constraints:
- No behavior changes
- All existing tests must pass
- Keep backward compatibility
```

### 5. Architecture Design
```
Design the architecture for [feature/system].

Include:
- Component diagram
- Data flow
- API contracts
- Trade-off analysis (pros/cons/alternatives)

Consider:
- Scalability to [N] users
- Security requirements
- Performance targets
```

### 6. Test Writing
```
Write tests for [module/function]:

Required:
- Unit tests for all public functions
- Edge cases: null, empty, invalid, boundary values
- Error paths: network failure, invalid input
- Target: 80%+ coverage

Use Arrange-Act-Assert pattern.
One assertion per test.
Mock external dependencies.
```

### 7. Database Schema
```
Design schema for [feature]:

Requirements:
- [data requirement 1]
- [data requirement 2]

Include:
- Table definitions with proper types
- Indexes for query patterns
- Foreign key constraints
- Migration script
```

### 8. API Endpoint
```
Add [METHOD] [path] endpoint:

Request: [body/params schema]
Response: [success schema]
Errors: [error cases and status codes]

Requirements:
- Input validation
- Authentication required
- Rate limiting
- Proper error messages (no internal details)
```

## Prompt Quality Checklist

Before submitting a prompt, verify:
- [ ] Clear task description
- [ ] Tech stack specified (or detectable)
- [ ] Acceptance criteria defined
- [ ] Scope boundaries set (what NOT to do)
- [ ] Error/edge cases mentioned
- [ ] Security requirements if applicable
- [ ] Testing expectations stated

## Tips

- Be specific: file paths, function names, exact behavior
- Set boundaries: what NOT to change is as important as what to change
- Include context: why this change is needed
- Define done: how to verify the task is complete
- One task per prompt: avoid combining unrelated work
