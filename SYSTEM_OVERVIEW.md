# System overview (end-to-end)

This document is the **narrative** companion to [ARCHITECTURE.md](ARCHITECTURE.md): how prompts, the canvas, and the agentic engine fit together. Every subsystem described below serves the [North Star](PRODUCT.md#north-star). For file-level maps and API tables, use ARCHITECTURE; for day-to-day usage, [USER_GUIDE.md](USER_GUIDE.md).

---

## What the user does on the canvas

1. **Source inputs (left column)** — Four spec facets hold structured text/images (Design Brief, Research Context, Objectives & Metrics, Design Constraints), and Design System holds visual-system text, Markdown, and images. Spec-facet content is mirrored into the **spec store**; Design System content stays on the node.
2. **Incubator** — Connects **source input nodes**, optional **preview → incubator** reference designs, and a **model** node. Before strategy generation it can synthesize a design specification and refresh missing/stale connected DESIGN.md documents; **Incubate** then calls the server LLM to produce an **incubation plan** (hypothesis strategies).
3. **Hypothesis nodes** — Each card is one strategy. A **model** connection sets provider/model. **Design** always runs the multi-file Pi loop with tools; **Auto-improve** toggles evaluator-driven revision passes after the first build + scorecard. Domain state (wiring, models, design systems, revision defaults) lives in `workspace-domain-store`; the graph is a **projection** kept in sync via `domain-commands`.
4. **Design system node** — Optional source input; stores source text, Markdown, and images. The Incubator prepares a generated Google DESIGN.md document when needed, then that document is injected into prompts when wired to the Incubator or hypotheses. Model selection remains implicit through the node performing the generation.
5. **Preview nodes** — Show iframe previews (URL-backed virtual FS for agentic multi-file), zip downloads, and evaluation summaries. Versions stack per strategy; previews can feed the Incubator as prior-output reference designs.

Multi-model runs per hypothesis use **`/api/hypothesis/generate`**: one SSE stream multiplexed with `laneIndex` and `lane_done` per model. V1 hosted deployment keeps these synchronous SSE streams as the production path; the browser connection must stay open until the run finishes.

---

## Prompts and where they come from

Prompt **bodies** live on disk: **`skills/<key>/SKILL.md`** plus **`prompts/designer-agentic-system/PROMPT.md`**. **`server/lib/prompt-resolution.ts`** loads and composes them per request; **`src/lib/prompts/defaults.ts`** defines **keys** and labels only. Canvas usage and editing workflow: [USER_GUIDE.md](USER_GUIDE.md).


| Role                  | Purpose                                                                       | Typical storage                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internal context**  | Synthesize connected spec inputs into a design specification                  | Skill **`internal-context-synthesis`**                                                                                                                                                                                                                                            |
| **Design-system extract** | Convert design-system text, Markdown, and images into Google DESIGN.md   | Skills **`design-system-extract-system`**, **`design-system-extract-user-input`**                                                                                                                                                                                                 |
| **Incubator (plan)**  | Turn connected inputs + generated documents into dimensions + hypothesis strategies | Skills **`hypotheses-generator-system`**, **`incubator-user-inputs`**                                                                                                                                                                                                             |
| **Hypothesis prompt** | Per-hypothesis user-facing generation prompt template                         | Skill **`designer-hypothesis-inputs`** + client **`compileVariantPrompts()`** in `src/test-support/compile-variant-prompts.ts` (merges strategy into the template — function name is historical); API uses the same template server-side                                                                                           |
| **Agentic system**    | Multi-file static artifact rules (entry `index.html`, local assets, tool use) | **`prompts/designer-agentic-system/PROMPT.md`** plus **`use_skill`** for repo **`skills/`** when the model loads them (host-backed, not sandbox files)                                                                                                                                           |
| **Skills**            | Repo-backed Agent Skills packages                                             | Files under repo-root **`skills/<key>/`**. Each Pi session embeds **`<available_skills>`** in the **`use_skill`** tool (non-`manual`); `use_skill` loads `SKILL.md`, and resource tools can list/read sibling text files from the host catalog |


Evaluators use separate LLM rubrics (browser / design / strategy / implementation) orchestrated on the server — not the same prompts as the builder model.

---

## PI engine (agentic generation)

**Swap boundary** — Only `server/services/pi-sdk/` imports **`@mariozechner/pi-ai`** / **`@mariozechner/pi-coding-agent`**. Generate/orchestrator and task-agent code call the app-owned **`agent-runtime.ts`** facade, not Pi service modules directly. Pi session wiring lives behind **`pi-agent-service.ts`**; the app VFS contract is **`virtual-workspace.ts`**; deterministic tool grouping lives in **`agent-tool-registry.ts`**; and raw Pi session events are narrowed in **`pi-session-event-bridge.ts`** before becoming app `AgentRunEvent`s.

**Sandbox** — **just-bash** provides an in-memory tree at a fixed project root for **generated** artifacts only; repo skills are **not** copied in — the agent loads them via **`use_skill`** and reads optional package resources through host-backed skill tools. **`tools: []`** disables Pi’s default host-FS tools. The tool registry assembles: Pi-compatible virtual file tools (`read`, `write`, `edit`, `ls`, `find`, `grep`), plus **`bash`**, **`todo_write`**, **`use_skill`**, **`list_skill_resources`**, **`read_skill_resource`**, **`validate_js`**, and **`validate_html`**. Skill scripts are readable source only, not executable. The wrapped **`edit`** tool can **retry once** after a “could not find” error using `[edit-match-cascade.ts](server/services/pi-sdk/edit-match-cascade.ts)` (see [ARCHITECTURE.md § Pi design sandbox](ARCHITECTURE.md#pi-design-sandbox-three-layer-contract) for the full tool table and cascade behavior). SSE **`file`** events fire when paths under the project root change via virtual tool writes or bash.

**Loop** — `createAgentSession` + `session.prompt`; subscribe events are bridged to app SSE. Long histories **compact** with the SDK’s token-aware compaction; evaluation context is appended in revision rounds when **Auto-improve** is on.

**Evaluation and revision** — Only when **Auto-improve** is on: after the first build, **design-evaluation-service** runs rubric workers and a deterministic **browser QA** preflight (VM); optional **Playwright** merges when enabled and Chromium is available. Scores and a revision brief can **re-seed** the agent (bounded max rounds). Single-pass runs skip this entirely.

**Deployment runtime** — V1 production uses Vercel Pro bounded synchronous SSE functions. If the browser/server connection drops, the active run cannot resume and the UI tells the user to start again. Durable background jobs remain a future v2 boundary, not part of the first hosted path.

---

## Client/server boundary (mental model)

- **Browser:** Canvas UI, Zustand, IndexedDB for code/files, local **prompt assembly** (`compileVariantPrompts`) before generate, API client with shared Zod request/response contracts and SSE helpers for framing, JSON parsing, dispatch, and lane routing.
- **Server:** All provider keys, **incubate**, generate, hypothesis multiplex, design-system extract, logs. Task and hypothesis routes validate shared wire contracts before building context from `hypothesis-generation-pure.ts`.

---

## Where to read next


| Topic                         | Document                             |
| ----------------------------- | ------------------------------------ |
| API routes, stores, file map  | [ARCHITECTURE.md](ARCHITECTURE.md)   |
| Feature list and modes        | [PRODUCT.md](PRODUCT.md)             |
| Step-by-step canvas usage     | [USER_GUIDE.md](USER_GUIDE.md)       |
| Repo commands / agent gotchas | [AGENTS.md](AGENTS.md)               |
| How we maintain docs          | [DOCUMENTATION.md](DOCUMENTATION.md) |
