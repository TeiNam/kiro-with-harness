# Build Optimization

Production output settings: minifier, sourcemaps, manual chunks, build target.

## Defaults Worth Setting

```ts
build: {
  target: 'baseline-widely-available',   // sensible default for modern browsers
  minify: 'oxc',                          // (default in v7+) — fast, smaller than terser
  sourcemap: false,                       // unless uploading to error tracker
  cssCodeSplit: true,                     // (default) one CSS file per async chunk
  reportCompressedSize: false,            // disable for faster builds in CI
  chunkSizeWarningLimit: 500,             // kB — warn about large chunks
}
```

## Minifier — Use `oxc`

| Minifier | Note |
|---|---|
| `'oxc'` | Default in v7+. Fast, good output. **Recommended.** |
| `'terser'` | Smaller output by ~5%, slower. Add `terser` as devDependency. Use for size-critical libraries. |
| `'esbuild'` | **Deprecated** — don't use in new projects. |
| `false` | Skip minification entirely (debugging). |

```ts
build: {
  minify: 'terser',
  terserOptions: {
    compress: { drop_console: true, drop_debugger: true },
    format: { comments: false },
  },
}
```

## Sourcemaps

```ts
build: {
  sourcemap: false,         // default — keep this for prod
  // sourcemap: 'hidden',   // include for upload, don't reference in JS
  // sourcemap: 'inline',   // dev / debugging
  // sourcemap: true,       // referenced from JS — DON'T do this in prod
}
```

`true` leaks your original source. `'hidden'` writes the sourcemap file but no `//# sourceMappingURL` comment in the JS — you upload it to Sentry/Bugsnag and delete locally.

## Manual Chunks

By default, Vite splits chunks per dynamic import + a vendor heuristic. Manual chunks group specific modules together for better caching:

```ts
build: {
  rolldownOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'ui-vendor':    ['@radix-ui/react-dialog', '@radix-ui/react-popover'],
        'data-vendor':  ['@tanstack/react-query', 'zustand'],
      },
    },
  },
}
```

When React is in its own chunk, the React file URL stays stable across deploys — users keep the cached copy as long as the React version doesn't change.

### Function Form

```ts
manualChunks(id) {
  if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
    return 'react-vendor'
  }
  if (id.includes('node_modules')) {
    return 'vendor'
  }
}
```

### Don't Split Per Package

```ts
// BAD — creates one chunk per node_module package
manualChunks(id) {
  if (id.includes('node_modules')) {
    return id.split('node_modules/')[1].split('/')[0]
  }
}
```

Hundreds of tiny files = hundreds of HTTP requests on first load. Group instead.

## Build Target

`build.target` controls which JS features survive. Values:

| Target | Effect |
|---|---|
| `'baseline-widely-available'` | Default — broad modern browser support |
| `'esnext'` | Latest features, smallest output, recent browsers only |
| `['es2022', 'edge100', 'firefox100', 'chrome100', 'safari16']` | Explicit per-engine targets |

For internal apps, `'esnext'` is fine. For public sites, the default is the safer pick.

`@vitejs/plugin-legacy` adds polyfills for *legacy* browsers — but it bloats bundles ~40% and breaks bundle analyzers. Only ship if real analytics show usage.

## Asset Handling

```ts
build: {
  assetsInlineLimit: 4096,    // bytes — files smaller than this are inlined as data URIs
}
```

For small images / SVG that would each cost an HTTP request, inlining helps. Tune to your case.

```ts
// In code — explicit URL imports
import logoUrl from './logo.svg?url'
import logoSvg from './logo.svg?raw'           // raw text content
import logoData from './logo.svg?inline'        // forced data URI
```

## CSS Code Splitting

`build.cssCodeSplit: true` (default) emits one CSS file per async chunk. The page only loads CSS for code currently mounted.

Disable only for libraries shipping a single CSS bundle:

```ts
build: {
  cssCodeSplit: false,
  lib: { ... },
}
```

## Disable Compressed Size Reporting

CI builds spend significant time computing gzip sizes for the report:

```ts
build: {
  reportCompressedSize: false,
}
```

Disable in CI for faster builds; keep enabled locally if you watch sizes.

## Bundle Visualization

```ts
import { visualizer } from 'rollup-plugin-visualizer'

plugins: [
  visualizer({
    enforce: 'post',      // run after final bundle
    filename: 'dist/stats.html',
    open: false,
    gzipSize: true,
    brotliSize: true,
    template: 'treemap',  // or 'sunburst', 'network'
  }),
]
```

Run `vite build` and open `dist/stats.html` to see what's eating bytes. The biggest wins usually come from:

- Tree-shaking failures (importing whole library when you only use one function).
- Duplicate dependencies (different versions of the same package).
- Heavy runtime polyfills (consider `target: 'esnext'`).

## Output Naming

```ts
build: {
  rolldownOptions: {
    output: {
      entryFileNames: 'assets/[name]-[hash].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash].[ext]',
    },
  },
}
```

Hashes invalidate caches on change. The defaults are sensible — change only for legacy CDN paths or specific deploy targets.

## Pre-Build / Post-Build Hooks

```ts
{
  name: 'cleanup',
  closeBundle() {
    // Runs after all files are written.
    // Good for: copy assets, generate manifests, post-process.
    fs.copyFileSync('public/healthcheck.txt', 'dist/healthcheck.txt')
  },
}
```

## Smoke Test Before Deploy

```bash
vite build && vite preview
```

Always test the built bundle locally before deploy. Many subtle bugs only show in production builds:

- CJS dep that worked via esbuild dev transform but breaks in Rolldown.
- Plugin ordering issue.
- Tree-shaking removing code with side effects you weren't aware of.
- Sourcemap leak if `sourcemap: true` slipped in.

`preview` is a smoke test, not a production server.

## Stale Chunks After Deploy

New builds produce new chunk hashes. Users with active sessions (lazy-loaded routes not yet visited) request old filenames that no longer exist on the CDN:

```
GET /assets/Dashboard-old-hash.js → 404
→ "Failed to fetch dynamically imported module"
```

Vite has no built-in solution. Mitigations:

1. **Keep old `dist/assets/*` files live for a deployment window** — tag-based deploys to a CDN, retain N most recent.
2. **Catch dynamic import errors in your router and force a reload**:

```ts
try {
  await import('./Dashboard')
} catch (err) {
  // Likely "failed to fetch dynamically imported module"
  if (err instanceof Error && err.message.includes('dynamically imported module')) {
    window.location.reload()
  } else {
    throw err
  }
}
```

## Related

- [library-mode.md](library-mode.md) — `build.lib` for npm packages
- [performance.md](performance.md) — finding slow plugins
