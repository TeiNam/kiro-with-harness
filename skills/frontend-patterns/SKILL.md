---
name: frontend-patterns
description: >
  React + TypeScript frontend patterns: component composition, custom hooks,
  state management, data fetching, performance, forms, error boundaries,
  animations, accessibility. Trigger keywords: useState, useEffect,
  useReducer, useMemo, useCallback, useContext, useRef, custom hook,
  React.memo, Suspense, lazy, ErrorBoundary, Zustand, Redux, Jotai,
  TanStack Query, SWR, Zod, React Hook Form, framer-motion, virtualizer,
  ARIA, keyboard navigation, focus management, refactor react,
  review component, frontend review.
origin: harness
workloads: [frontend]
---

# Frontend Patterns (React + TypeScript)

Patterns for building maintainable, performant, accessible React applications. Targets React 18/19 + TypeScript ≥ 5.

## When to Activate

- Designing or reviewing React components
- Building custom hooks
- Picking a state management approach (local / Context / Zustand / Redux / Query)
- Data fetching with TanStack Query / SWR / RSC
- Performance work (memoization, virtualization, code splitting)
- Form handling (React Hook Form, Zod)
- Adding a11y to an existing component (focus, ARIA, keyboard)

## Frontend Defaults

- **React**: 18+ (concurrent features, Suspense for data). Prefer **function components**.
- **TypeScript**: ≥ 5; `strict: true` in `tsconfig.json`. Avoid `any`; prefer `unknown` then narrow.
- **State**: local first → lift if shared → Context for cross-tree config → Zustand/Jotai for app state → Query/SWR for server state. Don't reach for Redux unless you actually need its devtools/middleware.
- **Server state ≠ client state.** Use TanStack Query / SWR / RSC; don't store fetched data in local `useState`.
- **Forms**: React Hook Form + Zod (schema-validated, uncontrolled-by-default, fewer re-renders).
- **Styling**: project-driven (Tailwind, CSS Modules, vanilla-extract). Avoid runtime CSS-in-JS in new projects.
- **Accessibility**: every interactive element keyboard-reachable; every form input has a label.

## Naming Rules

- Components: `PascalCase.tsx` — file name matches default export.
- Hooks: `useCamelCase.ts` — must start with `use`.
- Types/interfaces: `PascalCase`. Props type: `<ComponentName>Props`.
- Event handlers: `handleX` (defined) / `onX` (prop).
- Boolean props: `isX` / `hasX` / `shouldX` / `canX`.

## Topic Index

| Topic | File | Use when |
|---|---|---|
| Component composition (compound, slots, render props) | [components.md](components.md) | Designing reusable building blocks |
| Custom hooks (rules, patterns, reusable hooks) | [hooks.md](hooks.md) | Extracting logic, deduping `useEffect` chains |
| State management strategy | [state-management.md](state-management.md) | Picking between useState / Context / Zustand / Redux |
| Server state (TanStack Query, SWR, mutations) | [server-state.md](server-state.md) | Fetching, caching, invalidation, optimistic UI |
| Performance (memo, virtualization, code split) | [performance.md](performance.md) | Slow renders, long lists, large bundles |
| Forms (RHF + Zod, controlled / uncontrolled) | [forms.md](forms.md) | New form, complex validation, async submit |
| Error boundaries & async errors | [error-boundaries.md](error-boundaries.md) | Crash isolation, fallback UIs |
| Animations (framer-motion, FLIP, spring) | [animations.md](animations.md) | List enter/exit, modals, page transitions |
| Accessibility (ARIA, focus, keyboard) | [accessibility.md](accessibility.md) | Modals, menus, custom controls |
| Anti-patterns | [anti-patterns.md](anti-patterns.md) | Code review checklist |

## Quick Reference

| Need | Pattern |
|---|---|
| Toggle / open / close | `useState<boolean>` + `setX(v => !v)` (or `useToggle`) |
| Side effect on prop change | `useEffect` with explicit dep array |
| Memoize expensive value | `useMemo(() => …, [deps])` — measure first |
| Stable callback for child | `useCallback(() => …, [deps])` |
| Skip unchanged re-render | `React.memo(Component)` + stable props |
| Long list | `useVirtualizer` from `@tanstack/react-virtual` |
| Lazy chunk | `const X = lazy(() => import("./X"))` + `<Suspense>` |
| Form | `useForm` (RHF) + `zodResolver(schema)` |
| Server data | TanStack `useQuery` / `useMutation` |
| Cross-tree value | Context + custom hook (`useTheme()`) |
| Imperative DOM | `useRef` + `ref={ref}` |

## Related Skills

- `vite-patterns` — build, dev server, plugin recipes
- `nextjs-turbopack` — Next.js app router specifics
- `liquid-glass-design` — visual direction for Apple-platform UI

**Remember**: ship behavior, not abstraction. Compose first, abstract only when the same pattern appears three times. Server state and client state belong in different tools.
