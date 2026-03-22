---
name: coding-standards
description: Universal coding standards and best practices for software development.
origin: harness
---

# Coding Standards & Best Practices

## When to Activate

- Starting a new project or module
- Reviewing code for quality and maintainability
- Refactoring existing code to follow conventions
- Onboarding new contributors to coding conventions

## Core Principles

### Readability First
- Code is read more often than written
- Clear variable and function names over comments
- Consistent formatting across the codebase

### Simplicity
- Simplest solution that works
- Avoid over-engineering and premature optimization
- Add complexity only when needed, not speculatively

### Don't Repeat Yourself
- Extract common logic into functions when used 3+ times
- Share utilities across modules
- But: three similar lines are better than a premature abstraction

## Naming Conventions

Use descriptive names that reveal intent:

```
// WRONG: Unclear names
const q = 'election'
const flag = true
function process(d) { }

// CORRECT: Descriptive names
const searchQuery = 'election'
const isAuthenticated = true
function processOrder(order) { }
```

Functions should use verb-noun patterns: `fetchUsers`, `calculateTotal`, `isValidEmail`.

## Function Design

- Each function should have a single clear purpose
- Use early returns to avoid deep nesting
- Limit parameters (3-4 max; use an options object for more)

```
// WRONG: Deep nesting
function processUsers(users) {
  if (users) {
    for (const user of users) {
      if (user.active) {
        if (user.email) {
          // do something
        }
      }
    }
  }
}

// CORRECT: Early returns, flat structure
function processUsers(users) {
  if (!users) return []
  return users
    .filter(user => user.active && user.email)
    .map(user => transform(user))
}
```

## Error Handling

- Handle errors at the appropriate level -- not too early, not too late
- Use typed/structured errors when callers need to distinguish error kinds
- Log at the boundary, not at every level
- Never silently swallow errors in production code

## Immutability

Prefer immutable operations where the language supports it:
- Use spread/copy instead of direct mutation
- Use `const`/`final`/`val` by default
- Mutate only when performance requires it, and document why

## API Design

### REST Conventions
```
GET    /api/resources          # List
GET    /api/resources/:id      # Get one
POST   /api/resources          # Create
PUT    /api/resources/:id      # Full update
PATCH  /api/resources/:id      # Partial update
DELETE /api/resources/:id      # Delete
```

### Response Format
Use a consistent envelope:
- Success/status indicator
- Data payload (nullable on error)
- Error details on failure (code, message, field errors)
- Pagination metadata for collections

### Input Validation
Validate all external input at the API boundary using schema validation (Zod, Pydantic, etc.). Never trust client-provided data.

## File Organization

- Group by domain/feature, not by file type
- Keep files focused -- one module/component per file
- Co-locate tests with source code or in a parallel `tests/` directory

## Comments

```
// WRONG: Stating the obvious
count++ // Increment counter by 1

// CORRECT: Explain WHY, not WHAT
// Use exponential backoff to avoid overwhelming the API during outages
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
```

## Code Smells

Watch for and address:
- **Deep nesting** (>4 levels) -- use early returns or extract functions
- **Long functions** -- split by responsibility
- **Magic numbers** -- extract named constants
- **Dead code** -- delete it; version control remembers
- **Copy-paste code** -- extract shared logic (after the third occurrence)

## Testing Standards

### Test Structure (Arrange-Act-Assert)

```
test('calculates similarity correctly', () => {
  // Arrange
  const vectorA = [1, 0, 0]
  const vectorB = [0, 1, 0]

  // Act
  const result = cosineSimilarity(vectorA, vectorB)

  // Assert
  expect(result).toBe(0)
})
```

### Test Naming

Use descriptive names that explain the scenario:

```
// WRONG
test('works', () => { })

// CORRECT
test('returns empty array when no results match query', () => { })
test('throws error when API key is missing', () => { })
```
