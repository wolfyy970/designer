import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import incubate from './routes/incubate.ts';
import generate from './routes/generate.ts';
import models from './routes/models.ts';
import logs from './routes/logs.ts';
import designSystem from './routes/design-system.ts';
import hypothesis from './routes/hypothesis.ts';
import preview from './routes/preview.ts';
import configRoute from './routes/config.ts';
import providerStatus from './routes/provider-status.ts';
import inputsGenerate from './routes/inputs-generate.ts';
import internalContext from './routes/internal-context.ts';
import { env } from './env.ts';
import { apiJsonError } from './lib/api-json-error.ts';
import { DEFAULT_DEV_CLIENT_PORT } from './dev-defaults.ts';

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
app.route('/config', configRoute);
app.route('/provider-status', providerStatus);
app.route('/incubate', incubate);
app.route('/generate', generate);
app.route('/models', models);
app.route('/logs', logs);
app.route('/design-system', designSystem);
app.route('/hypothesis', hypothesis);
app.route('/preview', preview);
app.route('/inputs', inputsGenerate);
app.route('/internal-context', internalContext);

export default app;
