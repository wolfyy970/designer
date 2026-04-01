# System overview (end-to-end)

This document is the **narrative** companion to [ARCHITECTURE.md](ARCHITECTURE.md): how prompts, the canvas, and the agentic engine fit together. For file-level maps and API tables, use ARCHITECTURE; for day-to-day usage, [USER_GUIDE.md](USER_GUIDE.md).

---

## What the user does on the canvas

1. **Spec inputs (left column)** — Five section nodes hold structured text and images; content is mirrored into the **spec store** and fed into compilation.
2. **Incubator (compiler node)** — Connects section nodes, optional critique/variant feedback, and a **model** node. **Compile** calls the server LLM to produce a **dimension map** (hypothesis strategies).
3. **Hypothesis nodes** — Each card is one strategy. A **model** connection sets provider/model. **Direct** mode = one-shot HTML; **Agentic** = multi-file PI loop with tools. Domain state (wiring, models, design systems) lives in `workspace-domain-store`; the graph is a **projection** kept in sync via `domain-commands`.
4. **Design system node** — Optional; injects tokens/text into prompts when wired to hypotheses or used from domain snapshots.
5. **Variant nodes** — Show iframe previews; agentic runs get a file tree, zip, and evaluation summary. Versions stack per strategy; **Existing design** feedback loops can capture screenshots from variants.

Multi-model runs per hypothesis use **`/api/hypothesis/generate`**: one SSE stream multiplexed with `laneIndex` and `lane_done` per model.

---

## Prompts and where they come from

| Role | Purpose | Typical storage |
|------|---------|-----------------|
| **Compiler** | Turn the design spec into dimensions + variant strategies | DB seeds (`compilerSystem`, `compilerUser`) + client overrides |
| **Variant** | Per-hypothesis user-facing generation prompt template | DB + `compileVariantPrompts()` on client; bundle API uses same template server-side |
| **Single-shot system** | Constraints for one HTML response | `genSystemHtml` (defaults in `shared-defaults`, overridable) |
| **Agentic system** | Multi-file static artifact rules (entry `index.html`, local assets, etc.) | `genSystemHtmlAgentic` + DB skills appended on server |
| **Skills** | Versioned markdown “playbooks” under a virtual `skills/` tree | Prisma seed; loaded into the agentic system prompt and virtual workspace |

Evaluators use separate LLM rubrics (browser / design / strategy / implementation) orchestrated on the server — not the same prompts as the builder model.

---

## PI engine (agentic generation)

Isolation boundary: **`server/services/pi-agent-service.ts`** and **`pi-agent-tools.ts`** own `@mariozechner/pi-agent-core`. The rest of the app talks to them through **`runDesignAgentSession`** / generate execution.

**Virtual workspace** — In-memory file map (`VirtualWorkspace`): the model **read**s, **grep**s, **edit**s, **write**s, **ls**, **find**, optional **plan_files**, **todo_write**, and **validate_**html/js. Thinking tokens are sanitized before streaming to the client.

**Loop** — The PI `Agent` streams turns; the subscribe handler (see `pi-agent-subscribe-handlers.ts`) forwards progress, activity, traces, and file writes to SSE. Long histories **compact** via `compactWithLLM` (summarize mid-conversation) with evaluation context appended when in revision rounds.

**Evaluation and revision** — After a build pass, **design-evaluation-service** runs rubric workers and a deterministic **browser QA** preflight (VM); optional **Playwright** merges in when enabled and Chromium is available. Scores and a revision brief can **re-seed** the agent for another round (bounded max rounds).

---

## Client/server boundary (mental model)

- **Browser:** Canvas UI, Zustand, IndexedDB for code/files, local prompt compilation for preview, API client with **Zod-validated** JSON for stable endpoints and **SSE framing** helpers for generate streams.
- **Server:** All provider keys, compile, generate, hypothesis multiplex, design-system extract, logs. Hypothesis routes validate workspace payloads (including **DesignSpec** and **design system** shapes) before building context from `hypothesis-generation-pure.ts`.

---

## Where to read next

| Topic | Document |
|-------|----------|
| API routes, stores, file map | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Feature list and modes | [PRODUCT.md](PRODUCT.md) |
| Step-by-step canvas usage | [USER_GUIDE.md](USER_GUIDE.md) |
| Repo commands / agent gotchas | [CLAUDE.md](CLAUDE.md) |
| How we maintain docs | [DOCUMENTATION.md](DOCUMENTATION.md) |
