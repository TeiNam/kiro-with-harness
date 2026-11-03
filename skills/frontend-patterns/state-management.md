# State Management

## Contents

- Decision Ladder
- Local State — `useState`
- `useReducer` for Complex State
- Context — for Stable, Wide Values
- Context + Reducer Pattern
- Zustand — Drop-In Global Store
- Jotai — Atomic Primitives
- Redux Toolkit — When You Need It
- Server State Goes Elsewhere
- Forms Have Their Own Tool
- URL Is State Too
- Related

Pick the smallest tool that fits. Most React apps need three categories: **local state** for component-scoped values, **global client state** for app-wide things (theme, auth, modals), and **server state** for data fetched from APIs (different category — see [server-state.md](server-state.md)).

## Decision Ladder

1. **`useState` / `useReducer` in the component** — start here.
2. **Lift to a common ancestor** — when 2-3 components need the same state.
3. **Context** — when many components throughout a subtree need the same *non-frequently-changing* value (theme, locale, auth user).
4. **Zustand / Jotai** — when many components need the same *frequently-changing* state (forms across a wizard, drag state, app-wide modals).
5. **Redux Toolkit** — when you genuinely need devtools, time-travel, middleware, or a strict event log.
6. **TanStack Query / SWR** — for *server* state (data with a server source of truth). Always.

> Most React apps end at level 4. Reach for Redux only when you can name a feature that requires it.

## Local State — `useState`

```tsx
const [open, setOpen] = useState(false)
const [items, setItems] = useState<Item[]>([])
```

Keep state close to where it's used. If only one component reads it, that's where it lives.

For derived values, prefer **computed in render** over `useState` + `useEffect`:

```tsx
// Bad — sync via useEffect, double render, can desync
const [filtered, setFiltered] = useState<Item[]>([])
useEffect(() => {
  setFiltered(items.filter(i => i.active))
}, [items])


// Good
const filtered = items.filter(i => i.active)


// Good — wrap with useMemo only if measurably expensive
const filtered = useMemo(() => items.filter(i => i.active), [items])
```

## `useReducer` for Complex State

When several actions update related fields:

```tsx
type State = {
  step: number
  formData: FormData
  errors: Errors
}

type Action =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'update'; field: keyof FormData; value: string }
  | { type: 'submit_failed'; errors: Errors }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'next':   return { ...state, step: state.step + 1 }
    case 'back':   return { ...state, step: state.step - 1 }
    case 'update': return { ...state, formData: { ...state.formData, [action.field]: action.value } }
    case 'submit_failed': return { ...state, errors: action.errors }
  }
}

const [state, dispatch] = useReducer(reducer, initialState)
```

Reach for `useReducer` when:

- The next state depends on the previous in non-trivial ways.
- Multiple `useState` calls move together (always set the same time).
- You want a paper trail (`dispatch({type, ...})`) for debugging.

## Context — for Stable, Wide Values

Context is great for **theme, locale, current user, feature flags** — values that change rarely and need to be available deep in the tree.

```tsx
type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
```

Always wrap the consumer in a custom hook (`useTheme()`) — the throw catches "forgot the provider" at the right place.

### Context Pitfall — Re-renders

Every consumer of a context re-renders when the **value** changes (referentially). If your context holds frequently-changing data and 200 components consume it, you'll thrash.

Mitigations:

1. Split contexts (one for `state`, one for `dispatch` — `dispatch` is stable, fewer re-renders).
2. Stop using context for high-frequency state — switch to Zustand/Jotai.
3. Wrap the value in `useMemo`.

```tsx
// Two contexts — the dispatch one never causes re-renders
const StateContext = createContext<State | null>(null)
const DispatchContext = createContext<Dispatch<Action> | null>(null)
```

## Context + Reducer Pattern

```tsx
const StateContext = createContext<State | null>(null)
const DispatchContext = createContext<Dispatch<Action> | null>(null)

export function MarketsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export const useMarketsState = () => {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useMarketsState requires MarketsProvider')
  return ctx
}
export const useMarketsDispatch = () => {
  const ctx = useContext(DispatchContext)
  if (!ctx) throw new Error('useMarketsDispatch requires MarketsProvider')
  return ctx
}
```

## Zustand — Drop-In Global Store

For frequently-changing global state, Zustand is the lightest mainstream option:

```tsx
import { create } from 'zustand'

interface CartStore {
  items: CartItem[]
  add: (item: CartItem) => void
  remove: (id: string) => void
  clear: () => void
}

export const useCart = create<CartStore>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  remove: (id) => set((s) => ({ items: s.items.filter(i => i.id !== id) })),
  clear: () => set({ items: [] }),
}))


// Use it
const items = useCart(s => s.items)
const add = useCart(s => s.add)
```

Selectors mean components only re-render when their slice changes. No provider required. ~1 KB.

## Jotai — Atomic Primitives

For state that's easy to model as small independent atoms:

```tsx
import { atom, useAtom } from 'jotai'

const countAtom = atom(0)
const doubleAtom = atom(get => get(countAtom) * 2)

function Counter() {
  const [count, setCount] = useAtom(countAtom)
  const [double] = useAtom(doubleAtom)
}
```

Jotai's mental model is "Recoil but smaller" — many tiny atoms with derived computations. Good fit for editors, design tools, anything with lots of fine-grained state.

## Redux Toolkit — When You Need It

Modern Redux is `@reduxjs/toolkit` + RTK Query. The boilerplate that drove people away is gone. Use it when you actually need:

- A full action log (helpful for replay, undo, time-travel debugging).
- Middleware (sagas, observables, custom logging).
- A team that already knows Redux and has tooling around it.

For most new projects, Zustand or Jotai cover the use case with less ceremony.

## Server State Goes Elsewhere

Don't stash fetched data in `useState`, Context, or even Zustand. Use **TanStack Query** or **SWR** — they handle caching, deduplication, revalidation, mutations, optimistic updates, and devtools. See [server-state.md](server-state.md).

## Forms Have Their Own Tool

Form state is local + frequently-changing + validated. Don't reach for Zustand. Use **React Hook Form** with **Zod** — see [forms.md](forms.md).

## URL Is State Too

For state that should be shareable / bookmarkable / back-button-restorable (filters, tabs, pagination), put it in the URL:

```tsx
// React Router
const [searchParams, setSearchParams] = useSearchParams()
const tab = searchParams.get('tab') ?? 'overview'

// Next.js
const router = useRouter()
const pathname = usePathname()
const searchParams = useSearchParams()
```

The URL is global, persistent, free. Use it for any state where the browser's back button or sharing the link should work.

## Related

- [server-state.md](server-state.md) — TanStack Query, SWR, mutation patterns
- [forms.md](forms.md) — React Hook Form + Zod
- [hooks.md](hooks.md) — wrapping global stores in custom hooks
