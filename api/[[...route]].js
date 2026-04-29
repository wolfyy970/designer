import { handle } from "@hono/node-server/vercel";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { config } from "dotenv";
import path from "node:path";
const DEFAULT_DEV_API_PORT = 4731;
const DEFAULT_DEV_CLIENT_PORT = 4732;
config({ path: ".env.local" });
config({ path: ".env" });
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
function optionalScore(value) {
  if (value === void 0 || value === "") return void 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return void 0;
  return n;
}
function clampIndEnv(value, fallback, min, max) {
  if (value === void 0 || String(value).trim() === "") return fallback;
  return clampInt(value, fallback, min, max);
}
const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  /**
   * OpenRouter key **only** for Vitest sandbox LLM tool tests (`SANDBOX_LLM_TEST=1` →
   * `server/services/__tests__/sandbox-llm-*.ts`). The Hono API and Pi agent **never** read this.
   */
  OPENROUTER_API_KEY_TESTS: process.env.OPENROUTER_API_KEY_TESTS ?? "",
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai",
  LMSTUDIO_URL: process.env.LMSTUDIO_URL ?? process.env.VITE_LMSTUDIO_URL ?? "http://localhost:1234",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  get isDev() {
    return this.NODE_ENV !== "production";
  },
  /**
   * Comma-separated browser origins allowed for CORS (e.g. `https://app.vercel.app`).
   * When empty, only localhost dev origins are allowed. Set on production when the SPA is on
   * a custom domain or Vercel preview URL that is not same-origin as the API.
   */
  get ALLOWED_ORIGINS() {
    return (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  },
  /**
   * Optional hard cap on **completion** tokens in outbound API bodies and Pi `streamSimple`.
   * When unset/empty, HTTP clients omit `max_tokens` (OpenRouter uses each model’s maximum)
   * and Pi uses a budget derived from the model context window.
   */
  get MAX_OUTPUT_TOKENS() {
    const raw = process.env.MAX_OUTPUT_TOKENS;
    if (raw === void 0 || String(raw).trim() === "") return void 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return void 0;
    return Math.min(Math.trunc(n), 2097152);
  },
  /**
   * Assumed context window for LM Studio when `/models` does not report one (local runners).
   */
  LM_STUDIO_CONTEXT_WINDOW: clampInt(process.env.LM_STUDIO_CONTEXT_WINDOW, 131072, 4096, 2097152),
  /** Max PI revision sessions after first eval (agentic). */
  AGENTIC_MAX_REVISION_ROUNDS: clampInt(process.env.AGENTIC_MAX_REVISION_ROUNDS, 5, 0, 20),
  /** Optional early satisfaction when overall score ≥ this and no hard fails. */
  AGENTIC_MIN_OVERALL_SCORE: optionalScore(process.env.AGENTIC_MIN_OVERALL_SCORE),
  /** Dev LLM observability log (`/api/logs`): max rows kept in memory (FIFO drop). */
  LLM_LOG_MAX_ENTRIES: clampInt(process.env.LLM_LOG_MAX_ENTRIES, 400, 50, 1e4),
  /** Ephemeral preview sessions (`/api/preview/sessions`); oldest evicted when over cap. */
  MAX_PREVIEW_SESSIONS: clampIndEnv(process.env.MAX_PREVIEW_SESSIONS, 200, 1, 5e4),
  /** Max approx UTF-8 bytes for POST/PUT preview `files` map (rejects with 413). */
  MAX_PREVIEW_PAYLOAD_BYTES: clampIndEnv(
    process.env.MAX_PREVIEW_PAYLOAD_BYTES,
    5 * 1024 * 1024,
    64 * 1024,
    50 * 1024 * 1024
  ),
  /** Max concurrent agentic orchestration runs per server instance (503 when full). */
  MAX_CONCURRENT_AGENTIC_RUNS: clampIndEnv(process.env.MAX_CONCURRENT_AGENTIC_RUNS, 5, 1, 100),
  /**
   * Override directory for observability NDJSON. Falls back to `LLM_LOG_DIR`, then in development
   * defaults to `logs/observability` under `process.cwd()`. Empty in production unless explicitly set.
   */
  get OBSERVABILITY_LOG_BASE_DIR() {
    const explicit = (process.env.OBSERVABILITY_LOG_DIR ?? "").trim() || (process.env.LLM_LOG_DIR ?? "").trim();
    if (explicit) return explicit;
    if (process.env.VITEST === "true") return "";
    if (process.env.NODE_ENV === "production") return "";
    return path.join(process.cwd(), "logs", "observability");
  },
  /** @deprecated Use OBSERVABILITY_LOG_BASE_DIR (same resolution when set). Kept for docs/tools. */
  LLM_LOG_DIR: (process.env.LLM_LOG_DIR ?? "").trim(),
  /**
   * Max characters per systemPrompt, userPrompt, response in the NDJSON file sink only.
   * In production, defaults to **2000** when unset (defensive); set `0` for no cap.
   */
  get LLM_LOG_MAX_BODY_CHARS() {
    const raw = process.env.LLM_LOG_MAX_BODY_CHARS;
    if (raw === void 0 || String(raw).trim() === "") {
      if (process.env.NODE_ENV === "production") return 2e3;
      return 0;
    }
    return clampInt(raw, 0, 0, 1e7);
  },
  /** `daily` → `llm-YYYY-MM-DD.ndjson`; `single` → `llm.ndjson`. */
  LLM_LOG_FILE_MODE: process.env.LLM_LOG_FILE_MODE === "single" ? "single" : "daily",
  /** Set to `0` to skip Playwright browser-grounded eval (preflight only). Disabled under Vitest by default. */
  get BROWSER_PLAYWRIGHT_EVAL() {
    if (process.env.VITEST === "true") return false;
    return process.env.BROWSER_PLAYWRIGHT_EVAL !== "0";
  },
  /**
   * Public origin for server-side preview URLs (Playwright, eval). No trailing slash.
   * Defaults to 127.0.0.1 + PORT so headless browsers hit the same process as the API.
   */
  PREVIEW_PUBLIC_URL: (process.env.PREVIEW_PUBLIC_URL ?? "").trim().replace(/\/$/, ""),
  get previewPublicBaseUrl() {
    const explicit = this.PREVIEW_PUBLIC_URL.trim();
    if (explicit) return explicit;
    const port = (process.env.PORT ?? String(DEFAULT_DEV_API_PORT)).trim();
    return `http://127.0.0.1:${port}`;
  }
};
function apiJsonError(c, status, message, details) {
  const body = { error: message };
  if (details !== void 0) {
    body.details = details;
  }
  return c.json(body, status);
}
function defaultDevCorsOrigins() {
  const origins = [];
  const base = DEFAULT_DEV_CLIENT_PORT;
  for (let i = 0; i <= 3; i += 1) {
    const port = base + i;
    origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  for (const legacy of [5173, 5174, 5175, 4173]) {
    origins.push(`http://localhost:${legacy}`);
  }
  return origins;
}
const DEFAULT_DEV_CORS_ORIGINS = defaultDevCorsOrigins();
function effectiveCorsOrigins() {
  const extra = env.ALLOWED_ORIGINS;
  if (extra.length === 0) return DEFAULT_DEV_CORS_ORIGINS;
  return extra;
}
function lazyRoute(prefix, loadRoute) {
  let routePromise;
  return async (c) => {
    routePromise ??= loadRoute();
    const route = (await routePromise).default;
    const url = new URL(c.req.url);
    const strippedPath = url.pathname.slice(`/api${prefix}`.length);
    url.pathname = strippedPath.length > 0 ? strippedPath : "/";
    return route.fetch(new Request(url, c.req.raw), c.env);
  };
}
function mountLazyRoute(app2, prefix, loadRoute) {
  const handler = lazyRoute(prefix, loadRoute);
  app2.all(prefix, handler);
  app2.all(`${prefix}/*`, handler);
}
const app = new Hono().basePath("/api");
const BODY_LIMIT_BYTES = 2 * 1024 * 1024;
app.use(
  "*",
  bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => apiJsonError(c, 413, "Request body too large")
  })
);
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      return effectiveCorsOrigins().includes(origin) ? origin : null;
    }
  })
);
app.get("/health", (c) => c.json({ ok: true }));
mountLazyRoute(app, "/config", () => import("./assets/config-CUGSRoF6.js"));
mountLazyRoute(app, "/provider-status", () => import("./assets/provider-status-CaA8FevY.js"));
mountLazyRoute(app, "/incubate", () => import("./assets/incubate-BGYhQPfm.js"));
mountLazyRoute(app, "/generate", () => import("./assets/generate-DKDXXv19.js"));
mountLazyRoute(app, "/models", () => import("./assets/models-CkYXFFct.js"));
mountLazyRoute(app, "/logs", () => import("./assets/logs-Ct17KXln.js"));
mountLazyRoute(app, "/design-system", () => import("./assets/design-system-OiZksh6J.js"));
mountLazyRoute(app, "/hypothesis", () => import("./assets/hypothesis-B5W2kU_p.js"));
mountLazyRoute(app, "/preview", () => import("./assets/preview-DOCCL0Dc.js"));
mountLazyRoute(app, "/inputs", () => import("./assets/inputs-generate-DqaxHPTc.js"));
mountLazyRoute(app, "/internal-context", () => import("./assets/internal-context-qFqlmnL5.js"));
const runtime = "nodejs";
const maxDuration = 800;
const vercelEntry = handle(app);
export {
  apiJsonError as a,
  vercelEntry as default,
  env as e,
  maxDuration,
  runtime
};
