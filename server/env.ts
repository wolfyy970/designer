import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Must run before `export const env` reads `process.env`. ESM hoists `import`s above the body of
// `server/dev.ts`, so `config()` there ran too late — Langfuse keys from `.env.local` were missed.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function optionalScore(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? process.env.VITE_OPENROUTER_API_KEY ?? '',
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai',
  LMSTUDIO_URL: process.env.LMSTUDIO_URL ?? process.env.VITE_LMSTUDIO_URL ?? 'http://localhost:1234',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  get isDev() {
    return this.NODE_ENV !== 'production';
  },
  /**
   * Optional hard cap on **completion** tokens in outbound API bodies and Pi `streamSimple`.
   * When unset/empty, HTTP clients omit `max_tokens` (OpenRouter uses each model’s maximum)
   * and Pi uses a budget derived from the model context window.
   */
  get MAX_OUTPUT_TOKENS(): number | undefined {
    const raw = process.env.MAX_OUTPUT_TOKENS;
    if (raw === undefined || String(raw).trim() === '') return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.min(Math.trunc(n), 2_097_152);
  },
  /**
   * Assumed context window for LM Studio when `/models` does not report one (local runners).
   */
  LM_STUDIO_CONTEXT_WINDOW: clampInt(process.env.LM_STUDIO_CONTEXT_WINDOW, 131_072, 4096, 2_097_152),
  /** Max PI revision sessions after first eval (agentic). */
  AGENTIC_MAX_REVISION_ROUNDS: clampInt(process.env.AGENTIC_MAX_REVISION_ROUNDS, 5, 0, 20),
  /** Optional early satisfaction when overall score ≥ this and no hard fails. */
  AGENTIC_MIN_OVERALL_SCORE: optionalScore(process.env.AGENTIC_MIN_OVERALL_SCORE),
  /** Dev LLM observability log (`/api/logs`): max rows kept in memory (FIFO drop). */
  LLM_LOG_MAX_ENTRIES: clampInt(process.env.LLM_LOG_MAX_ENTRIES, 400, 50, 10_000),
  /**
   * Override directory for observability NDJSON. Falls back to `LLM_LOG_DIR`, then in development
   * defaults to `logs/observability` under `process.cwd()`. Empty in production unless explicitly set.
   */
  get OBSERVABILITY_LOG_BASE_DIR(): string {
    const explicit =
      (process.env.OBSERVABILITY_LOG_DIR ?? '').trim() || (process.env.LLM_LOG_DIR ?? '').trim();
    if (explicit) return explicit;
    if (process.env.VITEST === 'true') return '';
    if (process.env.NODE_ENV === 'production') return '';
    return path.join(process.cwd(), 'logs', 'observability');
  },
  /** @deprecated Use OBSERVABILITY_LOG_BASE_DIR (same resolution when set). Kept for docs/tools. */
  LLM_LOG_DIR: (process.env.LLM_LOG_DIR ?? '').trim(),
  /**
   * Max characters per of systemPrompt, userPrompt, response in the file sink only (`0` = no cap).
   */
  LLM_LOG_MAX_BODY_CHARS: clampInt(process.env.LLM_LOG_MAX_BODY_CHARS, 0, 0, 10_000_000),
  /** `daily` → `llm-YYYY-MM-DD.ndjson`; `single` → `llm.ndjson`. */
  LLM_LOG_FILE_MODE: process.env.LLM_LOG_FILE_MODE === 'single' ? 'single' : 'daily',
  /** Set to `0` to skip Playwright browser-grounded eval (preflight only). Disabled under Vitest by default. */
  get BROWSER_PLAYWRIGHT_EVAL() {
    if (process.env.VITEST === 'true') return false;
    return process.env.BROWSER_PLAYWRIGHT_EVAL !== '0';
  },
  /** Self-hosted or cloud Langfuse origin (no trailing slash). */
  LANGFUSE_BASE_URL: (process.env.LANGFUSE_BASE_URL ?? 'http://localhost:3100').replace(/\/$/, ''),
  LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY ?? '',
  LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY ?? '',
  /** Label used for runtime `getPromptBody` and new Prompt Studio saves. Default `production`. */
  LANGFUSE_PROMPT_LABEL: (process.env.LANGFUSE_PROMPT_LABEL ?? 'production').trim() || 'production',
  /**
   * Optional path to a SQLite file that still has the legacy `PromptVersion` table (e.g. backup before
   * `20260402120000_drop_prisma_prompts`). Seed uses latest bodies per key when set; otherwise
   * `shared-defaults`. **Create-only** seed never overwrites an existing labeled prompt unless
   * `LANGFUSE_SEED_SYNC` is set — see `langfuse-seed-prompts.ts`.
   */
  get LANGFUSE_PROMPT_IMPORT_SQLITE(): string {
    return (process.env.LANGFUSE_PROMPT_IMPORT_SQLITE ?? '').trim();
  },
  /**
   * When true (`1`, `true`, `yes`), Langfuse seed **syncs** every key: new versions are created when the
   * labeled body differs from repo/SQLite target text (moves `LANGFUSE_PROMPT_LABEL`). Default false:
   * **Prompt Studio / Langfuse** is source of truth after initial bootstrap (`pnpm langfuse:sync-prompts`).
   */
  get langfuseSeedSync(): boolean {
    const v = (process.env.LANGFUSE_SEED_SYNC ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  },
  get langfuseTracingEnabled() {
    if (process.env.VITEST === 'true') return false;
    const pk = this.LANGFUSE_PUBLIC_KEY.trim();
    const sk = this.LANGFUSE_SECRET_KEY.trim();
    return Boolean(pk && sk && this.LANGFUSE_BASE_URL);
  },
} as const;
