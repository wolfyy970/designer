# Designer

**Read the [North Star](PRODUCT.md#north-star) first.** Every decision in this repo serves that ambition.

**Picking up after a break (humans and AI):** Prior chats are not retained—treat **this repository** as the source of truth. Start with **[AGENTS.md](AGENTS.md)** (commands and gotchas), **[PRODUCT.md](PRODUCT.md)** (product intent), and **[ARCHITECTURE.md](ARCHITECTURE.md)** for implementation depth. Optional: `git log -10 --oneline` for the latest merged work.

Designer opens on a public home page, then the working canvas lives at `/canvas`. A design brief feeds the **Incubator**, which produces hypothesis strategies that systematically explore the solution space. Each hypothesis **Design** run uses the **agentic** pipeline (multi-file Pi sandbox). By default that is a **single** agent build with **no** evaluator. Turn **Auto-improve** on the node to run **evaluation** and optional **revision** loops (round cap and target score; rubric weights under Settings). Everything connects on a visual node-graph canvas.

## Quick Start

```bash
pnpm install
cp .env.example .env.local  # add your API keys
# Agentic mode uses Playwright for browser-grounded evaluation (after first run):
pnpm exec playwright install chromium
pnpm dev:all                 # recommended: API + Vite (API waits until /api/health is up)
# Or two terminals: pnpm dev:server  then  pnpm dev
```

Both processes are required for local development. The Vite dev server proxies `/api/*` to the Hono server (default port **4731**; override with **`PORT`**). If only Vite is up, the app stays on a full-screen **API server not reachable** gate (with retry) until **`GET /api/config`** succeeds—start the API with **`pnpm dev:all`** or **`pnpm dev:server`**, or hard-refresh after the API is listening.

**Screen width:** The canvas workspace needs a **desktop-class** layout. Browser viewports **narrower than 1024px** (typical phones and many tablets) show a full-screen message asking you to open the app on a laptop or desktop instead.

**`EADDRINUSE` on the API port:** Something is still bound to **`PORT`** (default **4731**) — often a **background** `pnpm dev:server` left over from `pnpm dev:server & pnpm dev` after `Ctrl+C` (check `jobs` / `fg`; or free the port: `lsof -nP -iTCP:4731 -sTCP:LISTEN` then `kill <pid>`). Prefer **`pnpm dev:all`** or **two terminals** so you don't stack servers.

### API Configuration


| Key                           | Where to get it                                | Required       | What it does                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENROUTER_API_KEY`          | [openrouter.ai](https://openrouter.ai)         | For OpenRouter | Server-side only — proxied via Vite, never exposed to browser                                                                                                                                                                                                                                                      |
| `VITE_LMSTUDIO_URL`           | Local (default: `http://192.168.252.213:1234`) | For LM Studio  | Local inference endpoint                                                                                                                                                                                                                                                                                           |
| `VITE_LMSTUDIO_VISION_MODELS` | N/A                                            | Optional       | Comma-separated model ID substrings that support vision                                                                                                                                                                                                                                                            |


Product flags such as lockdown and Auto-improve now live in [config/feature-flags.json](config/feature-flags.json). With lockdown disabled, you can mix providers — e.g. OpenRouter for one node and LM Studio for another. See `.env.example` for env-only keys and [config/README.md](config/README.md) for checked-in defaults.

## Canvas Workflow

The primary working interface is a visual node-graph canvas (`/canvas`):

1. **Input nodes** (left) — Design Brief, Existing Design, Research Context, Objectives & Metrics, Design Constraints. On a fresh canvas, optional inputs may appear as **ghost placeholders**; opening **Canvas Manager** → **Load** restores a full canvas snapshot and materializes real **input nodes** when a legacy saved spec already has text or images for those **facets**. **Research Context**, **Objectives & Metrics**, and **Design Constraints** offer an optional **auto-generate** control (from the Design Brief and other filled facets) using the **first Model node** on the canvas and `POST /api/inputs/generate` — details in [USER_GUIDE.md](USER_GUIDE.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
2. **Model node** — Connect to the Incubator or to Hypotheses. Each **Hypothesis** accepts **one** active model connection at a time (a new connection replaces the previous one). The **Incubator** may still have multiple models for different workflows.
3. **Incubator** — Connect input nodes and a Model node, then click Generate to produce hypothesis strategies
4. **Hypotheses** — Editable strategy cards. Connect a Model node and use **Design** to run the **agentic** Pi build (**Auto-improve** off = one build with no evaluator; **on** = evaluation + optional revision rounds)
5. **Design System** (optional) — Connect to hypotheses to inject design tokens into generation
6. **Previews** — Rendered design previews with zoom, version navigation, full-screen (hypothesis-scoped design stepping when domain preview slots exist), and optional **mark as best** vs evaluator ranking. Agentic results include a file explorer, zip download, **run workspace** overlay (timeline, tasks, tabs) with multi-round eval preview when applicable, and (when the run finishes) an evaluation scorecard plus optional headless-browser thumbnail.

Nodes connect left-to-right. Auto-layout arranges everything based on connections. Previews can connect back to Existing Design for iterative feedback loops.

The header also opens **Settings** (General preferences). In **development**, a **design tokens kitchen sink** modal is on the General tab. Token semantics live in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Scripts


| Command             | What it does                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Start Vite SPA dev server (default port **4732**; override with **`VITE_PORT`**)                                                                                                                                         |
| `pnpm dev:server`   | Start Hono API server (default port **4731**; override with **`PORT`**)                                                                                                                                                  |
| `pnpm dev:all`      | Start API then Vite (waits for `/api/health` — avoids proxy race)                                                                                                                        |
| `pnpm dev:kill`     | Stop processes listening on default API (**4731**) and Vite (**4732**) ports (`PORT` / `VITE_PORT` when set)                                                                                                           |
| `pnpm build`        | Type-check and production build                                                                                                                                                          |
| `pnpm test`         | Vitest unit tests (Playwright merge test excluded in config; **`pnpm test:playwright-eval`** runs it — see [AGENTS.md](AGENTS.md))                                                       |
| `pnpm lint`         | Run ESLint                                                                                                                                                                               |
| `pnpm knip`         | Optional unused **files** and **dependencies** report via Knip (`--include files,dependencies`; not run in CI by default)                                                                |
| `pnpm meta-harness` | Optional **meta-harness** CLI: benchmark/proposer harness against the local API ([meta-harness/README.md](meta-harness/README.md), [RUNBOOK](meta-harness/RUNBOOK.md))                   |
| `pnpm snap`         | Checkpoint prompt/skill/rubric versions (changed files only); list/diff/restore subcommands ([USER_GUIDE.md](USER_GUIDE.md#version-history), [skills/README.md](skills/README.md)) |


## Documentation

**AI coding agents:** Full repo conventions live in **[AGENTS.md](AGENTS.md)** (vendor-neutral name). **[CLAUDE.md](CLAUDE.md)** exists only so **Claude Code** auto-loads a pointer to **AGENTS.md**—do not maintain two copies of the same guidance.


| Document                                         | Purpose                                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                           | **Canonical** agent instructions: commands, architecture **pointers**, skill-based prompts, gotchas ([Pi sandbox detail](ARCHITECTURE.md#pi-design-sandbox-three-layer-contract) in **ARCHITECTURE**) |
| [CLAUDE.md](CLAUDE.md)                           | Stub for Claude Code → links **AGENTS.md**                                                                                                                                                            |
| [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)         | Narrative: canvas, prompts, agentic loop, evaluation                                                                                                                                                  |
| [PRODUCT.md](PRODUCT.md)                         | **North Star** + feature-level description: modes, nodes, providers                                                                                                                                   |
| [USER_GUIDE.md](USER_GUIDE.md)                   | Setup and day-to-day canvas workflow                                                                                                                                                                  |
| [config/README.md](config/README.md)             | Human-editable JSON knobs for feature flags, defaults, evaluator thresholds, browser scoring, and content limits                                                                                       |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)             | SPA design tokens (Indigo palette, light + dark via `.dark` class): atoms (`Button`, `Badge`), typography triad, file-role colors. Package shell at `packages/design-system/` (`tokens.json` → `pnpm tokens:build` → generated `:root`/`.dark` CSS; drift guards). Visual reference: [AutoDesigner Indigo Reference.html](AutoDesigner%20Indigo%20Reference.html)                                                                                                        |
| [ARCHITECTURE.md](ARCHITECTURE.md)               | Technical reference: routes, stores, data flow, Pi adapter boundary, **Pi sandbox** (layers, tool inventory, edit cascade)                                                                            |
| [meta-harness/README.md](meta-harness/README.md) | Optional **meta-harness** CLI (separate from the designer app): benchmarks, proposer ([RUNBOOK.md](meta-harness/RUNBOOK.md), [VERSIONING.md](meta-harness/VERSIONING.md))                             |
| [DOCUMENTATION.md](DOCUMENTATION.md)             | How this doc set is organized (hub = this README)                                                                                                                                                     |


## Deploying

V1 production can run on **Vercel Pro** (`vercel.json` + `api/[[...route]].js` → Hono, `maxDuration = 800`) with bounded synchronous SSE streams. Users must keep the browser tab/request open while long design runs execute; if the connection drops, the in-flight run cannot be resumed and must be started again. Set `OPENROUTER_API_KEY`; set `ALLOWED_ORIGINS` when the SPA origin differs from `/api`; set `PREVIEW_PUBLIC_URL` to the production origin when server-side browser evaluation must call a public preview URL. The home page and canvas use `/api/provider-status/openrouter` to show OpenRouter budget availability without exposing key details. See [ARCHITECTURE.md § Deployment](ARCHITECTURE.md#deployment).

Ephemeral **preview sessions** may not persist across separate serverless invocations—the UI falls back to bundled **`srcDoc`** when a preview URL 404s (relative links in that mode are limited).

## Tech Stack

Vite + React 19 + TypeScript, Zustand (state), Tailwind CSS v4 (styling; UI typefaces in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)), @xyflow/react v12 (canvas), react-router-dom v7 (routing), @tanstack/react-query (async state), Zod (schema validation), Vitest (testing). Agentic mode: `@mariozechner/pi-coding-agent` with **just-bash**; native Pi file tools are mapped to the virtual project in `server/services/pi-sdk/` so the host filesystem stays isolated. See [ARCHITECTURE.md](ARCHITECTURE.md).
