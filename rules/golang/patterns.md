---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Patterns

> This file extends [common/patterns.md](../common/patterns.md) with Go-specific content.

## Error Handling Patterns

### Sentinel Errors

Define sentinel errors for well-known conditions:

```go
var (
    ErrNotFound      = errors.New("not found")
    ErrAlreadyExists = errors.New("already exists")
    ErrUnauthorized  = errors.New("unauthorized")
)

// Caller
if errors.Is(err, ErrNotFound) {
    // handle missing resource
}
```

### Custom Error Types

Use when callers need structured information:

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation: %s: %s", e.Field, e.Message)
}

// Caller
var ve *ValidationError
if errors.As(err, &ve) {
    log.Printf("invalid field: %s", ve.Field)
}
```

### Error Wrapping

Wrap errors with context at each layer using `%w`:

```go
func (s *Service) CreateOrder(ctx context.Context, req CreateOrderReq) error {
    user, err := s.users.FindByID(ctx, req.UserID)
    if err != nil {
        return fmt.Errorf("create order: lookup user: %w", err)
    }
    // ...
}
```

## Dependency Injection

Pass dependencies via struct fields. Wire in `main()`:

```go
type Service struct {
    store  Store
    mailer Mailer
    logger *slog.Logger
}

func NewService(store Store, mailer Mailer, logger *slog.Logger) *Service {
    return &Service{store: store, mailer: mailer, logger: logger}
}
```

## Concurrency Patterns

### Worker Pool

```go
func processItems(ctx context.Context, items []Item, workers int) error {
    g, ctx := errgroup.WithContext(ctx)
    ch := make(chan Item)

    g.Go(func() error {
        defer close(ch)
        for _, item := range items {
            select {
            case ch <- item:
            case <-ctx.Done():
                return ctx.Err()
            }
        }
        return nil
    })

    for i := 0; i < workers; i++ {
        g.Go(func() error {
            for item := range ch {
                if err := process(ctx, item); err != nil {
                    return err
                }
            }
            return nil
        })
    }

    return g.Wait()
}
```

### Fan-out / Fan-in with errgroup

```go
import "golang.org/x/sync/errgroup"

func fetchAll(ctx context.Context, urls []string) ([]Result, error) {
    g, ctx := errgroup.WithContext(ctx)
    results := make([]Result, len(urls))

    for i, url := range urls {
        i, url := i, url
        g.Go(func() error {
            r, err := fetch(ctx, url)
            if err != nil {
                return err
            }
            results[i] = r
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err
    }
    return results, nil
}
```

## Middleware Pattern

For HTTP handlers, use middleware chaining:

```go
type Middleware func(http.Handler) http.Handler

func Logging(logger *slog.Logger) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            next.ServeHTTP(w, r)
            logger.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start))
        })
    }
}
```

## Configuration

Use struct-based configuration. Keep `main()` as the composition root — parse config, create dependencies, wire everything together, then start.

## Graceful Shutdown

```go
func main() {
    srv := &http.Server{Addr: ":8080", Handler: mux}

    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatalf("server error: %v", err)
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    srv.Shutdown(ctx)
}
```
