# Library Mode

When publishing an npm package, use `build.lib` instead of the default app bundling. Two pitfalls dominate; the rest is config.

## Two Pitfalls That Will Bite

1. **Types are not emitted by default.** Add `vite-plugin-dts` or run `tsc --emitDeclarationOnly` separately.
2. **Peer dependencies must be externalized.** Otherwise React (and any peer) gets bundled into your library, causing duplicate-runtime errors and version conflicts in consumers.

## Minimal Library Config

```ts
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'MyLib',                 // global name for UMD/IIFE builds
      formats: ['es', 'cjs'],         // skip 'iife' / 'umd' unless you need <script> consumption
      fileName: (format) => `my-lib.${format}.js`,
    },
    rolldownOptions: {
      // EVERY peer dep, plus react/jsx-runtime variants
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
      ],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM' },
      },
    },
    sourcemap: true,                  // libraries should ship sourcemaps
  },
})
```

## `package.json` Exports

```jsonc
{
  "name": "my-lib",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/my-lib.cjs.js",
  "module": "./dist/my-lib.es.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/my-lib.es.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/my-lib.cjs.js"
      }
    },
    "./styles.css": "./dist/styles.css",
    "./package.json": "./package.json"
  },
  "files": ["dist"],
  "sideEffects": ["**/*.css"],
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

| Field | Why |
|---|---|
| `type: module` | Default exports as ESM |
| `main` / `module` / `types` | Legacy fallbacks |
| `exports` | Modern resolution — required for proper conditional exports |
| `files` | What gets published (subset of repo) |
| `sideEffects` | Tree-shaking hint — `false` if your library has no side effects, or list files that do |
| `peerDependencies` | Versions of peers your lib supports |

`sideEffects: false` enables aggressive tree-shaking. If you ship CSS or any module with init code, list those: `["**/*.css", "./src/init.js"]`.

## Multiple Entry Points

```ts
build: {
  lib: {
    entry: {
      index: 'src/index.ts',
      hooks: 'src/hooks/index.ts',
      utils: 'src/utils/index.ts',
    },
    formats: ['es'],
  },
}
```

Then in `package.json`:

```jsonc
"exports": {
  ".":      { "import": "./dist/index.js",  "types": "./dist/index.d.ts"  },
  "./hooks":{ "import": "./dist/hooks.js",  "types": "./dist/hooks.d.ts"  },
  "./utils":{ "import": "./dist/utils.js",  "types": "./dist/utils.d.ts"  }
}
```

Consumers `import { x } from 'my-lib/hooks'` and only that subpath's code is loaded.

## CSS in Libraries

For component libraries:

```ts
build: {
  cssCodeSplit: false,         // emit one CSS file
  lib: { ... },
}
```

```jsonc
"exports": {
  ".": "./dist/my-lib.es.js",
  "./styles.css": "./dist/style.css"
}
```

Consumers import the CSS once: `import 'my-lib/styles.css'`.

If you'd rather ship CSS inline (CSS-in-JS, Emotion, vanilla-extract), the bundler handles it automatically — but consumers can't tree-shake style code.

## Externalize React Variants

React 17+ needs both `react` and `react/jsx-runtime` externalized — the new JSX transform imports `jsx`/`jsxs` from `react/jsx-runtime`:

```ts
external: [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]
```

Or use a regex to externalize anything starting with `react`:

```ts
external: (id) => /^react($|\/)/.test(id) || /^react-dom($|\/)/.test(id),
```

## Dual-Format Output

Most modern libraries ship both ES and CJS so they work in any consumer:

```ts
formats: ['es', 'cjs']
```

If you target only modern bundlers and Node ≥ 14, ES-only is fine and simpler. Add `"engines": { "node": ">=14" }` and document that consumers need ESM.

## Bundling vs Externalizing Dependencies

| Dep type | Bundle? |
|---|---|
| `dependencies` | Bundle (or externalize and document) |
| `peerDependencies` | **Externalize** |
| `devDependencies` | Should not appear in source |

For utility libraries, bundling small dependencies is fine. For React component libraries, externalize `react` always; bundle everything else if it's small and tree-shakeable.

## Verify the Output

```bash
vite build
ls -lh dist/
node -e "console.log(Object.keys(require('./dist/my-lib.cjs.js')))"
```

Or use `attw` (Are The Types Wrong?) to validate package exports:

```bash
npx @arethetypeswrong/cli --pack
```

Catches missing types, bad ESM/CJS resolution, broken `exports`.

## CI Publish

```yaml
# .github/workflows/publish.yml
- run: npm ci
- run: npm test
- run: npx tsc --noEmit
- run: npm run build
- run: npx @arethetypeswrong/cli --pack
- run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Use `changesets` or `semantic-release` for version bumps + changelog.

## Pitfalls

- **Forgot to externalize React.** Symptom: consumer renders fine alone but breaks with another React-using library — two React instances, hooks fail.
- **No `vite-plugin-dts`**, no `tsc --emitDeclarationOnly`. Symptom: consumers get `any` for everything.
- **`type: "commonjs"` (or unset) with ESM output.** Node won't load it. Set `type: "module"`.
- **`exports` doesn't list `./package.json`.** Some tools fail without it.
- **Bundling CJS into ESM output.** Causes interop issues — test with `attw`.

## Related

- [build.md](build.md) — Rolldown options
- [config.md](config.md) — `defineConfig` for libraries
