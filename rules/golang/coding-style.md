---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with Go-specific content.

## Formatting

- **gofmt** and **goimports** are mandatory — no style debates

## Naming

- `MixedCaps` for exported identifiers, `mixedCaps` for unexported
- Short variable names for small scopes (`i`, `r`, `ctx`); descriptive names for wider scopes
- Interface names: single-method interfaces use method name + `er` (`Reader`, `Stringer`)
- Avoid stuttering: `user.New()` not `user.NewUser()`

## Error Handling

Return errors explicitly. Handle them at every call site:

```go
// WRONG: Ignoring error
data, _ := os.ReadFile("config.json")

// CORRECT: Handle or propagate
data, err := os.ReadFile("config.json")
if err != nil {
    return fmt.Errorf("reading config: %w", err)
}
```

Use `fmt.Errorf` with `%w` to wrap errors. Define sentinel errors for known conditions:

```go
var ErrNotFound = errors.New("not found")

func FindUser(id string) (*User, error) {
    user, err := db.Get(id)
    if err != nil {
        return nil, fmt.Errorf("finding user %s: %w", id, err)
    }
    if user == nil {
        return nil, ErrNotFound
    }
    return user, nil
}
```

Custom error types when callers need structured information:

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}
```

## Concurrency

Use goroutines for concurrent work. Communicate via channels, not shared memory:

```go
func fetchAll(ctx context.Context, urls []string) []Result {
    results := make(chan Result, len(urls))
    var wg sync.WaitGroup

    for _, url := range urls {
        wg.Add(1)
        go func(u string) {
            defer wg.Done()
            results <- fetch(ctx, u)
        }(url)
    }

    go func() {
        wg.Wait()
        close(results)
    }()

    var out []Result
    for r := range results {
        out = append(out, r)
    }
    return out
}
```

Use `select` for timeout and cancellation:

```go
select {
case result := <-ch:
    process(result)
case <-ctx.Done():
    return ctx.Err()
}
```

Always pass `context.Context` as the first parameter for cancellable operations.

## Package Organization

Group by domain, not by layer:

```
myapp/
  user/
    user.go
    service.go
    repository.go
  order/
    order.go
    service.go
  internal/
    auth/
```

- Keep `package main` thin — parse flags, wire dependencies, call `Run()`
- Use `internal/` to prevent external imports of implementation details

## Interfaces

Accept interfaces, return structs. Define interfaces where they are used, not where implemented:

```go
type UserStore interface {
    FindByID(ctx context.Context, id string) (*User, error)
}

func NewService(store UserStore) *Service {
    return &Service{store: store}
}
```

## Functional Options

Use for complex constructors:

```go
type Option func(*Server)

func WithPort(port int) Option {
    return func(s *Server) { s.port = port }
}

func NewServer(opts ...Option) *Server {
    s := &Server{port: 8080}
    for _, opt := range opts {
        opt(s)
    }
    return s
}
```

## Defer

Use `defer` for cleanup. It runs in LIFO order:

```go
f, err := os.Open(path)
if err != nil {
    return err
}
defer f.Close()
```

## Zero Values

Leverage zero values for clean initialization:

```go
var buf bytes.Buffer
buf.WriteString("hello")
```
