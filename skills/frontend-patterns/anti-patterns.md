# Anti-Patterns

## Contents

- Mutating State
- `useEffect` for Derived State
- `useEffect` to Fetch Data
- Array Index as `key`
- Unstable References Through `memo`
- Conditional Hooks
- `forwardRef` Without Naming
- `dangerouslySetInnerHTML` for User Input
- Inline Functions That Trigger Effects
- God Components
- Provider Pyramid
- `any` in Props
- Suppressing `exhaustive-deps`
- DOM Manipulation Outside `useEffect`
- Returning Different Hook Counts
- Forgetting Loading and Error States
- `useState` for Form Fields That Don't Need It
- Related

Things ESLint flags, things React DevTools warns about, and things experienced reviewers reject on sight.

## Mutating State

```tsx
// Bad — mutates the array; React doesn't see a change
const [items, setItems] = useState<Item[]>([])
items.push(newItem)
setItems(items)


// Good — new array
setItems([...items, newItem])
setItems(prev => [...prev, newItem])    // when you need the latest
```

Same trap with objects (`obj.x = 1` then `setObj(obj)`), nested updates, sorted arrays. Always produce a new reference.

## `useEffect` for Derived State

```tsx
// Bad — extra render, can desync
const [items, setItems] = useState<Item[]>([])
const [count, setCount] = useState(0)
useEffect(() => { setCount(items.length) }, [items])


// Good — compute in render
const [items, setItems] = useState<Item[]>([])
const count = items.length
```

Only use `useEffect` for genuine side effects (subscriptions, DOM measurements, network when not using Query). Don't sync derived values with `useEffect`.

## `useEffect` to Fetch Data

```tsx
// Bad — race conditions, no cache, no retries, no devtools
useEffect(() => {
  fetch(url).then(r => r.json()).then(setData)
}, [url])


// Good — TanStack Query / SWR
const { data } = useQuery({ queryKey: ['x', url], queryFn: () => fetch(url).then(r => r.json()) })
```

Hand-rolled fetch in `useEffect` should be reserved for once-only initialization or cases the query library can't model. See [server-state.md](server-state.md).

## Array Index as `key`

```tsx
// Bad — when items reorder/insert, React re-renders the wrong rows
items.map((item, i) => <Item key={i} item={item} />)


// Good — stable, unique id
items.map(item => <Item key={item.id} item={item} />)
```

Index `key` only when the list is **immutable** (no reorder, no insert, no delete) — and even then, stable IDs are clearer.

## Unstable References Through `memo`

```tsx
// Bad — memo doesn't help; new options object every render
function Parent() {
  return <Child options={{ size: 10 }} />
}
const Child = React.memo(...)


// Good
const OPTIONS = { size: 10 }
function Parent() {
  return <Child options={OPTIONS} />
}


// Or memo the value inline
function Parent() {
  const options = useMemo(() => ({ size: 10 }), [])
  return <Child options={options} />
}
```

`React.memo` only helps when props are referentially stable. New `{}` or `[]` literals or inline `() => …` defeat it.

## Conditional Hooks

```tsx
// Bad — violates rules of hooks
function Foo({ enabled }) {
  if (enabled) {
    const [v, setV] = useState(0)
  }
}


// Good — always call, branch internally
function Foo({ enabled }) {
  const [v, setV] = useState(0)
  if (!enabled) return null
}
```

ESLint catches this. Don't `eslint-disable`.

## `forwardRef` Without Naming

```tsx
// Bad — DevTools shows "ForwardRef"
export default React.forwardRef((props, ref) => <input ref={ref} {...props} />)


// Good
const Input = React.forwardRef<HTMLInputElement, Props>(...)
Input.displayName = 'Input'
export default Input
```

Same applies to `React.memo` — name the inner component or set `displayName`.

## `dangerouslySetInnerHTML` for User Input

```tsx
// Catastrophic — XSS
<div dangerouslySetInnerHTML={{ __html: userMessage }} />


// Good
<div>{userMessage}</div>


// If markdown-rendered, sanitize
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rendered) }} />
```

`dangerouslySetInnerHTML` is for trusted, sanitized content only. Default to plain children.

## Inline Functions That Trigger Effects

```tsx
// Bad — effect fires every render
useEffect(() => {
  setup(() => {})
}, [() => {}])


// Good
const cb = useCallback(() => {}, [])
useEffect(() => {
  setup(cb)
}, [cb])
```

Inline objects, arrays, and functions are new every render. They bust dep arrays and memo'd children.

## God Components

A 600-line component with 12 `useState`, 8 `useEffect`, and a 200-line `return` is impossible to maintain. Split:

- Extract the state cluster into a custom hook.
- Extract sub-trees into child components.
- Move data-fetching to TanStack Query.

If a single component owns four feature flags and three async operations, it's wrong abstraction.

## Provider Pyramid

```tsx
<ThemeProvider>
  <AuthProvider>
    <FeatureFlagsProvider>
      <CartProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </CartProvider>
    </FeatureFlagsProvider>
  </AuthProvider>
</ThemeProvider>
```

Combine into one `<Providers>` wrapper:

```tsx
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FeatureFlagsProvider>
          <CartProvider>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </CartProvider>
        </FeatureFlagsProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
```

Or, for state, prefer Zustand stores — no providers needed.

## `any` in Props

```tsx
// Bad — silently disables type checking
function Card({ data }: { data: any }) { ... }

// Good
function Card({ data }: { data: CardData }) { ... }

// When you really don't know — use unknown and narrow
function Card({ data }: { data: unknown }) {
  if (typeof data === 'string') ...
}
```

`any` infects everything it touches. Reach for `unknown` and narrow, or define the type properly.

## Suppressing `exhaustive-deps`

```tsx
// Bad — suppresses without justification
useEffect(() => {
  doThing(a, b)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

If you need a value but don't want it in deps, refactor: use `useRef`, the functional updater, or pull the logic out. Suppression should be rare and commented.

## DOM Manipulation Outside `useEffect`

```tsx
// Bad — runs during render, breaks SSR
function Foo() {
  document.title = 'Foo'
  return <div />
}


// Good
function Foo() {
  useEffect(() => { document.title = 'Foo' }, [])
  return <div />
}
```

Render must be pure — no DOM, no global state mutation, no network. Side effects go in `useEffect` (or the framework's equivalent).

## Returning Different Hook Counts

```tsx
// Bad — hook count changes between renders
function Foo({ feature }) {
  const [a] = useState(0)
  if (feature) {
    const [b] = useState(0)   //
    return ...
  }
  return ...
}
```

Same as conditional hooks — never branch hook calls. Always call them, branch the rendering.

## Forgetting Loading and Error States

```tsx
// Bad — assumes data loads instantly and never fails
const { data } = useQuery({ queryKey: ['x'], queryFn: fetchX })
return <ItemList items={data} />   // crash on first render


// Good
const { data, isLoading, error } = useQuery({ queryKey: ['x'], queryFn: fetchX })
if (isLoading) return <Spinner />
if (error) return <Error />
return <ItemList items={data!} />


// Or — Suspense + ErrorBoundary
const { data } = useSuspenseQuery({ queryKey: ['x'], queryFn: fetchX })
return <ItemList items={data} />
```

Every async branch needs both states modeled.

## `useState` for Form Fields That Don't Need It

```tsx
// Bad — re-renders on every keystroke
const [name, setName] = useState('')
const [email, setEmail] = useState('')
const [age, setAge] = useState('')


// Good — RHF, uncontrolled, only re-renders on validation/submit
const { register } = useForm()
<input {...register('name')} />
<input {...register('email')} />
<input {...register('age')} />
```

For real forms, see [forms.md](forms.md).

## Related

- All other files in this directory — these patterns are the corollary to "what should I do."
