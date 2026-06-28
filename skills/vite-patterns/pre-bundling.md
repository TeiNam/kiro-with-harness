# Dependency Pre-Bundling

Vite uses esbuild to convert CJS/UMD deps to ESM and reduce request count. The cache lives at `node_modules/.vite/` and is the source of most "phantom" issues after dependency changes.

## Why It Exists

1. **CJS interop**: native ESM in the browser can't import CJS. Pre-bundling rewrites CJS deps to ESM.
2. **Request reduction**: a deeply-nested dep with hundreds of files becomes one ESM bundle, served as one request.

This is a one-time cost on first dev start; subsequent starts read from cache.

## When to Configure

Default usually works. Configure when:

- A CJS package fails to import → force include.
- A package with deep imports (`lodash-es/get`, `@mui/material/Button`) is slow → force include.
- A package is already valid ESM and you want to skip the pre-bundle pass → exclude.

```ts
optimizeDeps: {
  include: [
    'lodash-es',
    'cjs-package',
    'deep-lib/components/**',     // glob for deep imports
    '@mui/material > @mui/system', // sub-dependency forcing
  ],
  exclude: [
    'local-esm-package',           // must be valid ESM if excluded
  ],
  esbuildOptions: {
    // Custom esbuild plugins for pre-bundling
  },
}
```

## Common Failures and Fixes

### "The requested module 'foo' does not provide an export named 'bar'"

A CJS package that wasn't pre-bundled, so the named export doesn't exist on the namespace. Force include:

```ts
optimizeDeps: { include: ['foo'] }
```

### "[plugin:vite:dep-scan] Failed to resolve entry"

Pre-bundle scanner couldn't find the entry point. Usually a malformed `package.json` `main`/`exports`. Workaround:

```ts
optimizeDeps: { exclude: ['broken-package'] }
```

…and use the package via dynamic import or a wrapper that resolves correctly.

### Phantom Errors After `npm install`

Cache is stale. Two options:

```bash
rm -rf node_modules/.vite
```

Or force re-optimize at start:

```ts
optimizeDeps: { force: true }    // remove after fixing — leaves cache off
```

Don't keep `force: true` in committed config — it disables the cache.

## Glob Patterns for Deep Imports

If the package has many subpaths used at runtime:

```ts
optimizeDeps: {
  include: [
    'react-icons/fi',         // forces icon set's barrel
    'firebase/app',
    'firebase/auth',
  ],
}
```

Each top-level subpath needs its own entry (Vite doesn't auto-discover them).

## Excluding Local Workspaces

In monorepos, your own workspace packages are valid ESM and shouldn't be pre-bundled (they'd lose HMR):

```ts
optimizeDeps: {
  exclude: ['@my-org/shared', '@my-org/ui'],
}
```

Vite v6+ usually handles this automatically when packages are workspace members.

## Forcing Re-optimization on `package.json` Change

Vite already detects `package.json` changes and re-bundles. If you've patched `node_modules` directly (with `patch-package` or `pnpm patch`), bump the cache:

```bash
rm -rf node_modules/.vite
```

## `optimizeDeps.esbuildOptions` — Custom esbuild Plugins

Rare, but needed when a dependency has unusual asset imports (`.svg`, `.css` from JS):

```ts
optimizeDeps: {
  esbuildOptions: {
    loader: { '.svg': 'dataurl' },
    plugins: [
      // Custom esbuild plugin for the pre-bundle pass
    ],
  },
}
```

## Diagnostic Logs

```bash
vite --debug                    # everything
DEBUG=vite:deps vite           # only dep optimization
```

Logs show which packages were scanned, which were pre-bundled, and timing.

## Avoid Auto-Forcing Common Deps

Some advice online suggests blanket `include: [react, react-dom, ...]`. **Don't.** Vite's heuristics are good — manually including everything just adds cold-start time. Only force what causes errors.

## Don't Pre-Bundle Source Maps

Pre-bundled deps have their own source maps. If a stack trace points into `node_modules/.vite/deps/...`, that's expected. Don't try to "fix" it.

## Pitfalls

- **Forgetting to clear `.vite` after patching deps.** Patches don't take effect until cache invalidates.
- **`exclude`-ing a CJS package** so it tries to load via native ESM and fails. CJS *must* be included or aliased.
- **`include` typos** are silent — `'react-iconz'` won't error, it just won't pre-bundle.
- **Confusing `optimizeDeps.include` (pre-bundling) with `build.rolldownOptions.external` (build output)** — they do opposite things at different stages.

## Related

- [config.md](config.md) — `optimizeDeps` location in config
- [performance.md](performance.md) — barrel files cause similar slowdowns
