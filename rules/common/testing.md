# Testing Guidelines

## Running Tests

- **Never use `cd` to change directories before running tests** — always use the `cwd` parameter in executeBash instead
- Always verify the project root with `pwd` or use absolute paths when running test commands
- For Python projects: run `pytest` with `cwd` set to the project root, not with `cd && pytest`

## Coverage Targets

- Aim for 80%+ coverage on business logic, utilities, and critical paths
- Coverage is a guide, not a gate — untested edge cases matter more than a number
- New code should include tests; legacy code should gain tests as it's modified

## Test Types

Choose test types proportional to the risk and complexity of the code:
- **Unit Tests** — Individual functions, pure logic, utilities. Always write for non-trivial logic.
- **Integration Tests** — API endpoints, database operations, service interactions. Write for code that crosses boundaries.
- **E2E Tests** — Critical user flows only. High cost to maintain; reserve for happy paths and key workflows.

## Test-First When It Helps

TDD (Red → Green → Refactor) works well for:
- Well-defined requirements with clear inputs/outputs
- Bug fixes (write a failing test that reproduces the bug, then fix)
- Pure functions and utility libraries

Test-after is fine for:
- Exploratory/prototype code
- UI layout work where behavior is visual
- Code where requirements are still being discovered

## Test Quality

- Each test should have a single clear assertion (Arrange → Act → Assert)
- Tests must be independent — no shared mutable state between tests
- Mock external dependencies (APIs, databases, file system), not internal modules
- Name tests descriptively: `should return 404 when user not found`
- Test edge cases: null/empty inputs, boundary values, error paths, concurrent access

## Troubleshooting Test Failures

1. Check test isolation — does it pass when run alone?
2. Verify mocks match current API contracts
3. Distinguish between a broken test and a broken implementation
4. Check for flaky tests caused by timing, ordering, or shared state
