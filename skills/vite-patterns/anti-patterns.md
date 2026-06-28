# Anti-Patterns

Frequent mistakes — config-level and process-level.

## Config Anti-Patterns

### `envPrefix: ''`

```ts
// CATASTROPHIC — exposes ALL env vars (including server secrets) to the client
envPrefix: ''
```

Never. See [security.md](security.md).

### `loadEnv(mode, root, '')`

Same trap, different surface:

```ts
// BAD
const env = loadEnv(mode, process.cwd(), '')

// GOOD
const env = loadEnv(mode, process.cwd(), ['VITE_'])
```

### Using `require()` in App Source

```ts
// BAD — Vite is ESM-first
const lib = require('some-lib')

// GOOD
import lib from 'some-lib'
```

CommonJS in source breaks tree-shaking, HMR, and ESM-only deps. If a CJS dep won't import cleanly, fix at the boundary with `optimizeDeps.include`, not by reaching for `require`.

### Splitting Every `node_module` Into Its Own Chunk

```ts
// BAD — hundreds of tiny chunks; first load is hundreds of HTTP requests
manualChunks(id) {
  if (id.includes('node_modules')) {
    return id.split('node_modules/')[1].split('/')[0]
  }
}

// GOOD — group by category
manualChunks: {
  'react-vendor': ['react', 'react-dom'],
  'ui-vendor':    ['@radix-ui/react-dialog', '@radix-ui/react-popover'],
}
```

### Library Mode Without Externalizing Peers

```ts
// BAD — react gets bundled into your library, causing duplicate-runtime errors
build: {
  lib: { entry: 'src/index.ts', formats: ['es'] },
  // missing rolldownOptions.external
}

// GOOD
build: {
  lib: { entry: 'src/index.ts', formats: ['es'] },
  rolldownOptions: {
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },
}
```

### Deprecated `esbuild` Minifier

```ts
// BAD
build: { minify: 'esbuild' }   // deprecated

// GOOD
build: { minify: 'oxc' }       // default in v7+, fast + smaller
// or
build: { minify: 'terser' }     // smallest output, slower
```

### Reassigning `import.meta.hot.data`

```ts
// BAD — loses preserved state
import.meta.hot.data = { count: 0 }

// GOOD — mutate the existing object
import.meta.hot.data.count = 0
```

### Hand-Rolled Aliases Duplicating `tsconfig.json`

```ts
// BAD — drift between TS and Vite
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
    // ... 30 more entries
  },
}
```

```ts
// GOOD — one source of truth
plugins: [tsconfigPaths()]
```

### Sourcemaps Visible in Production

```ts
// BAD
build: { sourcemap: true }     // referenced from JS, exposes source

// GOOD
build: { sourcemap: false }    // default

// or for error tracker upload
build: { sourcemap: 'hidden' }
```

## Process Anti-Patterns

### Treating `vite preview` as a Production Server

`vite preview` is a smoke test for the built bundle, not a production server. It lacks proper caching headers, compression defaults, and security configuration.

Deploy `dist/` to:

- Cloudflare Pages, Vercel static, Netlify
- S3 + CloudFront
- NGINX in a container
- A multi-stage Dockerfile

### Expecting `vite build` to Type-Check

```bash
vite build      # transpiles, does NOT type-check
```

Type errors silently ship. Always:

1. Add `vite-plugin-checker` for dev overlay.
2. Run `tsc --noEmit` in CI before / alongside `vite build`.

### Shipping `@vitejs/plugin-legacy` By Default

`@vitejs/plugin-legacy` adds polyfills for legacy browsers — bloats bundles ~40%, breaks bundle analyzers, makes source maps confusing. Modern browsers cover the vast majority of users.

Gate on real analytics, not assumption. If you must ship it, document the size cost.

### Leaving Stale `node_modules/.vite` After Dep Changes

After upgrading a dep, patching with `pnpm patch`/`patch-package`, or switching git branches with different deps:

```bash
rm -rf node_modules/.vite
```

Stale pre-bundle cache causes phantom errors that survive page reload. Don't keep `optimizeDeps.force: true` permanently — it disables the cache.

### Running Two Type Checkers Concurrently

```ts
plugins: [
  checker({ typescript: true }),    // worker tsc
  fork-ts-checker({ ... }),         // also tsc??
]
```

Pick one. Editor's `tsserver` + `vite-plugin-checker` is enough; CI runs `tsc --noEmit` separately. Three concurrent checkers compete for CPU and produce duplicate errors.

### Including Every Dep in `optimizeDeps.include`

Vite's heuristics are good. Manually pre-bundling 50 deps "for safety" only adds cold-start time. Include only what's actually causing errors.

### Using Barrel Files Everywhere

```ts
// BAD — importing one symbol forces loading the whole barrel
import { slash } from '@/utils'

// GOOD
import { slash } from '@/utils/slash'
```

The Vite docs flag this as the **#1 dev-server slowdown**. See [performance.md](performance.md).

### Ignoring Bundle Size Drift

A new dep can quietly add 100kB. Without monitoring, this happens repeatedly until your bundle is 4MB.

Add `rollup-plugin-visualizer` and run it on a schedule (CI artifact, manual review). Or use a CI gate (`bundlesize`, `size-limit`).

## Quick Audit Checklist

- [ ] `loadEnv` uses explicit prefix list (never `''`).
- [ ] No secrets in `VITE_*` or `define`.
- [ ] `vite-plugin-checker` enabled.
- [ ] `tsc --noEmit` runs in CI.
- [ ] Library mode externalizes peer deps.
- [ ] No `manualChunks` per-package split.
- [ ] `build.minify` is `'oxc'` or `'terser'` (not `'esbuild'`).
- [ ] `build.sourcemap: false` or `'hidden'`.
- [ ] `vite-tsconfig-paths` instead of hand-rolled aliases.
- [ ] No barrel files in hot paths.
- [ ] `vite preview` confirms the bundle works.
- [ ] No `host: true` slipped into prod config.

## Related

- [security.md](security.md) — env / secrets
- [performance.md](performance.md) — barrel files, plugin stack
- [build.md](build.md) — minify, chunks
