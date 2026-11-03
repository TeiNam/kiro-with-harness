# Error Boundaries

## Contents

- Basic Error Boundary
- Or Use `react-error-boundary`
- What Error Boundaries Catch
- Where to Place Boundaries
- Reset Strategies
- Pair with Suspense
- Async Errors — `useErrorBoundary`
- Logging
- Don't Show Stack Traces to Users
- Related

Class component that catches render-phase errors in its subtree, prevents them from unmounting the whole app, and shows a fallback. The only place class components are still required (until React ships a hook equivalent).

## Basic Error Boundary

```tsx
interface Props {
  children: React.ReactNode
  fallback: (error: Error, reset: () => void) => React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to your monitoring (Sentry, Datadog, etc.)
    reportError(error, { componentStack: info.componentStack })
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset)
    }
    return this.props.children
  }
}
```

```tsx
<ErrorBoundary
  fallback={(error, reset) => (
    <div role="alert">
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={reset}>Try again</button>
    </div>
  )}
> <Dashboard />
</ErrorBoundary>
```

## Or Use `react-error-boundary`

The community library wraps the same logic with hooks-friendly ergonomics:

```tsx
import { ErrorBoundary } from 'react-error-boundary'

<ErrorBoundary
  FallbackComponent={ErrorFallback}
  onReset={(details) => {/* clear state, retry, etc */}}
  resetKeys={[userId]}
> <Dashboard />
</ErrorBoundary>
```

Skip the class boilerplate.

## What Error Boundaries Catch

| Catches | Doesn't catch |
|---|---|
| Render errors in descendants | Event handlers (`onClick`) |
| Constructor errors in descendants | Async code (`setTimeout`, promises) |
| Lifecycle errors in descendants | Errors thrown in the boundary itself |

For the misses, handle them in place:

```tsx
async function handleSave() {
  try {
    await api.save(data)
  } catch (e) {
    setError(e as Error)
    reportError(e)
  }
}
```

## Where to Place Boundaries

Layered, by recovery scope:

1. **Top of the app** — catches everything, shows "the app crashed" screen.
2. **Per route** — one bad page doesn't kill the whole app.
3. **Per major widget** (chart, comments section) — the widget shows its own fallback while the rest of the page works.

```tsx
<ErrorBoundary fallback={AppCrashed}>
  <Layout>
    <ErrorBoundary fallback={RouteCrashed}>
      <Outlet />
      <ErrorBoundary fallback={CommentsCrashed}>
        <Comments />
      </ErrorBoundary>
    </ErrorBoundary>
  </Layout>
</ErrorBoundary>
```

## Reset Strategies

After an error, the user wants to keep using the app.

**`resetKeys`** — automatic reset when a key changes (e.g., new route):

```tsx
<ErrorBoundary FallbackComponent={Fallback} resetKeys={[location.pathname]}>
  <Outlet />
</ErrorBoundary>
```

**Manual reset** — fallback button calls `reset()`:

```tsx
function Fallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  )
}
```

**Throw-from-fallback retries** — sometimes the fallback's "retry" calls a hook that re-throws if it fails again. The boundary catches it and stays in error state, with no infinite loop.

## Pair with Suspense

```tsx
<ErrorBoundary fallback={<Error />}>
  <Suspense fallback={<Spinner />}>
    <DataView />
  </Suspense>
</ErrorBoundary>
```

`Suspense` shows the spinner while data loads; `ErrorBoundary` catches if the load throws. With TanStack Query's `useSuspenseQuery`, this is the entire branch.

## Async Errors — `useErrorBoundary`

For event handlers and effects, throw-into-boundary helpers exist:

```tsx
import { useErrorBoundary } from 'react-error-boundary'

function FetchButton() {
  const { showBoundary } = useErrorBoundary()

  const handleClick = async () => {
    try {
      await api.doThing()
    } catch (e) {
      showBoundary(e)
    }
  }
  return <button onClick={handleClick}>Do thing</button>
}
```

## Logging

In `componentDidCatch` (or `react-error-boundary`'s `onError`):

```tsx
componentDidCatch(error: Error, info: React.ErrorInfo) {
  Sentry.captureException(error, {
    contexts: { react: { componentStack: info.componentStack } },
  })
}
```

Always log to a monitoring tool. The fallback UI can be friendly; the engineering data should be complete.

## Don't Show Stack Traces to Users

```tsx
// Bad
<pre>{error.stack}</pre>

// Good
<p>Something went wrong. Refresh the page or try again later.</p>
```

Stacks can leak file paths and internals. Show user-meaningful messages; log everything else.

## Related

- [server-state.md](server-state.md) — Suspense + ErrorBoundary with TanStack Query
- [forms.md](forms.md) — recovering from submit errors without a boundary
