# Lattice

A specification workspace that helps designers define design problem boundaries before AI generation. Specifications compile into hypothesis strategies that systematically explore the solution space. Each hypothesis generates as a complete design — either a single-shot HTML document or an agentic multi-file project with reasoning, self-critique, and revision passes.

Designers write structured inputs. The compiler reasons about the exploration space. The generator produces renderable variants. Everything connects on a visual node-graph canvas.

## Quick Start

```bash
pnpm install
cp .env.example .env.local  # add your API keys
pnpm dev                     # Vite SPA on http://localhost:5173
pnpm dev:server              # Hono API on http://localhost:3001
```

Both processes are required for local development. The Vite dev server proxies `/api/*` to the Hono server.

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
4. **Hypotheses** — Editable strategy cards. Connect a Model node and click **Create** (single-shot) or **Think & Create** (agentic) to generate a variant
5. **Design System** (optional) — Connect to hypotheses to inject design tokens into generation
6. **Variants** — Rendered design previews with zoom, version navigation, and full-screen. Agentic results include a file explorer and zip download.

Nodes connect left-to-right. Auto-layout arranges everything based on connections. Variants can connect back to Existing Design for iterative feedback loops.

## Scripts

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start Vite SPA dev server (port 5173) |
| `pnpm dev:server` | Start Hono API server (port 3001) |
| `pnpm build` | Type-check and production build |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm lint` | Run ESLint |
| `pnpm db:migrate` | Apply Prisma migrations (set `DATABASE_URL` in `.env`) |
| `pnpm db:seed` | Seed prompts/skills into the DB |

## Documentation

| Document | Purpose |
|----------|---------|
| [PRODUCT.md](PRODUCT.md) | What exists today — features, generation modes, canvas nodes, providers |
| [USER_GUIDE.md](USER_GUIDE.md) | How to use the canvas workflow |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, generation engine, module boundaries |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Documentation philosophy and rules |

## Tech Stack

Vite + React 19 + TypeScript, Zustand (state), Tailwind CSS v4 (styling), @xyflow/react v12 (canvas), react-router-dom v7 (routing), @tanstack/react-query (async state), Zod (schema validation), Vitest (testing), @mariozechner/pi-agent-core (agentic loop). See [ARCHITECTURE.md](ARCHITECTURE.md) for details.
