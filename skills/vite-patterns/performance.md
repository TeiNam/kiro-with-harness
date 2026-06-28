# Performance

Slow `vite dev` is almost always a small set of repeat offenders.

## Avoid Barrel Files

Barrel files (`index.ts` re-exporting everything from a directory) force Vite to load every re-exported file even when you import a single symbol.

```ts
// BAD — importing one util forces Vite to load the whole utils/ directory
import { slash } from '@/utils'

// GOOD — direct import, only the one file is loaded
import { slash } from '@/utils/slash'
```

The Vite docs flag this as the **#1 dev-server slowdown**. Costlier in larger codebases.

If a barrel is unavoidable for ergonomics:

- Keep barrels narrow — re-export 5 things, not 500.
- For library entry points (one barrel that consumers import), it's necessary; just keep the surface lean.

## Be Explicit With Import Extensions

Each implicit extension forces Vite to try multiple file extensions until one resolves:

```ts
// BAD — Vite checks Component.ts, .tsx, .js, .jsx, .mts, .mjs in order
import Component from './Component'

// GOOD
import Component from './Component.tsx'
```

For large codebases this adds up. Configure narrowly:

```ts
// vite.config.ts
resolve: {
  extensions: ['.ts', '.tsx', '.js'],     // remove ones you don't use
}
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,    // lets you import './foo.ts' explicitly
    "noEmit": true
  }
}
```

## Warm Up Hot-Path Routes

`server.warmup.clientFiles` pre-transforms known entry points before the browser requests them, eliminating the cold-load waterfall:

```ts
server: {
  warmup: {
    clientFiles: [
      './src/main.tsx',
      './src/routes/**/*.tsx',
      './src/components/Header.tsx',
      './src/components/Footer.tsx',
    ],
  },
}
```

The first navigation feels instant instead of waiting for on-demand transforms of every imported module.

## Profile Slow Dev Servers

When `vite dev` feels slow:

```bash
vite --profile
# interact with the app, then press p+enter to save a .cpuprofile
```

Load the file in [Speedscope](https://www.speedscope.app) — find which plugins eat time. Usually:

- `buildStart` / `config` / `configResolved` hooks in community plugins.
- A monorepo plugin doing too much resolution work.
- Overzealous TS checker doing unnecessary work — switch to in-worker mode.

## Trim `tsconfig` Includes

```jsonc
{
  "include": ["src/**/*"],
  "exclude": ["**/node_modules", "**/.git", "dist", "**/*.test.ts"]
}
```

`vite-plugin-checker` and `tsc` re-scan everything that matches `include`. Excluding tests and stories from the type-check pass speeds up dev meaningfully (run them separately in CI).

## Don't Pre-Bundle Everything

```ts
optimizeDeps: {
  include: ['react', 'react-dom', 'lodash', 'rxjs', /* ... 50 more */],
}
```

Don't. Vite's heuristics are good — pre-bundling extras only adds cold-start time. Force include only when there's a concrete error.

## Limit Plugin Stack

Each plugin runs on every transformed module. A 12-plugin stack with two checkers, three formatters, and four transformers will be slow.

- Combine where possible (e.g. one `vite-plugin-checker` instead of separate ESLint + tsc plugins).
- Drop plugins you can't justify per save cycle.
- Move non-critical plugins to `apply: 'build'` only.

## Don't Run Two Type Checkers

```ts
plugins: [
  checker({ typescript: true }),
  // also tsc-watch elsewhere?
]
```

Pick one — the editor (`tsserver` via your IDE) plus `vite-plugin-checker` is enough. CI runs `tsc --noEmit` separately. Three concurrent checkers compete for CPU.

## Disable `reportCompressedSize` in CI

```ts
build: {
  reportCompressedSize: false,
}
```

Computing gzip/brotli sizes for every chunk takes seconds in large apps. Disable in CI; keep for local builds when you watch sizes.

## Workspace File Watching

In monorepos, Vite may end up watching too much:

```ts
server: {
  watch: {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/.turbo/**',
    ],
  },
}
```

The defaults are sensible, but if file change events are slow or noisy, this is the lever.

## Profile the Build

```bash
vite build --debug | tee build.log
```

Bundle analysis with `rollup-plugin-visualizer`:

```ts
import { visualizer } from 'rollup-plugin-visualizer'

plugins: [
  visualizer({ enforce: 'post', filename: 'dist/stats.html', gzipSize: true }),
]
```

Look at:

- Modules in the wrong chunk.
- Duplicates (different versions of the same package).
- Large dependencies you can replace or lazy-load.

## Memory During Build

Large builds can OOM Node:

```bash
NODE_OPTIONS=--max-old-space-size=4096 vite build
```

Address the cause first (huge dynamic imports, leaking watchers); raise the limit only if necessary.

## Pitfalls

- **`vite dev` is fast on second start, slow on first.** Pre-bundling. Once cached, it skips. Don't `rm -rf node_modules/.vite` unless solving an actual problem.
- **Slow saves on a specific file.** Plugin transform cost. Use `vite-plugin-inspect` (in dev) to see how many transforms ran on it.
- **Slow TypeScript checking.** Trim tsconfig `include`, use project references for monorepos, don't run two checkers.
- **HMR feels laggy.** Often a network/proxy issue: check `server.hmr.clientPort` if behind a proxy.

## Related

- [pre-bundling.md](pre-bundling.md) — `optimizeDeps` cache
- [dev-server.md](dev-server.md) — `server.warmup`
