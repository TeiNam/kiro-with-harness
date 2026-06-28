# Plugins

Most plugin needs are covered by maintained packages. Reach for those before authoring your own.

## Essential Plugins

| Plugin | Purpose | When |
|---|---|---|
| `@vitejs/plugin-react-swc` | React HMR + Fast Refresh via SWC | Default for React apps |
| `@vitejs/plugin-react` | React HMR via Babel | Only if you need Babel plugins (emotion, MobX decorators) |
| `@vitejs/plugin-vue` | Vue 3 SFC support | Vue apps |
| `vite-plugin-checker` | `tsc` + ESLint in worker w/ HMR overlay | **Any TypeScript app** — Vite does NOT type-check on `vite build` |
| `vite-tsconfig-paths` | Honors `tsconfig.json` `paths` | Any project with TS aliases |
| `vite-plugin-dts` | Emit `.d.ts` in library mode | Publishing TS libraries |
| `vite-plugin-svgr` | Import SVGs as React components | React apps |
| `rollup-plugin-visualizer` | Bundle treemap | Bundle audits (use `enforce: 'post'`) |
| `vite-plugin-pwa` | Workbox PWA setup | Offline-capable apps |
| `vite-plugin-inspect` | Visualize the transform pipeline | Debug plugin issues |

## Critical: Vite Does Not Type-Check

`vite build` transpiles, doesn't type-check. Type errors silently ship to production. Two protections:

1. **Add `vite-plugin-checker`** for the dev overlay.
2. **Run `tsc --noEmit` in CI** so a green build proves both transpilation and types.

```yaml
# CI step
- run: npx tsc --noEmit
- run: npm run build
```

## Authoring Custom Plugins

Authoring is rare. Start inline in `vite.config.ts` — only extract to a package when reused.

```ts
import type { Plugin } from 'vite'

function myPlugin(): Plugin {
  return {
    name: 'my-plugin',          // required, must be unique
    enforce: 'pre',              // 'pre' | 'post' (optional)
    apply: 'build',              // 'build' | 'serve' (optional)

    transform(code, id) {
      if (!id.endsWith('.custom')) return
      return { code: transformCustom(code), map: null }
    },
  }
}
```

## Key Plugin Hooks

| Hook | Purpose |
|---|---|
| `transform(code, id)` | Modify a module's source |
| `resolveId(id)` + `load(id)` | Virtual modules |
| `transformIndexHtml(html)` | Inject into `index.html` (tags, meta) |
| `configureServer(server)` | Add middleware to dev server |
| `hotUpdate(ctx)` | Custom HMR (replaces `handleHotUpdate` in v7+) |
| `buildStart` / `buildEnd` | Lifecycle hooks |
| `closeBundle` | After write — final cleanup, post-processing |

## Virtual Modules

A virtual module is a fake file that doesn't exist on disk. Useful for compile-time generated content.

```ts
function virtualPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:my-config'
  const RESOLVED_ID = '\0' + VIRTUAL_ID    // \0 prefix → other plugins skip

  return {
    name: 'virtual-config',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export const config = ${JSON.stringify(buildConfig())}`
      }
    },
  }
}

// In source code
import { config } from 'virtual:my-config'
```

For TypeScript, declare the module:

```ts
// vite-env.d.ts
declare module 'virtual:my-config' {
  export const config: Record<string, unknown>
}
```

## `transformIndexHtml`

Inject script tags, meta, environment-derived bits:

```ts
function htmlInjector(): Plugin {
  return {
    name: 'html-injector',
    transformIndexHtml(html, ctx) {
      return [
        {
          tag: 'meta',
          attrs: { name: 'build-time', content: new Date().toISOString() },
          injectTo: 'head',
        },
      ]
    },
  }
}
```

## `configureServer` — Dev Middleware

```ts
function devApiMock(): Plugin {
  return {
    name: 'dev-api-mock',
    configureServer(server) {
      server.middlewares.use('/api/health', (_req, res) => {
        res.statusCode = 200
        res.end(JSON.stringify({ ok: true }))
      })
    },
  }
}
```

For real backend stubbing, prefer `msw` over middleware-based mocks — same fixtures work in tests and Storybook.

## `apply: 'serve' | 'build'`

```ts
{
  name: 'analyzer',
  apply: 'build',         // skip during dev — only run on `vite build`
  ...
}
```

Saves dev-server overhead for plugins that only matter at build time.

## Functional Form

`apply` and `enforce` can be functions for fine-grained control:

```ts
{
  name: 'cond',
  apply(config, { command, mode }) {
    return command === 'build' && mode === 'production'
  },
}
```

## Plugin Ordering

```ts
plugins: [
  // pre-stage — alias rewriting, source-map prep
  vitePreStage(),

  // default-stage — framework plugins
  react(),
  vue(),

  // post-stage — analysis, visualization
  visualizer({ enforce: 'post' }),
]
```

Order matters when plugins depend on each other (a transform that needs another plugin's resolution to run first). When you see "transform of X is undefined" issues, the order is usually wrong.

## Debugging Plugins

```bash
vite --debug                            # verbose Vite logs
DEBUG=vite:* vite                       # all namespaces
DEBUG=vite:resolve,vite:plugin vite     # specific
```

`vite-plugin-inspect` adds a `/__inspect/` page in dev showing every transform applied to every module — great for "why is my code being modified."

## Related

- [config.md](config.md) — where plugins live in the config
- [performance.md](performance.md) — `vite --profile` to find slow plugins
