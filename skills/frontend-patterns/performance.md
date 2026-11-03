# Performance

## Contents

- When to Optimize
- React.memo for Pure Components
- `useMemo` — for Expensive Computations
- `useCallback` — Stable Callbacks for Children
- Stable Object/Array Props
- Don't Memo Without a Reason
- Code Splitting with `lazy`
- Preload What's Coming
- Virtualization for Long Lists
- Image Optimization
- Avoid Unnecessary Re-renders
- Avoid Expensive Work in Render
- Concurrent Rendering — `useTransition`
- `useDeferredValue` for Stale-While-Loading
- React Compiler (Coming/Stable Depending on When You Read This)
- Profiling Workflow
- Related

Profile first; optimize what's actually slow. The React Profiler (DevTools) tells you which components rendered, why, and how long they took.

## When to Optimize

| Symptom | Tool |
|---|---|
| List of 1000+ items janks on scroll | Virtualization |
| Expensive computation re-runs every render | `useMemo` |
| Child re-renders unnecessarily | `React.memo` + stable props |
| Initial bundle too big | Code splitting + `lazy` |
| Page loads slowly | Streaming SSR / RSC / preloading |
| Renders feel slow but profiler is clean | Look at network, not React |

## React.memo for Pure Components

```tsx
interface MarketCardProps { market: Market }

export const MarketCard = React.memo<MarketCardProps>(({ market }) => (
  <div className="market-card">
    <h3>{market.name}</h3>
    <p>{market.description}</p>
  </div>
))
```

`React.memo` skips a re-render if props are referentially equal (shallow). It only helps if:

1. Props **are** referentially stable across renders (or you supply a custom comparator).
2. The component is **expensive** enough that the comparison is cheaper than re-rendering.

Wrapping every component in `memo` is a classic over-optimization — `memo` itself has a cost.

## `useMemo` — for Expensive Computations

```tsx
const sortedMarkets = useMemo(
  () => markets.toSorted((a, b) => b.volume - a.volume),
  [markets],
)
```

Use when:

- The computation is genuinely expensive (sort/filter/map on large arrays, JSON parse, regex builds).
- The result is referentially compared downstream (`useEffect` dep, `memo`-ed child prop).

Don't wrap every derived value. `useMemo` adds overhead — for cheap operations, plain re-computation is faster.

## `useCallback` — Stable Callbacks for Children

```tsx
const handleSelect = useCallback((id: string) => {
  setSelectedId(id)
}, [])
```

Use when:

- The callback is passed as a prop to a `memo`-ed child.
- The callback is in a `useEffect` dep array.

Plain `() => ...` re-creates every render, which busts memoization.

## Stable Object/Array Props

```tsx
// Bad — { } is new every render, breaks memo
<Child config={{ size: 'large' }} />

// Good
const config = useMemo(() => ({ size: 'large' }), [])
<Child config={config} />

// Better — hoist outside component if it never changes
const CONFIG = { size: 'large' } as const
<Child config={CONFIG} />
```

## Don't Memo Without a Reason

```tsx
// Bad — useMemo for a string concat? Plain expression is faster.
const label = useMemo(() => `${first} ${last}`, [first, last])

// Good
const label = `${first} ${last}`
```

If you can't articulate why a memo helps, remove it.

## Code Splitting with `lazy`

Big component (chart libraries, rich text editors, 3D scenes) — defer it:

```tsx
import { lazy, Suspense } from 'react'

const HeavyChart = lazy(() => import('./HeavyChart'))

export function Dashboard() {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <HeavyChart data={data} />
    </Suspense>
  )
}
```

Routes are the most natural split point. With React Router or Next.js, route-level splitting is automatic.

## Preload What's Coming

```tsx
// Imperatively trigger preload on hover/focus
<Link
  to="/dashboard"
  onMouseEnter={() => import('./pages/Dashboard')}
> Go to dashboard
</Link>
```

Or use the framework's preload API (Next.js `prefetch`, React Router `preload`).

## Virtualization for Long Lists

Rendering 10,000 rows kills the page. Virtualization renders only the visible window:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

export function MarketList({ markets }: { markets: Market[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const v = useVirtualizer({
    count: markets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  })

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map(row => (
          <div
            key={row.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: row.size,
              transform: `translateY(${row.start}px)`,
            }}
          >
            <MarketCard market={markets[row.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

`@tanstack/react-virtual` is the modern default. For tables, `@tanstack/react-table` integrates virtualization with sorting/filtering.

## Image Optimization

- Use the framework's `<Image>` component (Next.js, etc.) — it handles `srcset`, lazy loading, and optimal formats.
- Specify width/height to prevent layout shift.
- Use `loading="lazy"` on plain `<img>` for offscreen images.

## Avoid Unnecessary Re-renders

| Cause | Fix |
|---|---|
| New object/array literal in props | `useMemo`, hoist constant, or split prop |
| New inline function | `useCallback` if passed to `memo`-ed child |
| Context value changes too often | Split context or move state out |
| Parent re-renders cause all children to | `memo` the heavy children |
| Unstable key prop | Use stable IDs, never array index for dynamic lists |

## Avoid Expensive Work in Render

```tsx
// Bad — runs on every render
function List({ items }) {
  const sorted = items.sort((a, b) => a.name.localeCompare(b.name))
  return ...
}

// Good
function List({ items }) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  )
  return ...
}
```

Note: `Array.sort` mutates. Use `[...items].sort(…)` or `items.toSorted(…)` (ES2023).

## Concurrent Rendering — `useTransition`

```tsx
const [isPending, startTransition] = useTransition()

function handleSearch(value: string) {
  setInputValue(value)             // urgent — keep input responsive
  startTransition(() => {
    setSearchQuery(value)            // non-urgent — derived list update
  })
}
```

`startTransition` marks an update as low-priority. React keeps the input snappy and renders the list when there's time.

## `useDeferredValue` for Stale-While-Loading

```tsx
const deferredQuery = useDeferredValue(query)
// expensive list filtering with deferredQuery
```

Lets you show stale content while the new content computes. Pairs with Suspense.

## React Compiler (Coming/Stable Depending on When You Read This)

The React Compiler auto-memoizes — handwritten `useMemo`/`useCallback`/`React.memo` become unnecessary. If you've enabled the compiler, **stop adding manual memoization** and remove existing instances; the compiler does it more accurately.

Until then, keep the manual ones — but only where they actually help.

## Profiling Workflow

1. Open React DevTools → Profiler tab.
2. Record an interaction.
3. Look at the flame graph — wide bars = slow components.
4. Click a render to see why it re-rendered (props change, parent re-rendered, hooks change).
5. Fix the cause; remeasure.

Network and main-thread profiling: Chrome DevTools → Performance tab. Don't blame React for what's actually a slow API call.

## Related

- [hooks.md](hooks.md) — `useCallback`, `useMemo` rules
- [server-state.md](server-state.md) — query caching reduces refetches
