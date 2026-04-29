import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import type { Hono as HonoApp } from 'hono';
import { env } from './env.ts';
import { apiJsonError } from './lib/api-json-error.ts';
import { DEFAULT_DEV_CLIENT_PORT } from './dev-defaults.ts';

type RouteModule = { default: HonoApp };
type RouteLoader = () => Promise<RouteModule>;

function defaultDevCorsOrigins(): string[] {
  const origins: string[] = [];
  const base = DEFAULT_DEV_CLIENT_PORT;
  for (let i = 0; i <= 3; i += 1) {
    const port = base + i;
    origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  for (const legacy of [5173, 5174, 5175, 4173] as const) {
    origins.push(`http://localhost:${legacy}`);
  }
  return origins;
}

const DEFAULT_DEV_CORS_ORIGINS = defaultDevCorsOrigins();

function effectiveCorsOrigins(): string[] {
  const extra = env.ALLOWED_ORIGINS;
  if (extra.length === 0) return DEFAULT_DEV_CORS_ORIGINS;
  return extra;
}

function lazyRoute(prefix: string, loadRoute: RouteLoader) {
  let routePromise: Promise<RouteModule> | undefined;

  return async (c: Context) => {
    routePromise ??= loadRoute();
    const route = (await routePromise).default;
    const url = new URL(c.req.url);
    const strippedPath = url.pathname.slice(`/api${prefix}`.length);
    url.pathname = strippedPath.length > 0 ? strippedPath : '/';
    return route.fetch(new Request(url, c.req.raw), c.env);
  };
}

function mountLazyRoute(app: Hono, prefix: string, loadRoute: RouteLoader): void {
  const handler = lazyRoute(prefix, loadRoute);
  app.all(prefix, handler);
  app.all(`${prefix}/*`, handler);
}

const app = new Hono().basePath('/api');

const BODY_LIMIT_BYTES = 2 * 1024 * 1024;

app.use(
  '*',
  bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => apiJsonError(c, 413, 'Request body too large'),
  }),
);

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      return effectiveCorsOrigins().includes(origin) ? origin : null;
    },
  }),
);

app.get('/health', (c) => c.json({ ok: true }));
mountLazyRoute(app, '/config', () => import('./routes/config.ts'));
mountLazyRoute(app, '/provider-status', () => import('./routes/provider-status.ts'));
mountLazyRoute(app, '/incubate', () => import('./routes/incubate.ts'));
mountLazyRoute(app, '/generate', () => import('./routes/generate.ts'));
mountLazyRoute(app, '/models', () => import('./routes/models.ts'));
mountLazyRoute(app, '/logs', () => import('./routes/logs.ts'));
mountLazyRoute(app, '/design-system', () => import('./routes/design-system.ts'));
mountLazyRoute(app, '/hypothesis', () => import('./routes/hypothesis.ts'));
mountLazyRoute(app, '/preview', () => import('./routes/preview.ts'));
mountLazyRoute(app, '/inputs', () => import('./routes/inputs-generate.ts'));
mountLazyRoute(app, '/internal-context', () => import('./routes/internal-context.ts'));

export default app;
