# Config Structure

`vite.config.ts` is your one source of truth — type-safe via `defineConfig`, mode-aware via the function form.

## Basic Config

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'
import checker from 'vite-plugin-checker'

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    checker({ typescript: true }),
  ],
})
```

Three plugins cover the foundation for a TypeScript React app:

- `@vitejs/plugin-react-swc` — HMR + Fast Refresh (faster than the Babel-based variant unless you need a Babel plugin).
- `vite-tsconfig-paths` — honors `tsconfig.json` `paths` so you don't duplicate aliases.
- `vite-plugin-checker` — runs `tsc` and (optionally) ESLint in a worker, with HMR overlay. Plugs the gap that `vite build` doesn't type-check.

## Mode-Aware Config

```ts
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_'])   // explicit prefix list

  return {
    plugins: [react()],
    server: command === 'serve' ? { port: 3000 } : undefined,
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL),
    },
  }
})
```

`command` is `'serve'` or `'build'`; `mode` is `'development'` / `'production'` / whatever you pass via `--mode`.

## Async Config

```ts
export default defineConfig(async () => {
  const remoteSchema = await fetchSchema()
  return { ... }
})
```

Rare — use only when config genuinely depends on async data (which is itself a smell).

## Key Config Options

| Key | Default | Use |
|---|---|---|
| `root` | `'.'` | Project root (where `index.html` lives) |
| `base` | `'/'` | Public base path for deployed assets — set when not at site root |
| `envPrefix` | `'VITE_'` | Don't change unless you have a strong reason; never set to `''` |
| `resolve.alias` | `{}` | Path aliases — prefer `vite-tsconfig-paths` |
| `define` | `{}` | Compile-time constant replacement — values are stringified |
| `css.modules` | enabled | CSS modules config |
| `server.port` | `5173` | Dev port |
| `server.host` | `'localhost'` | Bind address — `true` for `0.0.0.0` |
| `server.proxy` | `{}` | Backend proxy (see [dev-server.md](dev-server.md)) |
| `build.outDir` | `'dist'` | Output directory |
| `build.minify` | `'oxc'` | `'oxc'`, `'terser'`, or `false`. Don't use deprecated `'esbuild'` |
| `build.sourcemap` | `false` | `true`, `'inline'`, `'hidden'` |
| `build.target` | `'baseline-widely-available'` | Build target preset |
| `optimizeDeps.include` | `[]` | Force pre-bundle for CJS-interop fixes |

## `define` — Compile-Time Constants

```ts
define: {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
}
```

Values are inserted **as JavaScript expressions**, not as strings. `JSON.stringify` ensures the inserted text is a string literal:

```ts
// Correct
__API_URL__: JSON.stringify('https://api.example.com')
// → in code: "https://api.example.com"

// WRONG — would inline as a bare identifier
__API_URL__: 'https://api.example.com'
// → in code: https://api.example.com   (syntax error)
```

For TypeScript, declare the globals:

```ts
// vite-env.d.ts
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
```

## Resolving Aliases

Two valid styles:

**A. Inherit from `tsconfig.json`** (recommended):

```ts
plugins: [tsconfigPaths()]
```

Reads `paths` and `baseUrl` from `tsconfig.json`. One source of truth.

**B. Hand-roll**:

```ts
import { fileURLToPath } from 'node:url'

resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
  },
}
```

Use only if you don't have a `tsconfig.json` driving aliases. Don't duplicate.

## CSS

```ts
css: {
  modules: {
    localsConvention: 'camelCaseOnly',
    generateScopedName: '[name]_[local]_[hash:base64:5]',
  },
  preprocessorOptions: {
    scss: {
      additionalData: '@use "src/styles/_vars.scss" as *;',
    },
  },
  devSourcemap: true,
}
```

Tailwind v4 doesn't need explicit CSS config — its Vite plugin handles everything. Keep `css` config minimal unless you have specific needs.

## Plugin Ordering — `enforce`

```ts
plugins: [
  // 'pre' — runs before all default plugins
  myPreprocessor(),

  // (default) — runs in normal order
  react(),

  // 'post' — runs after default plugins (e.g. visualizer)
  visualizer({ enforce: 'post' }),
]
```

The `enforce` field on a plugin determines stage. Use `'post'` for analyzers that need the final bundle.

## TypeScript Setup

```jsonc
// tsconfig.json (Node-side, for vite.config.ts)
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

For the app itself, use `"moduleResolution": "bundler"` and `"types": ["vite/client"]` to get `ImportMetaEnv` types.

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_FEATURE_FLAG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

Now `import.meta.env.VITE_API_URL` is typed.

## Related

- [plugins.md](plugins.md) — what to install, what to write
- [env-vars.md](env-vars.md) — `loadEnv`, `VITE_` rules
