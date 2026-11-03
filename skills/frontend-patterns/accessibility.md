# Accessibility

## Contents

- Core Rules
- Buttons vs Links
- Form Labels
- Errors and Required Fields
- Keyboard Navigation
- Focus Management — Modals
- Skip Links
- Live Regions
- Color and Contrast
- Images
- ARIA Last Resort
- Testing
- Related

Every interactive element keyboard-reachable; every form input labeled; every state change announced. Most a11y wins come from semantic HTML — reach for ARIA only when the native element doesn't fit.

## Core Rules

1. **Use the semantic element first.** `<button>`, `<a href>`, `<label>`, `<dialog>`, `<details>` come with keyboard, focus, and screen-reader behavior for free.
2. **Every form input has a label.** Either `<label htmlFor>` + `<input id>` or wrap the input in `<label>`.
3. **Color is never the only signal.** Errors get a message + icon, not just red.
4. **Keyboard works everywhere a mouse does.** Tab to reach, Enter/Space to activate, Esc to dismiss.
5. **Focus is visible.** Don't `outline: none` without replacing it with something equally visible.
6. **`prefers-reduced-motion` is honored.** See [animations.md](animations.md).

## Buttons vs Links

```tsx
// Bad — div with click handler
<div onClick={handle} className="button">Save</div>

// Good — actual button (keyboard, focus, screen reader, form submit)
<button onClick={handle}>Save</button>

// Good — for navigation
<a href="/dashboard">Dashboard</a>
```

If it navigates → `<a>`. If it triggers an action → `<button>`. Never style a `<div>` or `<span>` to look like one without adding all the missing behavior (you'll forget some).

## Form Labels

```tsx
// Visible label
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// Wrapped (no `for` needed)
<label>
  Email
  <input type="email" />
</label>

// Visually hidden (icon-only, or label communicated elsewhere)
<label htmlFor="search" className="sr-only">Search</label>
<input id="search" type="search" placeholder="Search" />
```

`placeholder` is **not** a label — it disappears on focus and has poor contrast. Always use a real label, then a placeholder if you want it.

The `sr-only` utility (Tailwind has it; or define it):

```css
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
```

## Errors and Required Fields

```tsx
<label htmlFor="email">Email *</label>
<input
  id="email"
  type="email"
  required
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
/>
{errors.email && <span id="email-error" role="alert">{errors.email.message}</span>}
```

- `aria-invalid` flags the field as invalid for screen readers.
- `aria-describedby` links the error message so it's announced.
- `role="alert"` makes the error announced when it appears.

## Keyboard Navigation

For custom widgets (dropdowns, menus, comboboxes), implement standard key handlers:

| Key | Action |
|---|---|
| Tab / Shift+Tab | Move focus to next/prev focusable |
| Arrow keys | Move within a composite widget (menu items, tabs, listbox) |
| Enter / Space | Activate the focused control |
| Esc | Close popover / cancel |
| Home / End | First / last item |

```tsx
function Dropdown({ options, onSelect }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive(i => Math.min(i + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        onSelect(options[active])
        setOpen(false)
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  return (
    <div role="combobox" aria-expanded={open} aria-haspopup="listbox" onKeyDown={onKeyDown}>
      {/* … */}
    </div>
  )
}
```

WAI-ARIA Authoring Practices document standard patterns: combobox, dialog, menu, tabs, tree. When implementing one of these, **read the spec first** — there are subtle expectations.

## Focus Management — Modals

When a modal opens, move focus into it. When it closes, return focus to the trigger:

```tsx
export function Modal({ isOpen, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement
      ref.current?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  return isOpen ? (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      {children}
    </div>
  ) : null
}
```

Better yet: use `<dialog>` (the HTML element) — it handles focus, escape-to-close, and inert-on-the-rest-of-the-page natively.

For complex focus traps (within a modal, focus cycles through only the modal's elements), use `react-focus-lock` or `focus-trap-react`.

## Skip Links

A "Skip to main content" link as the first focusable element lets keyboard users bypass the nav:

```tsx
<a href="#main" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
…
<main id="main" tabIndex={-1}>…</main>
```

Visible only when focused. Standard for any site with significant nav.

## Live Regions

For non-form announcements (toasts, search-result count updates, async operation status):

```tsx
<div role="status" aria-live="polite" className="sr-only">
  {isLoading ? 'Loading results' : `${count} results`}
</div>
```

| `aria-live` | When to use |
|---|---|
| `polite` | Wait for screen reader to finish current speech |
| `assertive` | Interrupt — for actual errors / critical events |
| `off` | Don't announce |

Don't overuse `assertive` — it's interruptive.

## Color and Contrast

- WCAG AA: 4.5:1 contrast ratio for text against background; 3:1 for large text and UI elements.
- Don't convey state by color alone — pair with icons, text, or shape.
- Test in light AND dark mode.

Tools: Chrome DevTools' Lighthouse, axe DevTools extension, `@axe-core/react` for runtime warnings.

## Images

```tsx
<img src="/logo.png" alt="Acme Corp" />          // informative
<img src="/decoration.svg" alt="" />              // decorative — empty alt
<img src="/chart.png" alt="Q4 revenue grew 30% over Q3" />   // describe the data
```

If the alt text would just repeat surrounding text, use `alt=""`. Decorative images without `alt` at all confuse screen readers — empty alt explicitly says "skip me."

## ARIA Last Resort

The first rule of ARIA: **don't use ARIA**. Use a semantic element. ARIA is for cases the platform doesn't have an element for (or you're stuck supporting an existing widget):

- `aria-label` — for icon-only buttons.
- `aria-describedby` — for help text and error messages.
- `aria-expanded`, `aria-haspopup`, `aria-controls` — for disclosure widgets.
- `role="status"`, `role="alert"`, `role="dialog"` — when no native element fits.

Wrong ARIA is worse than no ARIA. `<div role="button" tabIndex={0}>` is missing 5 things `<button>` has.

## Testing

| Test | How |
|---|---|
| Keyboard | Tab through every flow with no mouse |
| Screen reader | macOS VoiceOver (Cmd+F5), Windows NVDA, JAWS |
| Lint | ESLint plugin `jsx-a11y` |
| Runtime | `@axe-core/react` in dev; CI with `axe-playwright` |
| Visual | Lighthouse a11y score; review at 200% browser zoom |

Add `eslint-plugin-jsx-a11y` to your linter as a baseline — it catches missing alt, no-noninteractive-element-interactions, no-static-element-interactions, label-has-associated-control, etc.

## Related

- [components.md](components.md) — semantic HTML in compound components
- [forms.md](forms.md) — labels, error announcements
- [animations.md](animations.md) — `prefers-reduced-motion`
