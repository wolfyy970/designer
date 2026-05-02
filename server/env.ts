import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { DEFAULT_DEV_API_PORT } from './dev-defaults.ts';

// Must run before `export const env` reads `process.env`. ESM hoists `import`s above the body of
// `server/dev.ts`, so `config()` there ran too late — keys from `.env.local` were missed.
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

/** Integer env helper — empty string uses `fallback` (unlike clampInt which treats empty as NaN). */
function clampIndEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || String(value).trim() === '') return fallback;
  return clampInt(value, fallback, min, max);
}

export const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
  /**
   * OpenRouter key **only** for Vitest sandbox LLM tool tests (`SANDBOX_LLM_TEST=1` →
   * `server/services/__tests__/sandbox-llm-*.ts`). The Hono API and Pi agent **never** read this.
   */
  OPENROUTER_API_KEY_TESTS: process.env.OPENROUTER_API_KEY_TESTS ?? '',
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai',
  LMSTUDIO_URL: process.env.LMSTUDIO_URL ?? process.env.VITE_LMSTUDIO_URL ?? 'http://localhost:1234',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  get isDev() {
    return this.NODE_ENV !== 'production';
  },
  /**
   * Comma-separated browser origins allowed for CORS (e.g. `https://app.vercel.app`).
   * When empty, only localhost dev origins are allowed. Set on production when the SPA is on
   * a custom domain or Vercel preview URL that is not same-origin as the API.
   */
  get ALLOWED_ORIGINS(): string[] {
    return (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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
  /** Ephemeral preview sessions (`/api/preview/sessions`); oldest evicted when over cap. */
  MAX_PREVIEW_SESSIONS: clampIndEnv(process.env.MAX_PREVIEW_SESSIONS, 200, 1, 50_000),
  /** Max approx UTF-8 bytes for POST/PUT preview `files` map (rejects with 413). */
  MAX_PREVIEW_PAYLOAD_BYTES: clampIndEnv(
    process.env.MAX_PREVIEW_PAYLOAD_BYTES,
    5 * 1024 * 1024,
    64 * 1024,
    50 * 1024 * 1024,
  ),
  /** Max concurrent agentic orchestration runs per server instance (503 when full). */
  MAX_CONCURRENT_AGENTIC_RUNS: clampIndEnv(process.env.MAX_CONCURRENT_AGENTIC_RUNS, 5, 1, 100),
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
   * Max characters per systemPrompt, userPrompt, response in the NDJSON file sink only.
   * In production, defaults to **2000** when unset (defensive); set `0` for no cap.
   */
  get LLM_LOG_MAX_BODY_CHARS(): number {
    const raw = process.env.LLM_LOG_MAX_BODY_CHARS;
    if (raw === undefined || String(raw).trim() === '') {
      if (process.env.NODE_ENV === 'production') return 2000;
      return 0;
    }
    return clampInt(raw, 0, 0, 10_000_000);
  },
  /** `daily` → `llm-YYYY-MM-DD.ndjson`; `single` → `llm.ndjson`. */
  LLM_LOG_FILE_MODE: process.env.LLM_LOG_FILE_MODE === 'single' ? 'single' : 'daily',
  /** Set to `0` to skip Playwright browser-grounded eval (preflight only). Disabled under Vitest by default. */
  get BROWSER_PLAYWRIGHT_EVAL() {
    if (process.env.VITEST === 'true') return false;
    return process.env.BROWSER_PLAYWRIGHT_EVAL !== '0';
  },
/**
   * Public origin for server-side preview URLs (Playwright, eval). No trailing slash.
   * Defaults to 127.0.0.1 + PORT so headless browsers hit the same process as the API.
   */
  PREVIEW_PUBLIC_URL: (process.env.PREVIEW_PUBLIC_URL ?? '').trim().replace(/\/$/, ''),
  get previewPublicBaseUrl(): string {
    const explicit = this.PREVIEW_PUBLIC_URL.trim();
    if (explicit) return explicit;
    const port = (process.env.PORT ?? String(DEFAULT_DEV_API_PORT)).trim();
    return `http://127.0.0.1:${port}`;
  },
};
