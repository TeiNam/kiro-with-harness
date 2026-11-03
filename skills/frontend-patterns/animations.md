# Animations

## Contents

- Tooling
- List Enter / Exit
- Modals
- Layout Animation
- Variants — Reusable Animation States
- Gestures
- CSS Transitions Are Often Enough
- Respect `prefers-reduced-motion`
- View Transitions API
- Don't Animate Layout-Triggering Properties
- Performance
- Related

Animation should reinforce hierarchy and state changes — not decorate. Cheap, purposeful, accessible.

## Tooling

| Use case | Tool |
|---|---|
| Most UI transitions, list animations, gestures | `framer-motion` (`motion`, `AnimatePresence`) |
| Plain CSS transitions / view transitions | CSS + class toggles |
| Spring physics on imperative values | `react-spring` or `framer-motion`'s `useSpring` |
| Complex scroll-driven sequences | GSAP (especially ScrollTrigger) |
| Page transitions across routes | View Transitions API + framework integration |
| Scroll position / parallax | `framer-motion` `useScroll` |

For most apps, framer-motion alone covers 90% of needs.

## List Enter / Exit

```tsx
import { motion, AnimatePresence } from 'framer-motion'

export function ItemList({ items }: { items: Item[] }) {
  return (
    <AnimatePresence mode="popLayout">
      {items.map(item => (
        <motion.div
          key={item.id}
          layout
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          <ItemCard item={item} />
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
```

`AnimatePresence` keeps unmounted children rendered long enough to play their `exit` animation. `layout` makes siblings smoothly slide when an item is added/removed.

## Modals

```tsx
export function Modal({ isOpen, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

Two motion elements — overlay and content — each with its own animation. Overlay fades; content scales + slides.

## Layout Animation

`layout` is the single most useful prop in framer-motion. When the underlying layout changes (size, position, reorder), the element animates between old and new positions:

```tsx
<motion.div layout>
  {expanded ? <DetailedView /> : <CompactView />}
</motion.div>
```

`layoutId` cross-fades elements with the same id between unmount and mount — useful for hero transitions:

```tsx
{selectedId
  ? <motion.div layoutId={`card-${selectedId}`}><Detail /></motion.div>
  : items.map(i => <motion.div key={i.id} layoutId={`card-${i.id}`}><Card /></motion.div>)}
```

## Variants — Reusable Animation States

```tsx
const fade = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

<motion.div variants={fade} initial="hidden" animate="visible" />
```

Use variants when:

- Multiple elements share the same animation.
- A parent orchestrates child timing.

```tsx
const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const child = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

<motion.ul variants={container} initial="hidden" animate="visible">
  {items.map(i => <motion.li key={i.id} variants={child} />)}
</motion.ul>
```

`staggerChildren` plays each child's animation 50ms apart — much cleaner than computing delays per item.

## Gestures

```tsx
<motion.div
  drag="x"
  dragConstraints={{ left: -100, right: 100 }}
  dragElastic={0.2}
  whileTap={{ scale: 0.95 }}
  whileHover={{ scale: 1.05 }}
/>
```

`whileTap`, `whileHover`, `whileFocus`, `whileInView` are state-based variants without needing to track state yourself.

## CSS Transitions Are Often Enough

```css
.button {
  transition: transform 0.15s ease-out;
}
.button:hover {
  transform: scale(1.05);
}
```

For simple hover/focus/active states, CSS is faster, smaller, and doesn't ship a JS bundle. Reach for framer-motion when:

- The animation depends on React state (mount/unmount, list reordering).
- You need sequenced or staggered animations.
- You need spring physics or interruption mid-flight.

## Respect `prefers-reduced-motion`

Some users have motion-sensitivity settings turned on. Honor them:

```tsx
import { useReducedMotion } from 'framer-motion'

function Card() {
  const reduce = useReducedMotion()
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
    />
  )
}
```

Or in CSS:

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
```

## View Transitions API

The browser's View Transitions API gives smooth cross-fade and shared-element animations between document states. Frameworks are adding integrations (Next.js App Router, React Router 7).

```ts
document.startViewTransition(() => {
  setRoute('/about')
})
```

For supported flows, this is cheaper and more correct than reimplementing in JS.

## Don't Animate Layout-Triggering Properties

For 60fps animations, animate **transform** and **opacity** only. Top/left/width/height trigger layout and paint on every frame.

```css
/* Good */
transform: translateY(12px);

/* Bad — janks under load */
top: 12px;
```

framer-motion's `x`, `y`, `scale`, `rotate`, `opacity` props all use transform under the hood.

## Performance

- **Don't run too many animations at once** — 50+ animating elements is asking for jank.
- **Use `layout` sparingly on large trees** — it measures every child.
- **Use Intersection Observer** to start animations only when in view (`whileInView` does this).
- **Profile in DevTools Performance tab.** Look for "long animation frames" and dropped frames.

## Related

- [accessibility.md](accessibility.md) — `prefers-reduced-motion`, focus during transitions
