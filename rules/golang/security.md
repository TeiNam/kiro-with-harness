---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Security

> This file extends [common/security.md](../common/security.md) with Go-specific content.

## SQL Injection

Always use parameterized queries:

```go
// WRONG: SQL injection risk
query := fmt.Sprintf("SELECT * FROM users WHERE id = '%s'", userID)
db.Query(query)

// CORRECT: Parameterized
db.QueryContext(ctx, "SELECT * FROM users WHERE id = $1", userID)
```

## Input Validation

Validate all external input at API boundaries:

```go
func (r CreateUserRequest) Validate() error {
    if r.Email == "" {
        return errors.New("email is required")
    }
    if r.Age < 0 || r.Age > 150 {
        return errors.New("age out of range")
    }
    return nil
}
```

## Path Traversal

Validate file paths against a base directory:

```go
func safePath(baseDir, userPath string) (string, error) {
    resolved := filepath.Join(baseDir, filepath.Clean(userPath))
    if !strings.HasPrefix(resolved, filepath.Clean(baseDir)+string(os.PathSeparator)) {
        return "", errors.New("path traversal detected")
    }
    return resolved, nil
}
```

## Secrets

- Never hardcode secrets. Use environment variables or a secrets manager
- Use `crypto/rand` for generating secrets, never `math/rand`

```go
import "crypto/rand"

func generateToken(n int) (string, error) {
    b := make([]byte, n)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return base64.URLEncoding.EncodeToString(b), nil
}
```

## Cryptography

- Use `crypto/subtle.ConstantTimeCompare` for token comparison
- Use `golang.org/x/crypto/bcrypt` for password hashing

```go
import "crypto/subtle"

func verifyToken(provided, expected []byte) bool {
    return subtle.ConstantTimeCompare(provided, expected) == 1
}
```

## Context & Timeouts

Always use `context.Context` for timeout control:

```go
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
```

## HTTP Security

Set security headers in middleware:

```go
func SecurityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        next.ServeHTTP(w, r)
    })
}
```

## Goroutine Safety

- Protect shared state with `sync.Mutex` or use channels
- Avoid goroutine leaks: ensure goroutines can exit via context cancellation or channel close
- Use `-race` flag in tests: `go test -race ./...`

## Security Scanning

```bash
gosec ./...
govulncheck ./...
```

## Dependency Security

- Run `govulncheck ./...` in CI
- Use `go mod tidy` to remove unused dependencies
- Pin module versions via `go.sum`
