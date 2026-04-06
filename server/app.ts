import { Hono } from 'hono';
import { cors } from 'hono/cors';
import incubate from './routes/incubate.ts';
import generate from './routes/generate.ts';
import models from './routes/models.ts';
import logs from './routes/logs.ts';
import designSystem from './routes/design-system.ts';
import prompts from './routes/prompts.ts';
import hypothesis from './routes/hypothesis.ts';
import preview from './routes/preview.ts';
import configRoute from './routes/config.ts';
import inputsGenerate from './routes/inputs-generate.ts';

const app = new Hono().basePath('/api');

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:4173',
    ],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/config', configRoute);
app.route('/incubate', incubate);
app.route('/generate', generate);
app.route('/models', models);
app.route('/logs', logs);
app.route('/design-system', designSystem);
app.route('/prompts', prompts);
app.route('/hypothesis', hypothesis);
app.route('/preview', preview);
app.route('/inputs', inputsGenerate);

export default app;
