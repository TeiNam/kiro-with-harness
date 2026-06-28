# HMR — `import.meta.hot`

Framework plugins handle HMR for you. Reach for `import.meta.hot` directly only when building custom state stores, dev tools, or framework-agnostic utilities that need to persist state across updates.

## Framework Plugins Do This For You

| Plugin | What it gives you |
|---|---|
| `@vitejs/plugin-react` / `-react-swc` | React Fast Refresh — components keep state across edits |
| `@vitejs/plugin-vue` | Vue HMR for SFCs |
| `@vitejs/plugin-svelte` | Svelte HMR |
| `solid-js/vite-plugin` | SolidJS HMR |

If your code is in a framework component, you don't write `import.meta.hot` yourself.

## Manual HMR for a Vanilla Module

```ts
// src/store.ts
let state = { count: 0 }

export function increment() {
  state.count++
  notify()
}

export function getState() {
  return state
}

if (import.meta.hot) {
  // Persist state across updates — must MUTATE, never reassign .data
  import.meta.hot.data.state = import.meta.hot.data.state ?? state
  state = import.meta.hot.data.state

  // Cleanup any side effects before module is replaced
  import.meta.hot.dispose((data) => {
    data.state = state
  })

  // Accept this module's own updates
  import.meta.hot.accept()
}
```

All `import.meta.hot.*` code is tree-shaken from production builds — no `if (process.env.NODE_ENV) ...` guards needed.

## Key APIs

| API | Purpose |
|---|---|
| `import.meta.hot.accept()` | Accept self-updates |
| `import.meta.hot.accept((module) => ...)` | Accept self-updates with the new module |
| `import.meta.hot.accept(['./dep.ts'], ([dep]) => ...)` | Accept specific dep updates |
| `import.meta.hot.dispose((data) => ...)` | Cleanup before replacement |
| `import.meta.hot.invalidate()` | Force full reload from this module |
| `import.meta.hot.data` | Object preserved across updates (mutate, don't reassign) |
| `import.meta.hot.on('event', cb)` | Listen for custom events from server plugins |

## Mutate `data`, Don't Reassign

```ts
// CORRECT — mutate the existing object
import.meta.hot.data.state = state
import.meta.hot.data.count = 42


// WRONG — reassignment loses preserved state
import.meta.hot.data = { state, count: 42 }
```

`data` is the same object across updates; reassigning loses the reference Vite tracks.

## When Auto-Accept Fails

```ts
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (!newModule) return                    // module errored
    // Manually re-apply state from newModule
    swapImplementation(newModule)
  })
}
```

The callback runs when a new version arrives. Returning early or throwing causes Vite to fall back to a full page reload.

## Custom HMR Events from Plugins

A plugin can emit events; your code listens:

```ts
// plugin
server.hot.send('my-event', { foo: 'bar' })

// in client code
if (import.meta.hot) {
  import.meta.hot.on('my-event', (data) => {
    console.log(data.foo)
  })
}
```

Useful for plugin-driven dev features (config changes, content updates).

## `hotUpdate` (v7+) — Plugin-Side HMR Customization

Replaces the deprecated `handleHotUpdate`. In a plugin:

```ts
{
  name: 'my-hmr-plugin',
  hotUpdate(ctx) {
    // ctx.modules: modules being updated
    // ctx.file: file path
    // ctx.read: () => Promise<string>
    // ctx.timestamp: timestamp of the change

    if (ctx.file.endsWith('.special')) {
      ctx.server.hot.send({
        type: 'custom',
        event: 'special-changed',
        data: { file: ctx.file },
      })
      return []   // suppress default behavior
    }
  },
}
```

## When HMR Becomes "Full Reload"

If a module can't be HMR'd cleanly, Vite reloads the page. Common causes:

- The module exports a top-level binding that's used at the very entry (`main.tsx`).
- A framework boundary doesn't apply (changing a non-component default export).
- The module has side effects at top level that can't be undone.
- Throws during evaluation.

To force a reload deliberately:

```ts
if (import.meta.hot) {
  import.meta.hot.invalidate()
}
```

## Pitfalls

- **State you want to preserve isn't in `data`.** Anything not in `import.meta.hot.data` is reset every update.
- **Subscribing to events without unsubscribing in `dispose`.** Listeners accumulate across updates → memory leaks and double-handling.
- **Reassigning `data`.** See above.
- **Trying to HMR a module that has `await` at top level.** Top-level await blocks the module graph — incompatible with HMR's incremental swap.

## Related

- [config.md](config.md) — plugin order matters for HMR
- [plugins.md](plugins.md) — `hotUpdate` hook in custom plugins
