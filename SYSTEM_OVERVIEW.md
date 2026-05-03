# System overview (end-to-end)

This document is the **narrative** companion to [ARCHITECTURE.md](ARCHITECTURE.md): how prompts, the canvas, and the agentic engine fit together. Every subsystem described below serves the [North Star](PRODUCT.md#north-star). For file-level maps and API tables, use ARCHITECTURE; for day-to-day usage, [USER_GUIDE.md](USER_GUIDE.md).

---

## What the user does on the canvas

1. **Source inputs (left column)** — Four spec facets hold structured text/images (Design Brief, Research Context, Objectives & Metrics, Design Constraints), and the required Design System node holds either the built-in Wireframe source, custom visual-system text/Markdown/images, or an explicit None state. Spec-facet content is mirrored into the **spec store**; Design System content stays on the node.
2. **Incubator** — Connects **source input nodes**, optional **preview → incubator** reference designs, and a **model** node. Before strategy generation it can synthesize a design specification and refresh missing/stale connected DESIGN.md documents; **Incubate** then calls the server LLM to produce an **incubation plan** (hypothesis strategies).
3. **Hypothesis nodes** — Each card is one strategy. A **model** connection sets provider/model. **Design** always runs the multi-file Pi loop with tools; **Auto-improve** toggles evaluator-driven revision passes after the first build + scorecard. Domain state (wiring, models, design systems, revision defaults) lives in `workspace-domain-store`; the graph is a **projection** kept in sync via `domain-commands`.
4. **Design system node** — Required source input. Wireframe mode provides the default low-fidelity DESIGN.md source; Custom mode stores source text, Markdown, and images; None mode excludes design-system guidance. The Incubator prepares a generated Google DESIGN.md document when needed, then that document is injected into prompts when wired to the Incubator or hypotheses. Model selection remains implicit through the node performing the generation.
5. **Preview nodes** — Show iframe previews (URL-backed virtual FS for agentic multi-file), zip downloads, and evaluation summaries. Versions stack per strategy; previews can feed the Incubator as prior-output reference designs.

Multi-model runs per hypothesis use **`/api/hypothesis/generate`**: one SSE stream multiplexed with `laneIndex` and `lane_done` per model. V1 hosted deployment keeps these synchronous SSE streams as the production path; the browser connection must stay open until the run finishes.

---

## Prompts and where they come from

Prompt **bodies** ship inside the [`@auto-designer/pi`](packages/auto-designer-pi/) package — three real skills under `packages/auto-designer-pi/skills/<key>/SKILL.md` plus per-task prompt templates under `packages/auto-designer-pi/prompts/<name>.md` (including the designer system prompt `_designer-system.md`). `server/lib/prompt-resolution.ts` resolves them per request; `src/lib/prompts/defaults.ts` defines **keys** and labels only. Canvas usage and editing workflow: [USER_GUIDE.md](USER_GUIDE.md).


| Role                  | Purpose                                                                       | Typical storage                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internal context**  | Synthesize connected spec inputs into a design specification                  | Prompt template `gen-internal-context.md` (inlined into the agent user prompt by `internal-context.ts`)                                                                                                                                                                                            |
| **Design-system extract** | Convert design-system text, Markdown, and images into Google DESIGN.md   | Prompt templates `ds-extract.md`, `ds-extract-input.md`, `ds-generate.md`                                                                                                                                                                                                                          |
| **Incubator (plan)**  | Turn connected inputs + generated documents into dimensions + hypothesis strategies | Prompt template `gen-hypotheses.md` (inlined by `incubate.ts`) + glue template `INCUBATOR_USER_INPUTS_TEMPLATE`                                                                                                                                                                                    |
| **Hypothesis prompt** | Per-hypothesis user-facing generation prompt template                         | Glue template `DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE` + client `compileVariantPrompts()` in `src/test-support/compile-variant-prompts.ts` (merges strategy into the template — function name is historical); API uses the same template server-side                                                  |
| **Agentic system**    | Multi-file static artifact rules (entry `index.html`, local assets, tool use) | Prompt template `_designer-system.md` (resolved via `loadDesignerSystemPrompt()` from the package) plus `use_skill` for the three real skills below                                                                                                                                                |
| **Skills**            | Three Agent-Skills packages the agent loads autonomously                       | `accessibility`, `design-generation`, `design-quality` under `packages/auto-designer-pi/skills/<key>/`. Each Pi session embeds `<available_skills>` in the `use_skill` tool; `use_skill` loads `SKILL.md`, and resource tools list/read sibling text files                                          |


Evaluators use separate LLM rubrics (browser / design / strategy / implementation) orchestrated on the server — not the same prompts as the builder model.

---

## PI engine (agentic generation)

**Swap boundary** — Only the [`@auto-designer/pi`](packages/auto-designer-pi/) workspace package imports `@mariozechner/pi-ai` / `@mariozechner/pi-coding-agent`. The host calls the package through one entry point in `server/services/pi-agent-runtime.ts`; orchestrators and task routes go through the app-owned `agent-runtime.ts` facade above it. Host-side glue that translates the package's session events into app `AgentRunEvent`s and writes LLM-log entries lives next to the runtime: `pi-bridge-*.ts`, `pi-session-event-bridge.ts`, `pi-llm-log.ts`.

**Sandbox** — **just-bash** provides an in-memory tree at a fixed project root for **generated** artifacts only; the package's three real skills are loaded by the agent via `use_skill`. The package's tool builders + designer extension assemble: Pi-native virtual file tools (`read`, `write`, `edit`, `ls`, `find`, `grep`), plus `bash`, `todo_write`, `use_skill`, `list_skill_resources`, `read_skill_resource`, `validate_js`, and `validate_html`. Skill scripts are readable source only, not executable. The wrapped `edit` tool can retry once after a "could not find" error via the package's `edit-match-cascade.ts` — see [ARCHITECTURE.md § Pi design sandbox](ARCHITECTURE.md#pi-design-sandbox) for the tool table and cascade behavior. SSE `file` events fire when paths under the project root change via virtual tool writes or bash.

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
