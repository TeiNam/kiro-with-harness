# Component Composition

## Contents

- Composition Over Inheritance
- Slots via Named Props
- Compound Components (Shared State via Context)
- Render Props (Use Sparingly)
- Polymorphic Components (`as` Prop)
- Forwarding Refs
- Children as a Function vs ReactNode
- Splitting Components
- Container vs Presentational — Mostly Outdated
- Related

Composition over inheritance. Children, slots, compound components, render props — pick the lightest tool that fits.

## Composition Over Inheritance

```tsx
// Card with sub-pieces — caller composes the layout
interface CardProps {
  children: React.ReactNode
  variant?: 'default' | 'outlined'
}

export function Card({ children, variant = 'default' }: CardProps) {
  return <div className={`card card-${variant}`}>{children}</div>
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="card-header">{children}</div>
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>
}


// Usage — caller controls structure
<Card>
  <CardHeader>Title</CardHeader>
  <CardBody>Content</CardBody>
</Card>
```

Inheritance (`class CustomCard extends Card`) is almost never the right tool in React. Compose with children, props, and component slots.

## Slots via Named Props

When the layout has fixed regions, named props are clearer than children:

```tsx
interface DialogProps {
  header: React.ReactNode
  body: React.ReactNode
  footer?: React.ReactNode
}

export function Dialog({ header, body, footer }: DialogProps) {
  return (
    <div className="dialog">
      <div className="dialog-header">{header}</div>
      <div className="dialog-body">{body}</div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </div>
  )
}
```

Use this when the parent dictates positions; use children when the caller arranges sub-pieces.

## Compound Components (Shared State via Context)

When several pieces need to coordinate (Tabs, Accordion, Menu, Form), expose a parent + sub-components that share state through context:

```tsx
interface TabsContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined)

function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs subcomponent must be used inside <Tabs>')
  return ctx
}

export function Tabs({ children, defaultTab }: { children: React.ReactNode; defaultTab: string }) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  )
}

export function TabList({ children }: { children: React.ReactNode }) {
  return <div role="tablist">{children}</div>
}

export function Tab({ id, children }: { id: string; children: React.ReactNode }) {
  const { activeTab, setActiveTab } = useTabs()
  const selected = activeTab === id
  return (
    <button
      role="tab"
      aria-selected={selected}
      className={selected ? 'active' : ''}
      onClick={() => setActiveTab(id)}
    >
      {children}
    </button>
  )
}

export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const { activeTab } = useTabs()
  if (activeTab !== id) return null
  return <div role="tabpanel">{children}</div>
}
```

Caller writes natural-looking JSX:

```tsx
<Tabs defaultTab="overview">
  <TabList>
    <Tab id="overview">Overview</Tab>
    <Tab id="details">Details</Tab>
  </TabList>
  <TabPanel id="overview">…</TabPanel>
  <TabPanel id="details">…</TabPanel>
</Tabs>
```

## Render Props (Use Sparingly)

When a component owns logic and the caller needs to render the result:

```tsx
interface DataLoaderProps<T> {
  url: string
  children: (state: { data: T | null; loading: boolean; error: Error | null }) => React.ReactNode
}

export function DataLoader<T>({ url, children }: DataLoaderProps<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then(r => r.json())
      .then(d => !cancelled && setData(d))
      .catch(e => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [url])

  return <>{children({ data, loading, error })}</>
}
```

In modern React, **prefer a custom hook** (`useData(url)`) — it's smaller, composes better, and doesn't add a wrapper element. Reach for render props only when the logic *is* the wrapper (e.g., `<Measure>`, `<Tooltip>`).

## Polymorphic Components (`as` Prop)

Let a component render as different elements while keeping its own behavior:

```tsx
type ButtonProps<E extends React.ElementType = 'button'> = {
  as?: E
  children: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<E>, 'as' | 'children'>

export function Button<E extends React.ElementType = 'button'>({
  as,
  children,
  ...props
}: ButtonProps<E>) {
  const Component = as ?? 'button'
  return <Component className="btn" {...props}>{children}</Component>
}


// Usage
<Button>Click</Button>
<Button as="a" href="/about">About</Button>
<Button as={Link} to="/profile">Profile</Button>
```

Powerful but the typing gets gnarly. Use `radix-ui/react-slot` for production-grade polymorphism.

## Forwarding Refs

When a component needs to expose its DOM node to a parent (focus management, measurements):

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, ...props }, ref) => (
    <label>
      <span>{label}</span>
      <input ref={ref} {...props} />
    </label>
  )
)
Input.displayName = 'Input'
```

In React 19+, plain function components can accept `ref` directly without `forwardRef`. Match what your codebase is already using.

## Children as a Function vs ReactNode

```tsx
// Render prop
<Datasource>{state => <MyView state={state} />}</Datasource>

// Children as ReactNode
<Card>{<MyView />}</Card>
```

Use `children: ReactNode` for composition. Use `children: (args) => ReactNode` only when the parent must inject values.

## Splitting Components

Split when:

- A component is over ~150 lines and has multiple responsibilities.
- A piece is reused in another file.
- The same JSX appears twice (DRY at the structural level — but three repetitions before you generalize).
- A piece has its own state that doesn't belong to the parent.

Don't split when:

- The pieces only make sense together and aren't reused.
- Splitting creates props-drilling pain across 3+ levels.

## Container vs Presentational — Mostly Outdated

The "container/presentational" split was useful before hooks. With hooks, prefer **co-locating state with the component that uses it** and lifting only when necessary. Splitting one logical unit into `FooContainer.tsx` + `FooView.tsx` adds files without buying much.

## Related

- [hooks.md](hooks.md) — extract behavior into hooks instead of HOCs
- [state-management.md](state-management.md) — when to use Context vs lift vs store
