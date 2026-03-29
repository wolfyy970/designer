import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db/client.ts';
import { getPromptBody, nextPromptVersion } from '../db/prompts.ts';
import { DEFAULTS, PROMPT_KEYS, type PromptKey } from '../lib/prompts/defaults.ts';

const prompts = new Hono();

// GET /api/prompts — list all with current body
prompts.get('/', async (c) => {
  const all = await Promise.all(
    PROMPT_KEYS.map(async (key) => {
      const body = await getPromptBody(key);
      return { key, body, isDefault: body === DEFAULTS[key] };
    }),
  );
  return c.json(all);
});

// GET /api/prompts/:key — single prompt
prompts.get('/:key', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  const version = await prisma.promptVersion.findFirst({
    where: { promptKey: key },
    orderBy: { version: 'desc' },
  });
  const body = version?.body ?? DEFAULTS[key];
  return c.json({ key, body, version: version?.version ?? 0, isDefault: body === DEFAULTS[key] });
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
