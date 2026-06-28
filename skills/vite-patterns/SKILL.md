---
name: vite-patterns
description: >
  Vite 6/7+ build tool patterns: config, plugins, HMR, env vars, dev proxy,
  library mode, dependency pre-bundling, build optimization, security
  pitfalls. Trigger keywords: vite.config.ts, vite.config.js, defineConfig,
  loadEnv, import.meta.env, VITE_, vite-plugin-checker, vite-tsconfig-paths,
  vite-plugin-dts, server.proxy, optimizeDeps, manualChunks, build.lib,
  rolldown, rollup, esbuild, oxc, HMR, import.meta.hot, vite preview,
  vite build, monorepo, docker vite, type check vite.
origin: harness (restructured)
workloads: [frontend]
---

# Vite Patterns

Build tool and dev-server patterns for Vite 6/7+. Configuration, plugins, HMR, env vars, library mode, common pitfalls.

## When to Activate

- Editing or auditing `vite.config.ts`
- Setting up env vars / `.env` files
- Configuring dev-server proxy for an API backend
- Optimizing build output (chunks, minification, assets)
- Publishing libraries with `build.lib`
- Troubleshooting dependency pre-bundling, CJS/ESM interop, HMR issues
- Choosing or ordering Vite plugins

## How Vite Works

- **Dev** — serves source files as native ESM. Transforms happen on demand per request → fast cold start, precise HMR.
- **Build** — Rolldown (v7+) or Rollup (v5–6) bundles for production with tree-shaking, code-splitting, and Oxc minification.
- **Pre-bundling** — esbuild converts CJS/UMD deps to ESM once, caches under `node_modules/.vite`. Subsequent starts skip the work.
- **Plugins** — share one interface across dev and build.
- **Env vars** — `VITE_`-prefixed are statically inlined at build time; everything else is invisible to client code.

## Defaults

- **Vite**: 6+ (Rolldown by default in v7+; Rollup before).
- **Minify**: `oxc` (default) or `terser`. Don't use deprecated `esbuild`.
- **Sourcemaps in prod**: `false` unless uploaded to an error tracker.
- **Type check**: Vite does NOT type-check. Add `vite-plugin-checker` *and* run `tsc --noEmit` in CI.
- **Aliases**: derive from `tsconfig.json` via `vite-tsconfig-paths` — don't hand-roll `resolve.alias`.
- **Env prefix**: stay on default `VITE_`. Never set to `''` (exposes all env vars).
- **Dev URL**: bind `host: true` only when needed (Docker, remote access).

## Topic Index

| Topic | File | Use when |
|---|---|---|
| `vite.config.ts` structure & key options | [config.md](config.md) | Setting up a config from scratch |
| Plugin selection & authoring custom plugins | [plugins.md](plugins.md) | Picking plugins, writing inline plugins |
| Env vars: `VITE_` rules, `loadEnv`, secrets | [env-vars.md](env-vars.md) | Configuring `.env`, exposing config to client |
| HMR & `import.meta.hot` | [hmr.md](hmr.md) | Custom stores, framework-agnostic modules |
| Dev server: proxy, host, fs, warmup | [dev-server.md](dev-server.md) | Backend proxy, Docker, monorepo file access |
| Build optimization (chunks, sourcemap) | [build.md](build.md) | Bundle size audit, vendor splitting |
| Library mode (`build.lib`, peer externals) | [library-mode.md](library-mode.md) | Publishing an npm package |
| Dependency pre-bundling | [pre-bundling.md](pre-bundling.md) | CJS/ESM interop errors, cache issues |
| Performance (barrels, extensions, profile) | [performance.md](performance.md) | Slow dev server, large monorepos |
| Security pitfalls (env leak, source maps) | [security.md](security.md) | Pre-launch checklist |
| Anti-patterns | [anti-patterns.md](anti-patterns.md) | Common mistakes |

## Quick Reference

| Need | Use |
|---|---|
| Type-safe config | `defineConfig({ ... })` |
| Per-mode config | `defineConfig(({ command, mode }) => ({ ... }))` |
| Read env in config | `loadEnv(mode, root, ['VITE_'])` |
| TypeScript path aliases | `vite-tsconfig-paths` plugin |
| Type check during dev | `vite-plugin-checker` |
| Backend proxy | `server.proxy['/api']: { target, changeOrigin: true }` |
| Container / remote dev | `server.host: true` |
| Pre-warm hot routes | `server.warmup.clientFiles: [...]` |
| Group vendor chunks | `build.rolldownOptions.output.manualChunks` |
| Library mode | `build.lib` + `rolldownOptions.external: [peer-deps]` |
| Smoke-test build | `vite build && vite preview` (NOT prod) |
| Profile slow dev | `vite --profile`, then load `.cpuprofile` in Speedscope |

## Related Skills

- `frontend-patterns` — React component patterns
- `nextjs-turbopack` — alternative bundler for Next.js
- `docker-patterns` — containerized dev with Vite

## See Also

- `_archive/SKILL-original.md` — original harness single-file version (449 lines).
- [vite.dev/guide](https://vite.dev/guide/) — official docs.

**Remember**: Vite is fast in dev because it skips bundling. Surprises happen when dev (esbuild transform) and build (Rolldown bundle) disagree — always smoke-test with `vite build && vite preview` before deploying.
