import { Hono } from 'hono';
import { z } from 'zod';
import { getLangfuseAppClient, isLangfuseAppConfigured } from '../lib/langfuse-app-client.ts';
import { parsePromptListPage } from '../lib/langfuse-prompt-dto.ts';
import {
  getBaselinePromptBody,
  getLatestPromptRow,
  getPromptVersionBody,
  listPromptHistoryRows,
  getPromptBody,
  sharedDefaultForKey,
} from '../db/prompts.ts';
import { env } from '../env.ts';
import { PROMPT_KEYS, type PromptKey } from '../lib/prompts/defaults.ts';

const prompts = new Hono();

// GET /api/prompts — list all with current body
prompts.get('/', async (c) => {
  try {
    const all = await Promise.all(
      PROMPT_KEYS.map(async (key) => {
        const [body, baseline] = await Promise.all([getPromptBody(key), getBaselinePromptBody(key)]);
        const sharedDefault = sharedDefaultForKey(key);
        return {
          key,
          body,
          isDefault: baseline !== null && body === baseline,
          isSharedDefault: body === sharedDefault,
        };
      }),
    );
    return c.json(all);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

// GET /api/prompts/status — introspection (must be before /:key)
prompts.get('/status', async (c) => {
  try {
    if (!isLangfuseAppConfigured()) {
      return c.json({
        ok: false,
        langfuseConfigured: false,
        prompts: PROMPT_KEYS.map((key) => ({
          key,
          missing: true,
          latestVersion: null as number | null,
          latestUpdatedAt: null as string | null,
        })),
      });
    }
    const lf = getLangfuseAppClient();
    const rows = await Promise.all(
      PROMPT_KEYS.map(async (key) => {
        try {
          const list = await lf.api.prompts.list({ name: key, limit: 1 });
          const page = parsePromptListPage(list);
          if (!page.ok) {
            return {
              key,
              missing: true,
              latestVersion: null as number | null,
              latestMeta: undefined as string | undefined,
            };
          }
          const meta = page.first;
          const latestVersion =
            meta?.versions?.length ? Math.max(...meta.versions) : null;
          return {
            key,
            missing: latestVersion == null,
            latestVersion,
            latestMeta: meta?.lastUpdatedAt,
          };
        } catch {
          return {
            key,
            missing: true,
            latestVersion: null as number | null,
            latestMeta: undefined as string | undefined,
          };
        }
      }),
    );
    const ok = rows.every((r) => !r.missing);
    return c.json({
      ok,
      prompts: rows.map((r) => ({
        key: r.key,
        missing: r.missing,
        latestVersion: r.latestVersion,
        latestUpdatedAt: r.latestMeta ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message, ok: false }, 500);
  }
});

// GET /api/prompts/:key/versions/:versionNum
prompts.get('/:key/versions/:versionNum', async (c) => {
  const key = c.req.param('key') as PromptKey;
  const raw = c.req.param('versionNum');
  const version = Number.parseInt(raw, 10);
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  if (!Number.isInteger(version) || version < 1) {
    return c.json({ error: 'Invalid version' }, 400);
  }
  const row = await getPromptVersionBody(key, version);
  if (!row) {
    return c.json({ error: 'Version not found' }, 404);
  }
  return c.json({
    key,
    version,
    body: row.body,
    createdAt: row.createdAt,
  });
});

// POST /api/prompts/:key/revert-baseline — new version restoring version 1 body
prompts.post('/:key/revert-baseline', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  if (!isLangfuseAppConfigured()) {
    return c.json(
      {
        error:
          'Langfuse is not configured. Set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL to use Prompt Studio.',
      },
      503,
    );
  }
  const baseline = await getBaselinePromptBody(key);
  if (baseline === null) {
    return c.json(
      {
        error: `Prompt "${key}" has no baseline (version 1) in Langfuse. Run \`pnpm db:seed\` or \`pnpm langfuse:sync-prompts\` to create prompts.`,
      },
      500,
    );
  }
  const lf = getLangfuseAppClient();
  const created = await lf.prompt.create({
    name: key,
    type: 'text',
    prompt: baseline,
    labels: [env.LANGFUSE_PROMPT_LABEL],
  });
  const version = created.promptResponse.version;
  const sharedDefault = sharedDefaultForKey(key);
  return c.json({
    key,
    body: baseline,
    version,
    isDefault: true,
    baselineBody: baseline,
    isSharedDefault: baseline === sharedDefault,
  });
});

// GET /api/prompts/:key — single prompt
prompts.get('/:key', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  try {
    const { body, version, baselineBody } = await getLatestPromptRow(key);
    const sharedDefault = sharedDefaultForKey(key);
    return c.json({
      key,
      body,
      version,
      isDefault: baselineBody !== null && body === baselineBody,
      baselineBody: baselineBody ?? '',
      isSharedDefault: body === sharedDefault,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

// PUT /api/prompts/:key — create new version (promotes label)
prompts.put('/:key', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  if (!isLangfuseAppConfigured()) {
    return c.json(
      {
        error:
          'Langfuse is not configured. Set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL to save prompts.',
      },
      503,
    );
  }
  const { body } = z.object({ body: z.string().min(1) }).parse(await c.req.json());
  const lf = getLangfuseAppClient();
  const created = await lf.prompt.create({
    name: key,
    type: 'text',
    prompt: body,
    labels: [env.LANGFUSE_PROMPT_LABEL],
  });
  const baseline = await getBaselinePromptBody(key);
  const sharedDefault = sharedDefaultForKey(key);
  return c.json({
    key,
    body: created.prompt,
    version: created.promptResponse.version,
    isDefault: baseline !== null && body === baseline,
    baselineBody: baseline ?? '',
    isSharedDefault: body === sharedDefault,
  });
});

// GET /api/prompts/:key/history — all versions
prompts.get('/:key/history', async (c) => {
  const key = c.req.param('key') as PromptKey;
  if (!PROMPT_KEYS.includes(key)) return c.json({ error: 'Unknown prompt key' }, 404);
  try {
    const versions = await listPromptHistoryRows(key);
    return c.json(versions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

export default prompts;
