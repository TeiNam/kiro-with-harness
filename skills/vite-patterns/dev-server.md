# Dev Server

`server.proxy`, `server.host`, `server.fs`, `server.warmup` — the day-to-day knobs for development.

## Backend Proxy

When your frontend dev server runs on `localhost:5173` and your backend on `localhost:8080`, requests like `/api/users` need to be forwarded:

```ts
server: {
  proxy: {
    // String shorthand — proxy to root
    '/foo': 'http://localhost:4567',

    // Object form — full control
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,                                  // virtual-hosted backends
      rewrite: (path) => path.replace(/^\/api/, ''),
    },

    // WebSocket
    '/ws': {
      target: 'ws://localhost:8080',
      ws: true,
    },

    // Regex matching
    '^/legacy/.*': {
      target: 'http://localhost:9000',
      rewrite: (path) => path.replace(/^\/legacy/, ''),
    },
  },
}
```

| Option | When |
|---|---|
| `target` | Required — the upstream URL |
| `changeOrigin: true` | If backend checks `Host` header (most prod-style configs) |
| `rewrite` | Strip prefix or rewrite path |
| `ws: true` | WebSocket / SSE proxying |
| `secure: false` | Allow self-signed HTTPS during dev |
| `bypass` | Conditionally skip proxy for specific requests |

## Bind Address — Containers, Remote Dev

By default Vite binds to `localhost` — unreachable from outside the host process. For Docker, WSL2, mobile devices on the same network, or remote dev:

```ts
server: {
  host: true,        // bind 0.0.0.0; or specific IP: '192.168.1.10'
  port: 3000,
  hmr: {
    clientPort: 3000,    // when behind a reverse proxy that does port translation
  },
}
```

When `host: true`, Vite prints both `localhost:` and `Network:` URLs.

## Strict Port

```ts
server: {
  port: 3000,
  strictPort: true,    // fail instead of falling back to next available port
}
```

Helpful when other tools expect Vite on a specific port.

## File System Allow

Vite restricts file serving to the project root. In monorepos, packages outside root are blocked:

```ts
server: {
  fs: {
    allow: [
      // workspace root + project root
      '..',
      // or named paths
      searchForWorkspaceRoot(process.cwd()),
    ],
    deny: ['.env', '.env.*', '*.{pem,crt}'],     // explicit blocks
  },
}
```

Vite ships `searchForWorkspaceRoot` from `vite` for the common case.

## Warmup — Pre-Transform Hot Routes

`server.warmup` pre-transforms known entry points before the browser requests them — eliminating the cold-load waterfall on large apps:

```ts
server: {
  warmup: {
    clientFiles: [
      './src/main.tsx',
      './src/routes/**/*.tsx',
      './src/components/**/index.tsx',
    ],
    ssrFiles: ['./src/server/entry.ts'],
  },
}
```

The first navigation feels instant instead of waiting for an on-demand transform of every imported module.

## CORS

```ts
server: {
  cors: {
    origin: 'https://your-other-app.dev',
    credentials: true,
  },
}
```

Or `cors: true` for permissive (any origin) — fine in dev, never deploy this in prod (and `vite preview` is not prod).

## HTTPS in Dev

```ts
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
  },
})
```

`@vitejs/plugin-basic-ssl` generates a self-signed cert. Useful for testing things that require HTTPS (Service Workers, WebRTC, secure cookies). Browser will warn — accept once and move on.

## Custom Middleware

For dev-only API mocks or extra endpoints:

```ts
{
  name: 'dev-extras',
  configureServer(server) {
    server.middlewares.use('/health', (_req, res) => {
      res.statusCode = 200
      res.end('ok')
    })
  },
}
```

Better tool for fixture-based mocks: `msw` (Mock Service Worker) — same fixtures work in tests, Storybook, and the dev server.

## `vite preview` — Not a Production Server

```bash
vite build && vite preview
```

`preview` serves the built bundle on a local server. **It is a smoke test, not a production deployment**. Production should be a real static host (NGINX, S3+CloudFront, Cloudflare Pages, Vercel static, etc.) or a multi-stage Dockerfile. `preview` lacks production-grade caching headers, compression, and security defaults.

## Hot Reload Behaviors

| Scenario | Default behavior |
|---|---|
| Edit a `.tsx` component | HMR — preserves state |
| Edit `vite.config.ts` | Full reload (config change) |
| Edit `.env` | Full reload (env reload) |
| Edit `.css` | HMR — applies without reload |
| Edit `index.html` | Full reload |
| Edit a non-component module | Module-level HMR or fall back to full reload |

## Pitfalls

- **Backend on a host that requires `Host` header**: forgot `changeOrigin: true`. Symptoms: 404 / wrong vhost.
- **WebSocket failing through proxy**: missing `ws: true`. Or running behind a TLS-terminating proxy without `clientPort` set.
- **HMR works locally but not in Docker**: `host: true` missing, or `clientPort` mismatch. Browser can't reach the HMR WebSocket.
- **CORS errors during dev that don't happen in prod**: prod has same-origin via reverse proxy; dev needs the proxy config above.
- **`vite preview` shows different behavior than `vite dev`**: dev uses esbuild transforms; preview serves the Rolldown-bundled output. CJS interop, plugin order, and tree-shaking all change.

## Related

- [config.md](config.md) — server config in context
- [security.md](security.md) — what NOT to do for prod
