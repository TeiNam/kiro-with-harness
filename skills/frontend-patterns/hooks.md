# Custom Hooks

## Contents

- Rules of Hooks (Strict)
- Anatomy of a Custom Hook
- Useful Hook Patterns
- Async Data Hook (Don't Roll Your Own)
- Capturing Stale State
- When to Extract a Hook
- Don't Conditionally Call Hooks
- Cleanup Is Not Optional
- Related

Hooks let you extract stateful logic without changing component hierarchy. The most powerful refactoring tool in React.

## Rules of Hooks (Strict)

1. **Only call hooks at the top level.** Never inside loops, conditions, or nested functions.
2. **Only call hooks from React functions** (components or other hooks).
3. **Hook names start with `use`.** ESLint plugin enforces this; don't name a regular function `useThing`.

ESLint setup:

```json
{
  "plugins": ["react-hooks"],
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

`exhaustive-deps` is the most useful linter rule in React. Don't disable it without a comment explaining why.

## Anatomy of a Custom Hook

```tsx
// Returns a tuple: [value, action]
export function useToggle(initialValue = false): [boolean, () => void] {
  const [value, setValue] = useState(initialValue)
  const toggle = useCallback(() => setValue(v => !v), [])
  return [value, toggle]
}


// Usage
const [isOpen, toggleOpen] = useToggle()
```

A hook is just a function that calls other hooks. It can return any shape — tuple, object, single value.

## Useful Hook Patterns

### `useDebounce`

```tsx
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
```

### `usePrevious`

```tsx
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  useEffect(() => { ref.current = value })
  return ref.current
}
```

### `useEventListener`

```tsx
export function useEventListener<K extends keyof WindowEventMap>(
  event: K,
  handler: (e: WindowEventMap[K]) => void,
) {
  const handlerRef = useRef(handler)
  useEffect(() => { handlerRef.current = handler }, [handler])

  useEffect(() => {
    const listener = (e: WindowEventMap[K]) => handlerRef.current(e)
    window.addEventListener(event, listener)
    return () => window.removeEventListener(event, listener)
  }, [event])
}
```

The `handlerRef` pattern lets the handler change without re-binding the listener.

### `useLocalStorage`

```tsx
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })

  const setStored = useCallback((v: T) => {
    setValue(v)
    try { window.localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
  }, [key])

  return [value, setStored]
}
```

### `useMediaQuery`

```tsx
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
```

## Async Data Hook (Don't Roll Your Own)

```tsx
// Reasonable for small projects
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fn()
      .then(d => !cancelled && setData(d))
      .catch(e => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading }
}
```

For anything beyond toy use cases, use **TanStack Query** or **SWR** — they handle caching, revalidation, deduplication, retries, and devtools that you'll otherwise reinvent. See [server-state.md](server-state.md).

## Capturing Stale State

A common bug: a callback closes over old state.

```tsx
// Bad — onClick captures `count` from the render where it was registered
function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setCount(count + 1), 1000)
    return () => clearInterval(id)
  }, [])  // missing dep, but adding it would re-create the interval every tick
}


// Good — functional update doesn't need the dep
function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setCount(c => c + 1), 1000)
    return () => clearInterval(id)
  }, [])
}
```

Use the functional updater (`setX(prev => ...)`) whenever the next state is computed from the previous one. Avoids depending on the value in a closure.

## When to Extract a Hook

| Situation | Extract? |
|---|---|
| Two components share the same effect | Yes |
| One component has 3+ `useEffect` and ~50 lines of state setup | Often yes |
| Helper that doesn't use hooks | No — use a plain function |
| Logic so simple it's clearer inline | No |
| Each call site has slightly different behavior — many params | Reconsider; you may need two hooks |

## Don't Conditionally Call Hooks

```tsx
// Bad — violates rules of hooks
function Foo({ enabled }) {
  if (enabled) {
    const [x, setX] = useState(0)   //
  }
}


// Good — always call, branch internally
function Foo({ enabled }) {
  const [x, setX] = useState(0)
  if (!enabled) return null
}


// Or — if the hook itself shouldn't run, pass an enabled flag
const { data } = useQuery({ queryKey: ['x'], queryFn: fetchX, enabled })
```

Most query libraries support an `enabled` flag exactly for this case.

## Cleanup Is Not Optional

Every effect that subscribes/listens/intervals must clean up:

```tsx
useEffect(() => {
  const sub = subscribe(...)
  return () => sub.unsubscribe()
}, [...])
```

Strict mode runs effects twice in development to surface missing cleanups. Don't disable strict mode to silence the symptom.

## Related

- [components.md](components.md) — when to extract a hook vs a component
- [state-management.md](state-management.md) — global hooks (Zustand `useStore`, Query)
