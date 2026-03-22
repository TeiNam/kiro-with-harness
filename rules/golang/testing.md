---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Testing

> This file extends [common/testing.md](../common/testing.md) with Go-specific content.

## Test Functions

Use the standard `testing` package. Name tests `Test<Function>_<scenario>`:

```go
func TestParseEmail_ValidInput(t *testing.T) {
    email, err := ParseEmail("alice@example.com")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if email.Domain != "example.com" {
        t.Errorf("got domain %q, want %q", email.Domain, "example.com")
    }
}
```

## Table-Driven Tests

Use table-driven tests for multiple input/output scenarios:

```go
func TestValidateAge(t *testing.T) {
    tests := []struct {
        name    string
        age     int
        wantErr bool
    }{
        {"valid", 25, false},
        {"zero", 0, false},
        {"negative", -1, true},
        {"too old", 200, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateAge(tt.age)
            if (err != nil) != tt.wantErr {
                t.Errorf("ValidateAge(%d) error = %v, wantErr %v", tt.age, err, tt.wantErr)
            }
        })
    }
}
```

## Subtests and Parallel

Use `t.Run` for grouping related tests. Use `t.Parallel()` for independent tests:

```go
func TestUserService(t *testing.T) {
    t.Run("Create", func(t *testing.T) {
        t.Parallel()
        // ...
    })

    t.Run("Delete", func(t *testing.T) {
        t.Parallel()
        // ...
    })
}
```

## Test Helpers

Use `t.Helper()` so failures report the caller's line:

```go
func assertNoError(t *testing.T, err error) {
    t.Helper()
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
}
```

## Mocking with Interfaces

Use interfaces for dependency injection and test with fakes:

```go
type MockStore struct {
    users map[string]*User
}

func (m *MockStore) FindByID(ctx context.Context, id string) (*User, error) {
    u, ok := m.users[id]
    if !ok {
        return nil, ErrNotFound
    }
    return u, nil
}
```

## Integration Tests

Use build tags or `testing.Short()` to separate integration tests:

```go
func TestDatabaseIntegration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }
    // ...
}
```

Run with: `go test -short ./...` (skip integration) or `go test ./...` (all).

## Race Detection

Always run with the `-race` flag in CI:

```bash
go test -race ./...
```

## Benchmarks

```go
func BenchmarkParseEmail(b *testing.B) {
    for i := 0; i < b.N; i++ {
        ParseEmail("alice@example.com")
    }
}
```

Run with: `go test -bench=. -benchmem ./...`

## Coverage

```bash
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Test Organization

```
user/
  user.go
  user_test.go              # Unit tests (same package)
```

- Keep tests in the same package for access to unexported types
- Use `_test` package suffix (e.g., `package user_test`) for black-box tests of the public API
