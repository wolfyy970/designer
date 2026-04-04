/**
 * Zod-validated shapes for Langfuse REST prompt responses (`lf.api.prompts.list` / `get`).
 * Centralizes parsing so SDK or API drift fails in one place (tests + safeParse).
 */
import { z } from 'zod';

const promptListItemSchema = z.object({
  versions: z.array(z.number()).optional(),
  lastUpdatedAt: z.string().optional(),
});

const langfusePromptListPageSchema = z.object({
  data: z.array(promptListItemSchema).optional(),
});

const langfuseTextPromptSchema = z.object({
  type: z.literal('text'),
  prompt: z.string(),
  version: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/** First list row’s versions + optional timestamp (for /status and history). */
export function parsePromptListPage(raw: unknown):
  | { ok: true; first: { versions: number[]; lastUpdatedAt?: string } | undefined }
  | { ok: false } {
  const r = langfusePromptListPageSchema.safeParse(raw);
  if (!r.success) return { ok: false };
  const first = r.data.data?.[0];
  if (!first) return { ok: true, first: undefined };
  return {
    ok: true,
    first: {
      versions: [...(first.versions ?? [])],
      ...(first.lastUpdatedAt !== undefined ? { lastUpdatedAt: first.lastUpdatedAt } : {}),
    },
  };
}

/** True when list payload indicates at least one prompt version exists. */
export function promptListIndicatesVersions(raw: unknown): boolean {
  const parsed = parsePromptListPage(raw);
  if (!parsed.ok || !parsed.first?.versions?.length) return false;
  return true;
}

/** Narrow `prompts.get` response to a text prompt body (+ optional version/timestamps). */
export function parseTextPromptGet(raw: unknown):
  | { ok: true; prompt: string; version?: number; createdAt?: string; updatedAt?: string }
  | { ok: false } {
  const r = langfuseTextPromptSchema.safeParse(raw);
  if (!r.success) return { ok: false };
  const { prompt, version, createdAt, updatedAt } = r.data;
  return { ok: true, prompt, version, createdAt, updatedAt };
}
