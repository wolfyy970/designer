# Auto Designer

**Read the [North Star](PRODUCT.md#north-star) first.** Every decision in this repo serves that ambition.

A design brief feeds the **Incubator**, which produces hypothesis strategies that systematically explore the solution space. Each hypothesis **Design** run uses the **agentic** pipeline (multi-file Pi sandbox). By default that is a **single** agent build with **no** evaluator. Turn **Auto-improve** on the node to run **evaluation** and optional **revision** loops (round cap and target score; rubric weights under Settings). Everything connects on a visual node-graph canvas.

## Quick Start

```bash
pnpm install
cp .env.example .env.local  # add your API keys
# Agentic mode uses Playwright for browser-grounded evaluation (after first run):
pnpm exec playwright install chromium
pnpm dev:all                 # recommended: API + Vite (API waits until /api/health is up)
# Or two terminals: pnpm dev:server  then  pnpm dev
```

Both processes are required for local development. The Vite dev server proxies `/api/*` to the Hono server on port **3001**. If only Vite is up, the app stays on a full-screen **API server not reachable** gate (with retry) until **`GET /api/config`** succeeds—start the API with **`pnpm dev:all`** or **`pnpm dev:server`**, or hard-refresh after the API is listening.

**Screen width:** The canvas workspace needs a **desktop-class** layout. Browser viewports **narrower than 1024px** (typical phones and many tablets) show a full-screen message asking you to open the app on a laptop or desktop instead.

`**EADDRINUSE` on port 3001:** Something is still bound to the API port — often a **background** `pnpm dev:server` left over from `pnpm dev:server & pnpm dev` after `Ctrl+C` (check `jobs` / `fg`; or free the port: `lsof -nP -iTCP:3001 -sTCP:LISTEN` then `kill <pid>`). Prefer `**pnpm dev:all`** or **two terminals** so you don't stack servers.

### API Configuration


| Key                           | Where to get it                                | Required       | What it does                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENROUTER_API_KEY`          | [openrouter.ai](https://openrouter.ai)         | For OpenRouter | Server-side only — proxied via Vite, never exposed to browser                                                                                                                                                                                                                                                      |
| `LOCKDOWN`                    | N/A                                            | Optional       | When **unset or empty**, the API and UI use **OpenRouter + MiniMax M2.5** only (`minimax/minimax-m2.5`); model pickers are disabled. Set to `false`, `0`, `no`, or `off` (case-insensitive) to allow other providers/models. The SPA reads `**GET /api/config`** at runtime — restart the API after changing this. |
| `VITE_LMSTUDIO_URL`           | Local (default: `http://192.168.252.213:1234`) | For LM Studio  | Local inference endpoint                                                                                                                                                                                                                                                                                           |
| `VITE_LMSTUDIO_VISION_MODELS` | N/A                                            | Optional       | Comma-separated model ID substrings that support vision                                                                                                                                                                                                                                                            |


With `LOCKDOWN` disabled, you can mix providers — e.g. OpenRouter for one node and LM Studio for another. See `.env.example` for defaults and optional keys.

## Canvas Workflow

The primary interface is a visual node-graph canvas (`/canvas`, the default route):

1. **Input nodes** (left) — Design Brief, Existing Design, Research Context, Objectives & Metrics, Design Constraints. On a fresh canvas, optional inputs may appear as **ghost placeholders**; opening **Canvas Manager** → **Load** materializes real **input nodes** when the saved spec already has text or images for those **facets** (stored under `spec.sections` in data). **Research Context**, **Objectives & Metrics**, and **Design Constraints** offer an optional **auto-generate** control (from the Design Brief and other filled facets) using the **first Model node** on the canvas and `POST /api/inputs/generate` — details in [USER_GUIDE.md](USER_GUIDE.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
2. **Model node** — Connect to the Incubator or Hypotheses to configure which provider and model they use
3. **Incubator** — Connect input nodes and a Model node, then click Generate to produce hypothesis strategies
4. **Hypotheses** — Editable strategy cards. Connect a Model node and use **Design** to run the **agentic** Pi build (**Auto-improve** off = one build with no evaluator; **on** = evaluation + optional revision rounds)
5. **Design System** (optional) — Connect to hypotheses to inject design tokens into generation
6. **Previews** — Rendered design previews with zoom, version navigation, full-screen (hypothesis-scoped design stepping when domain preview slots exist), and optional **mark as best** vs evaluator ranking. Agentic results include a file explorer, zip download, run workspace with multi-round eval preview when applicable, and (when the run finishes) an evaluation scorecard plus optional headless-browser thumbnail.

Nodes connect left-to-right. Auto-layout arranges everything based on connections. Previews can connect back to Existing Design for iterative feedback loops.

The header also opens **Settings** (General preferences). In **development**, a **design tokens kitchen sink** modal is on the General tab. Token semantics live in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Scripts


| Command                      | What it does                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                   | Start Vite SPA dev server (port 5173)                                                                                                                                                                                                                |
| `pnpm dev:server`            | Start Hono API server (port 3001)                                                                                                                                                                                                                    |
| `pnpm dev:all`               | Start API then Vite (waits for `/api/health` — avoids proxy race)                                                                                                                                                                                    |
| `pnpm dev:kill`              | Stop processes listening on ports 3001 (API) and 5173 (Vite)                                                                                                                                                                                         |
| `pnpm build`                 | Type-check and production build                                                                                                                                                                                                                      |
| `pnpm test`                  | Vitest unit tests (Playwright merge test excluded in config; see [AGENTS.md](AGENTS.md))                                                                                                                                                              |
| `pnpm lint`                  | Run ESLint                                                                                                                                                                                                                                           |
| `pnpm knip`                  | Optional unused-export report (not run in CI by default)                                                                                                                                                                                             |
| `pnpm meta-harness`          | Optional **meta-harness** CLI: benchmark/proposer outer loop against the local API ([meta-harness/README.md](meta-harness/README.md))                                                                                                                |
| `pnpm version-snapshot`      | Backup/list/diff/restore **skills/**, **PROMPT.md**, **rubric-weights.json** under **`.prompt-versions/`** ([USER_GUIDE.md](USER_GUIDE.md#version-history))                                                                          |


## Documentation

**AI coding agents:** Full repo conventions live in **[AGENTS.md](AGENTS.md)** (vendor-neutral name). **[CLAUDE.md](CLAUDE.md)** exists only so **Claude Code** auto-loads a pointer to **AGENTS.md**—do not maintain two copies of the same guidance.

| Document                                               | Purpose                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                 | **Canonical** agent instructions: commands, architecture **pointers**, skill-based prompts, gotchas ([Pi sandbox detail](ARCHITECTURE.md#pi-design-sandbox-three-layer-contract) in **ARCHITECTURE**) |
| [CLAUDE.md](CLAUDE.md)                                 | Stub for Claude Code → links **AGENTS.md**                                                                                                              |
| [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)               | Narrative: canvas, prompts, agentic loop, evaluation                                                                                                    |
| [PRODUCT.md](PRODUCT.md)                               | **North Star** + feature-level description: modes, nodes, providers                                                                                     |
| [USER_GUIDE.md](USER_GUIDE.md)                         | Setup and day-to-day canvas workflow                                                                                                                    |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                   | SPA design tokens: accent vs status, typography, typefaces, file-role colors (`src/index.css`)                                                          |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | Technical reference: routes, stores, data flow, Pi adapter boundary, **Pi sandbox** (layers, tool inventory, edit cascade)                                |
| [meta-harness/README.md](meta-harness/README.md)       | Optional meta-harness CLI for systematic API benchmarks and prompt/skill search ([META_HARNESS_OUTER_LOOP.md](meta-harness/META_HARNESS_OUTER_LOOP.md)) |
| [DOCUMENTATION.md](DOCUMENTATION.md)                   | How this doc set is organized (hub = this README)                                                                                                       |


## Deploying (Vercel)

Production uses **Vercel** (`vercel.json` + `api/[[...route]].ts` → Hono). The serverless function **`maxDuration` is 800s** on Pro so long agentic SSE streams fit; Hobby max is shorter—use **Pro** for agentic runs with revision rounds. Set **`OPENROUTER_API_KEY`** in the Vercel project env. **`ALLOWED_ORIGINS`** in env may be required when the SPA is on a custom domain or preview URL that is not same-origin with `/api`—see `.env.example`. `/api/logs` is **disabled when `NODE_ENV=production`** (no shared in-memory ring).

Ephemeral **preview sessions** may not persist across separate serverless invocations—the UI falls back to bundled **`srcDoc`** when a preview URL 404s (relative links in that mode are limited).

## Tech Stack

Vite + React 19 + TypeScript, Zustand (state), Tailwind CSS v4 (styling; UI typefaces in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)), @xyflow/react v12 (canvas), react-router-dom v7 (routing), @tanstack/react-query (async state), Zod (schema validation), Vitest (testing). Agentic mode: `@mariozechner/pi-coding-agent` with `**just-bash`**; native Pi file tools are mapped to the virtual project in `server/services/pi-sdk/` so the host filesystem stays isolated. See [ARCHITECTURE.md](ARCHITECTURE.md).
