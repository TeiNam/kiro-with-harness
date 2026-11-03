# Server State

## Contents

- Why Server State Is Different
- TanStack Query Basics
- Parameterized Queries
- Mutations
- Optimistic Updates
- Query Keys — Conventions
- Suspense Mode (React 18+)
- SWR Alternative
- Pagination & Infinite
- Server Components / RSC (Next.js App Router)
- Pitfalls
- Related

Server state is data with a remote source of truth. It needs caching, deduplication, revalidation, and consistency — patterns that don't belong in `useState`. Use **TanStack Query** (React Query) or **SWR**.

## Why Server State Is Different

| Property | Client state | Server state |
|---|---|---|
| Source of truth | Client | Remote |
| Becomes stale | No | Yes |
| Multiple consumers | Same value | May get different values |
| Loses on reload | No | Refetched |
| Mutations | Synchronous | Async, can fail, can be optimistic |
| Cache strategy | N/A | Critical |

Don't store server state in Zustand or Context. The library that fetches it should also cache, dedupe, and revalidate it.

## TanStack Query Basics

```tsx
import { useQuery } from '@tanstack/react-query'

function MarketList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['markets'],
    queryFn: () => fetch('/api/markets').then(r => r.json()),
  })

  if (isLoading) return <Spinner />
  if (error) return <Error error={error as Error} />
  return <ul>{data!.map(m => <li key={m.id}>{m.name}</li>)}</ul>
}
```

The `queryKey` is the cache identity. Two components with the same key share the same fetch and the same cache entry.

## Parameterized Queries

```tsx
function MarketDetail({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['markets', id],
    queryFn: () => fetch(`/api/markets/${id}`).then(r => r.json()),
    enabled: !!id,            // skip until id is truthy
    staleTime: 60_000,         // consider fresh for 1 minute
  })
  ...
}
```

`enabled: false` defers the fetch — useful for queries that depend on a prior query's result, or on a user action.

## Mutations

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

function CreateMarket() {
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: (data: NewMarket) =>
      fetch('/api/markets', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markets'] })   // refetch list
    },
  })

  return (
    <button onClick={() => create.mutate({ name: 'New' })} disabled={create.isPending}>
      Create
    </button>
  )
}
```

After a successful mutation, **invalidate** the affected queries so they refetch. Don't manually `setQueryData` unless you have a reason.

## Optimistic Updates

For mutations that should feel instant:

```tsx
const toggle = useMutation({
  mutationFn: (id: string) =>
    fetch(`/api/items/${id}/toggle`, { method: 'POST' }),

  onMutate: async (id) => {
    await qc.cancelQueries({ queryKey: ['items'] })
    const prev = qc.getQueryData<Item[]>(['items'])
    qc.setQueryData<Item[]>(['items'], (old) =>
      old?.map(i => i.id === id ? { ...i, done: !i.done } : i),
    )
    return { prev }
  },

  onError: (_err, _id, ctx) => {
    if (ctx?.prev) qc.setQueryData(['items'], ctx.prev)   // rollback
  },

  onSettled: () => {
    qc.invalidateQueries({ queryKey: ['items'] })
  },
})
```

The pattern: capture the previous value in `onMutate`, apply the optimistic change, restore on error, refetch on settle.

## Query Keys — Conventions

Treat query keys like URLs:

```tsx
['markets']                              // list
['markets', { status: 'active' }]        // filtered list
['markets', id]                          // detail
['markets', id, 'comments']              // nested
```

Centralize the keys to avoid typos:

```tsx
export const marketKeys = {
  all: ['markets'] as const,
  list: (filters?: Filters) => [...marketKeys.all, filters ?? {}] as const,
  detail: (id: string) => [...marketKeys.all, id] as const,
  comments: (id: string) => [...marketKeys.detail(id), 'comments'] as const,
}
```

Invalidation becomes precise: `qc.invalidateQueries({ queryKey: marketKeys.detail(id) })`.

## Suspense Mode (React 18+)

```tsx
const { data } = useSuspenseQuery({
  queryKey: ['markets'],
  queryFn: fetchMarkets,
})
```

`useSuspenseQuery` throws a promise on first load — render in a `<Suspense>` boundary; data is always defined inside.

```tsx
<Suspense fallback={<Spinner />}>
  <ErrorBoundary fallback={<Error />}>
    <MarketList />
  </ErrorBoundary>
</Suspense>
```

Suspense + error boundaries replace the `if (isLoading) ... if (error) ...` ladder.

## SWR Alternative

SWR is the lighter alternative — same idea, smaller API surface:

```tsx
import useSWR from 'swr'

const { data, error, isLoading } = useSWR('/api/markets', fetcher)
```

Use SWR if you want the smallest dep; TanStack Query if you want mutations, optimistic UI, devtools, infinite queries, and richer cache invalidation.

## Pagination & Infinite

```tsx
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchFeed({ cursor: pageParam }),
  initialPageParam: null,
  getNextPageParam: (last) => last.nextCursor ?? undefined,
})
```

For traditional offset pagination, `keepPreviousData: true` keeps the old page visible while the new one loads.

## Server Components / RSC (Next.js App Router)

In React Server Components, you fetch data at the component level on the server:

```tsx
// app/markets/page.tsx — server component
export default async function MarketsPage() {
  const markets = await fetchMarkets()
  return <MarketList markets={markets} />
}
```

No client cache needed; the server renders with the latest data on every request. For client-interactive sub-trees, drop a `'use client'` boundary and use TanStack Query inside.

## Pitfalls

- **Storing fetched data in `useState`/Context/Zustand.** You'll reinvent half a query cache. Use the library.
- **Stale closures over `data`.** A render-phase `data` value captured in a callback may be outdated by the time the callback runs. Use the latest from `useQuery`.
- **Refetching too aggressively.** Default `staleTime` is 0 (always stale, refetch on mount). Bump to a sensible window (`staleTime: 30_000` etc.) for data that doesn't change every second.
- **Putting query state in a global store.** The query library *is* your store for server data. Don't duplicate.

## Related

- [state-management.md](state-management.md) — client state vs server state
- [error-boundaries.md](error-boundaries.md) — Suspense + ErrorBoundary pattern
