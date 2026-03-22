---
name: tdd-workflow
description: Test-driven development workflow for writing features, fixing bugs, or refactoring code with comprehensive test coverage.
origin: harness
---

# Test-Driven Development Workflow

## When to Activate

- Writing new features or functionality
- Fixing bugs (write a failing test first, then fix)
- Refactoring existing code (ensure tests exist before changing)
- Adding API endpoints or service logic

## TDD Cycle

### 1. Write a Failing Test

Define expected behavior before writing implementation:

```
describe('calculateTotal', () => {
  it('sums item prices', () => {
    const items = [{ price: 10 }, { price: 20 }]
    expect(calculateTotal(items)).toBe(30)
  })

  it('returns 0 for empty list', () => {
    expect(calculateTotal([])).toBe(0)
  })

  it('ignores items with negative prices', () => {
    const items = [{ price: 10 }, { price: -5 }]
    expect(calculateTotal(items)).toBe(10)
  })
})
```

### 2. Run Tests (They Should Fail)

Verify the test fails for the right reason -- not a syntax error, but a missing or incorrect implementation.

### 3. Write Minimal Code to Pass

Implement just enough to make the tests green:

```
function calculateTotal(items) {
  return items
    .filter(item => item.price > 0)
    .reduce((sum, item) => sum + item.price, 0)
}
```

### 4. Refactor

With tests green, improve the code:
- Remove duplication
- Improve naming
- Simplify logic

Run tests after each change to ensure they stay green.

### 5. Verify Coverage

Run coverage to identify gaps. Focus on business logic, not boilerplate.

## When TDD Helps Most

- **Well-defined requirements** -- You know the expected inputs and outputs
- **Bug fixes** -- Reproduce the bug as a test, then fix it
- **Pure functions** -- Input/output mapping is clear
- **API endpoints** -- Request/response contracts are explicit

## When Test-After Is Fine

- Exploratory or prototype code
- UI layout and styling
- Rapidly evolving requirements where the API is still settling

## Test Types

### Unit Tests
- Individual functions and methods
- Fast, isolated, no external dependencies
- Mock external services and databases

### Integration Tests
- API endpoints with real or test databases
- Service-to-service interactions
- File system or network operations

### E2E Tests
- Critical user flows only
- Login, checkout, data submission
- Use sparingly -- they are slow and brittle

## Testing Patterns

### Arrange-Act-Assert

```
test('rejects expired tokens', () => {
  // Arrange
  const token = createToken({ expiresAt: pastDate })

  // Act
  const result = validateToken(token)

  // Assert
  expect(result.valid).toBe(false)
  expect(result.reason).toBe('expired')
})
```

### Test Isolation

Each test sets up its own data. Tests must not depend on execution order:

```
test('creates user', () => {
  const user = createTestUser()
  expect(user.id).toBeDefined()
})

test('updates user', () => {
  const user = createTestUser()  // own setup, not reusing previous test
  const updated = updateUser(user.id, { name: 'New' })
  expect(updated.name).toBe('New')
})
```

### Mocking External Services

Mock at the boundary, not deep inside the implementation:

```
// Mock the HTTP client, not internal functions
jest.mock('./httpClient', () => ({
  get: jest.fn(() => Promise.resolve({ data: mockData }))
}))
```

## Common Mistakes

- **Testing implementation details** -- Test behavior (what users see), not internal state
- **Brittle selectors** -- Use semantic selectors (`role`, `label`, `testid`) over CSS classes
- **Tests that depend on order** -- Each test must be independently runnable
- **Ignoring edge cases** -- Test empty inputs, null values, boundary conditions, error paths

## Coverage Guidance

- Focus on business logic, not getters/setters or boilerplate
- Aim for meaningful coverage, not a number -- 70% of critical paths > 95% of trivial code
- Use coverage reports to find blind spots, not as a score to maximize
