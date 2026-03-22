# Testing Rules

## Minimum Test Coverage: 70% on Critical Paths

Test types (all required):
1. **Unit Tests** — Core business logic, individual functions, utilities
2. **Integration Tests** — API endpoints, key user flows, database operations
3. **E2E Tests** — Core user flows (choose framework per language)

No throwaway terminal tests — always write proper test code, delete after confirmed passing.

## TDD Workflow (Required)

1. Write the test first (RED)
2. Run the test — it must fail
3. Write minimal implementation (GREEN)
4. Run the test — it must pass
5. Refactor (IMPROVE)
6. Verify coverage (70%+)

## Required Edge Cases to Test

1. **Null/Undefined** input
2. **Empty** arrays/strings
3. **Wrong type** passed
4. **Boundary values** (min/max)
5. **Error paths** (network failure, DB errors)
6. **Race conditions** (concurrent operations)
7. **Large data** (10k+ items performance)
8. **Special characters** (Unicode, emoji, SQL characters)

## Test Anti-Patterns (Avoid)

- Testing implementation details (internal state) instead of behavior
- Tests that depend on each other (shared state)
- Too few assertions (passing tests that verify nothing)
- Not mocking external dependencies

## Test Quality Checklist

- [ ] Unit tests for all public functions
- [ ] Integration tests for all API endpoints
- [ ] E2E tests for core user flows
- [ ] Edge cases covered (null, empty, invalid)
- [ ] Error paths tested (not just happy path)
- [ ] Mocking used for external dependencies
- [ ] Tests are independent (no shared state)
- [ ] Assertions are specific and meaningful
- [ ] Coverage 70%+ on critical paths

## Test Best Practices

1. **Write tests first** — Always TDD
2. **One assertion per test** — Focus on a single behavior
3. **Descriptive test names** — Describe what is being tested
4. **Arrange-Act-Assert** — Clear test structure
5. **Mock external dependencies** — Isolate unit tests
6. **Test edge cases** — null, undefined, empty, large
7. **Test error paths** — Not just happy path
8. **Keep tests fast** — Unit tests under 50ms each
9. **Clean up after tests** — No side effects
10. **Review coverage reports** — Identify gaps
