# Auto Designer

A specification workspace that helps designers define design problem boundaries before AI generation. Specifications compile into hypothesis strategies that systematically explore the solution space. Each hypothesis generates as a complete design — either a single-shot HTML document or an agentic multi-file project with reasoning, self-critique, and revision passes.

Designers write structured inputs. The compiler reasons about the exploration space. The generator produces renderable variants. Everything connects on a visual node-graph canvas.

## Quick Start

```bash
pnpm install
cp .env.example .env.local  # add your API keys
# Agentic mode uses Playwright for browser-grounded evaluation (after first run):
pnpm exec playwright install chromium
pnpm dev:all                 # recommended: API + Vite (API waits until /api/health is up)
# Or two terminals: pnpm dev:server  then  pnpm dev
```

Both processes are required for local development. The Vite dev server proxies `/api/*` to the Hono server on port **3001**. If Vite starts before the API is listening, the first requests can fail with `ECONNREFUSED` — use `dev:all` or hard-refresh after you see `API server running`.

**`EADDRINUSE` on port 3001:** Something is still bound to the API port — often a **background** `pnpm dev:server` left over from `pnpm dev:server & pnpm dev` after `Ctrl+C` (check `jobs` / `fg`; or free the port: `lsof -nP -iTCP:3001 -sTCP:LISTEN` then `kill <pid>`). Prefer **`pnpm dev:all`** or **two terminals** so you don’t stack servers.

### API Configuration

| Key | Where to get it | Required | What it does |
|-----|----------------|----------|--------------|
| `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai) | For OpenRouter | Server-side only — proxied via Vite, never exposed to browser |
| `VITE_LMSTUDIO_URL` | Local (default: `http://192.168.252.213:1234`) | For LM Studio | Local inference endpoint |
| `VITE_LMSTUDIO_VISION_MODELS` | N/A | Optional | Comma-separated model ID substrings that support vision |

You can mix and match providers — e.g. OpenRouter Claude for compilation, LM Studio for generation. See `.env.example` for all options.

## Canvas Workflow

The primary interface is a visual node-graph canvas (`/canvas`, the default route):

1. **Input nodes** (left) — Design Brief, Existing Design, Research Context, Objectives & Metrics, Design Constraints
2. **Model node** — Connect to the Incubator or Hypotheses to configure which provider and model they use
3. **Incubator** — Connect input nodes and a Model node, then click Generate to produce hypothesis strategies
4. **Hypotheses** — Editable strategy cards. Connect a Model node, choose **Direct** (one-shot) or **Agentic**, then **Generate** or **Run agent**
5. **Design System** (optional) — Connect to hypotheses to inject design tokens into generation
6. **Variants** — Rendered design previews with zoom, version navigation, and full-screen. Agentic results include a file explorer, zip download, and (when the run finishes) an evaluation scorecard plus optional headless-browser thumbnail.

Nodes connect left-to-right. Auto-layout arranges everything based on connections. Variants can connect back to Existing Design for iterative feedback loops.

## Scripts

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start Vite SPA dev server (port 5173) |
| `pnpm dev:server` | Start Hono API server (port 3001) |
| `pnpm dev:all` | Start API then Vite (waits for `/api/health` — avoids proxy race) |
| `pnpm dev:kill` | Stop processes listening on ports 3001 (API) and 5173 (Vite) |
| `pnpm build` | Type-check and production build |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm lint` | Run ESLint |
| `pnpm db:migrate` | Apply Prisma migrations (set `DATABASE_URL` in `.env`) |
| `pnpm db:seed` | Seed prompts/skills into the DB |

## Documentation

| Document | Purpose |
|----------|---------|
| [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) | End-to-end: canvas roles, system prompts, PI agent, evaluation loop |
| [PRODUCT.md](PRODUCT.md) | What exists today — features, generation modes, canvas nodes, providers |
| [USER_GUIDE.md](USER_GUIDE.md) | How to use the canvas workflow |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, generation engine, module boundaries, API reference |
| [DOCUMENTATION.md](DOCUMENTATION.md) | How docs are organized and maintained |
| [CLAUDE.md](CLAUDE.md) | Commands and conventions for AI-assisted development |

## Tech Stack

Vite + React 19 + TypeScript, Zustand (state), Tailwind CSS v4 (styling), @xyflow/react v12 (canvas), react-router-dom v7 (routing), @tanstack/react-query (async state), Zod (schema validation), Vitest (testing), @mariozechner/pi-agent-core (agentic loop). See [ARCHITECTURE.md](ARCHITECTURE.md) for details.
