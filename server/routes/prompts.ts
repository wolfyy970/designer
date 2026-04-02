import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db/client.ts';
import { getPromptBody, nextPromptVersion } from '../db/prompts.ts';
import { DEFAULTS, PROMPT_KEYS, type PromptKey } from '../lib/prompts/defaults.ts';

const prompts = new Hono();

// GET /api/prompts — list all with current body
prompts.get('/', async (c) => {
  try {
    const all = await Promise.all(
      PROMPT_KEYS.map(async (key) => {
        const body = await getPromptBody(key);
        return { key, body, isDefault: body === DEFAULTS[key] };
      }),
    );
    return c.json(all);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

// GET /api/prompts/:key/versions/:versionNum — historical body (Prompt Studio compare)
prompts.get('/:key/versions/:versionNum', async (c) => {
  const key = c.req.param('key') as PromptKey;
  const raw = c.req.param('versionNum');
  const version = Number.parseInt(raw, 10);
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  if (!Number.isInteger(version) || version < 1) {
    return c.json({ error: 'Invalid version' }, 400);
  }
  const row = await prisma.promptVersion.findUnique({
    where: { promptKey_version: { promptKey: key, version } },
  });
  if (!row) {
    return c.json({ error: 'Version not found' }, 404);
  }
  return c.json({
    key,
    version: row.version,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  });
});

// GET /api/prompts/:key — single prompt
prompts.get('/:key', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  const version = await prisma.promptVersion.findFirst({
    where: { promptKey: key },
    orderBy: { version: 'desc' },
  });
  if (!version) {
    return c.json(
      { error: `Prompt "${key}" was not found in the database. Run \`pnpm db:seed\` to seed prompts.` },
      500,
    );
  }
  return c.json({ key, body: version.body, version: version.version, isDefault: version.body === DEFAULTS[key] });
});

// PUT /api/prompts/:key — create new version
prompts.put('/:key', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  const { body } = z.object({ body: z.string().min(1) }).parse(await c.req.json());
  const version = await nextPromptVersion(key);
  await prisma.prompt.upsert({ where: { key }, create: { key }, update: {} });
  const created = await prisma.promptVersion.create({ data: { promptKey: key, body, version } });
  return c.json({ key, body: created.body, version: created.version, isDefault: body === DEFAULTS[key] });
});

// GET /api/prompts/:key/history — all versions
prompts.get('/:key/history', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  const versions = await prisma.promptVersion.findMany({
    where: { promptKey: key },
    orderBy: { version: 'desc' },
    select: { version: true, createdAt: true },
  });
  return c.json(versions);
});

export default prompts;
