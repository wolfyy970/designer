# System overview (end-to-end)

This document is the **narrative** companion to [ARCHITECTURE.md](ARCHITECTURE.md): how prompts, the canvas, and the agentic engine fit together. For file-level maps and API tables, use ARCHITECTURE; for day-to-day usage, [USER_GUIDE.md](USER_GUIDE.md).

---

## What the user does on the canvas

1. **Spec inputs (left column)** — Five section nodes hold structured text and images; content is mirrored into the **spec store** and fed into compilation.
2. **Incubator (compiler node)** — Connects section nodes, optional **variant → incubator** reference designs, and a **model** node. **Compile** calls the server LLM to produce a **dimension map** (hypothesis strategies).
3. **Hypothesis nodes** — Each card is one strategy. A **model** connection sets provider/model. **Direct** mode = one-shot HTML; **Agentic** = multi-file PI loop with tools. Domain state (wiring, models, design systems) lives in `workspace-domain-store`; the graph is a **projection** kept in sync via `domain-commands`.
4. **Design system node** — Optional; injects tokens/text into prompts when wired to hypotheses or used from domain snapshots.
5. **Variant nodes** — Show iframe previews (URL-backed virtual FS for agentic multi-file); zip, evaluation summary. Versions stack per strategy; **Existing design** feedback loops can capture screenshots from variants.

Multi-model runs per hypothesis use **`/api/hypothesis/generate`**: one SSE stream multiplexed with `laneIndex` and `lane_done` per model.

---

## Prompts and where they come from

For a **plain-English map** of each Langfuse prompt name (`hypotheses-generator-system`, `designer-hypothesis-inputs`, …), see [LANGFUSE_PROMPTS.md](LANGFUSE_PROMPTS.md). **Prompt Studio** edits are **browser-local** drafts applied per request (`promptOverrides`); production text remains in **Langfuse** until you sync or use admin APIs — see [USER_GUIDE.md](USER_GUIDE.md).

| Role | Purpose | Typical storage |
|------|---------|-----------------|
| **Compiler** | Turn the design spec into dimensions + variant strategies | Langfuse (`hypotheses-generator-system`, `incubator-user-inputs`); `pnpm db:seed` creates missing prompts from `shared-defaults` / legacy SQLite — not a full overwrite |
| **Variant** | Per-hypothesis user-facing generation prompt template | Langfuse `variant` + `compileVariantPrompts()` on client; bundle API uses same template server-side |
| **Single-shot system** | Constraints for one HTML response | Langfuse `designer-direct-system` |
| **Agentic system** | Multi-file static artifact rules (entry `index.html`, local assets, etc.) | Langfuse `designer-agentic-system` (optional sandbox **`AGENTS.md`** from `agents-md-file`) |
| **Skills** | Repo-backed Agent Skills packages | Files under repo-root **`skills/<key>/SKILL.md`**. Each Pi session embeds **`<available_skills>`** in the **`use_skill`** tool (non-**`manual`**) and pre-seeds packages under **`skills/<key>/…`** in **`just-bash`**; the agent calls **`use_skill`** or **`read_file`** when needed |

Evaluators use separate LLM rubrics (browser / design / strategy / implementation) orchestrated on the server — not the same prompts as the builder model.

---

## PI engine (agentic generation)

**Swap boundary** — Only `server/services/pi-sdk/` imports **`@mariozechner/pi-ai`** / **`@mariozechner/pi-coding-agent`**. Session wiring lives in **`pi-agent-service.ts`** (plus `agent-bash-sandbox.ts`, **`sandbox-resource-loader.ts`** for a no-op Pi resource loader, `pi-bash-tool.ts`, `pi-app-tools.ts`, `pi-session-event-bridge.ts`). The rest of the server calls **`runDesignAgentSession`** through generate/orchestrator code — not the Pi SDK directly — so another agent runtime could replace Pi behind the same seam.

**Sandbox** — **`just-bash`** provides an in-memory tree at a fixed project root; non-**`manual`** skill packages are copied into **`skills/<key>/…`** at each Pi session start. **`tools: []`** disables Pi’s default host-FS tools. **`pi-sdk/virtual-tools.ts`** registers the same Pi tool *schemas* (`read`, `write`, `edit`, `ls`, `find`, `grep`) with `operations` / `bash.exec` backed by that virtual FS, plus **`bash`**, **`todo_write`**, **`validate_js`**, **`validate_html`**. SSE **`file`** events fire when paths under the project root change via virtual tool writes or bash (including under **`skills/`** when those files are updated in-session).

**Loop** — `createAgentSession` + `session.prompt`; subscribe events are bridged to app SSE. Long histories **compact** with the SDK’s token-aware compaction; evaluation context is still appended in revision rounds.

**Evaluation and revision** — After a build pass, **design-evaluation-service** runs rubric workers and a deterministic **browser QA** preflight (VM); optional **Playwright** merges when enabled and Chromium is available. Scores and a revision brief can **re-seed** the agent (bounded max rounds).

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
