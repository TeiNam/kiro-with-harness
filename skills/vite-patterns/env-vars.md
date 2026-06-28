# Environment Variables

`VITE_`-prefixed vars are statically inlined into the client bundle. They are **public** — anyone with the JS can read them. Plan accordingly.

## Loading Order

Vite loads, in order (later overrides earlier):

1. `.env`
2. `.env.local`
3. `.env.[mode]`
4. `.env.[mode].local`

`mode` defaults to `development` for `vite dev`, `production` for `vite build`. Pass `--mode staging` for a custom mode.

`*.local` files are gitignored by convention; use them for personal/local overrides.

## Client-Side Access

```ts
import.meta.env.VITE_API_URL    // string (only VITE_-prefixed vars)
import.meta.env.MODE             // 'development' | 'production' | custom
import.meta.env.BASE_URL         // base config value
import.meta.env.DEV              // boolean
import.meta.env.PROD             // boolean
import.meta.env.SSR              // boolean
```

Type the env in `vite-env.d.ts` so misspellings fail at compile time:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_FEATURE_FLAG: 'on' | 'off'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

## In `vite.config.ts`

`import.meta.env` is **not** available inside the config file (it's Node, not browser). Use `loadEnv`:

```ts
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // explicit prefix list — never pass '' (see Security)
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'APP_'])

  return {
    plugins: [react()],
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL),
    },
  }
})
```

`loadEnv(mode, root, prefixes)`:

- `mode` — `'development'` / `'production'` / custom.
- `root` — usually `process.cwd()`.
- `prefixes` — array of allowed prefixes. Default is `['VITE_']`. **Never pass `''`** — see below.

## Security — `VITE_` Is NOT a Boundary

A `VITE_` var is **statically inlined as plain text into the JS bundle**. Minification, removing source maps, and base64-encoding do **not** hide it. A determined attacker extracts any `VITE_` var from the shipped JS in minutes.

**Rule**:

- Public values only (API URLs, feature flags, public keys, analytics IDs).
- Secrets (API tokens, DB URLs, private keys) **stay server-side** behind an API or serverless function.

There is no client-side env var that's "secret." If it ships to the browser, it's public.

## The `loadEnv('')` Trap

```ts
// CATASTROPHIC — passing '' loads every env var, including server secrets.
// They become available to inline into the client bundle via `define`.
const env = loadEnv(mode, process.cwd(), '')


// SAFE — explicit prefix list
const env = loadEnv(mode, process.cwd(), ['VITE_', 'APP_'])
```

Never pass `''`. Never set `envPrefix: ''` in config. Never add server-only env vars to `define`.

## Server-Only Env Vars (SSR / Build Scripts)

For server-side code (SSR, Node scripts, build hooks), use `process.env` directly — Vite doesn't restrict you there:

```ts
// In server code — fine
const dbUrl = process.env.DATABASE_URL
```

Just don't reach into `process.env` from anything that ends up in the client bundle.

## Multiple Modes — `--mode`

```bash
vite build --mode staging       # loads .env, .env.staging, .env.staging.local
```

`.env.staging`:

```env
VITE_API_URL=https://staging-api.example.com
VITE_SENTRY_DSN=https://...staging
```

Useful for build-time-known environments (staging, beta). For runtime-known config (per-tenant URLs), serve the config from the server, don't bake it.

## Per-User Overrides

```env
# .env.local — gitignored
VITE_API_URL=http://localhost:8080
```

Each developer overrides without touching shared `.env`. Shared template lives in `.env.example`:

```env
# .env.example
VITE_API_URL=https://example.com
VITE_FEATURE_FLAG=off
```

Document what's required; copy to `.env.local` on setup.

## `.gitignore` Checklist

```gitignore
# Local secrets / overrides
.env.local
.env.*.local

# Build output
dist/

# Pre-bundle cache (stale entries cause phantom errors)
node_modules/.vite
```

## Boolean / Number Env Vars

Env vars are always strings in dotenv files. Convert at the boundary:

```ts
// schemas/env.ts — Zod-validated env, typed and parsed once
import { z } from 'zod'

const envSchema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_ENABLE_ANALYTICS: z.enum(['true', 'false']).transform(v => v === 'true'),
  VITE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(0),
})

export const env = envSchema.parse(import.meta.env)
```

Parse once at the entry point; throw early on missing/invalid values. Don't sprinkle `parseInt(import.meta.env.X)` everywhere.

## Pitfalls

- **Forgot to restart `vite dev` after editing `.env`** — Vite reads env at startup. Restart on changes.
- **Naming a server var with `VITE_` prefix accidentally** — it leaks into the client bundle. Audit `.env*` files.
- **Trying to use env vars during build of HTML** — `index.html` doesn't run JS. Use `transformIndexHtml` plugin or template substitution.

## Related

- [config.md](config.md) — `define` and `loadEnv`
- [security.md](security.md) — full pre-launch security checklist
