# System overview (end-to-end)

This document is the **narrative** companion to [ARCHITECTURE.md](ARCHITECTURE.md): how prompts, the canvas, and the agentic engine fit together. Every subsystem described below serves the [North Star](PRODUCT.md#north-star). For file-level maps and API tables, use ARCHITECTURE; for day-to-day usage, [USER_GUIDE.md](USER_GUIDE.md).

---

## What the user does on the canvas

1. **Spec inputs (left column)** — Five **input nodes** hold structured text and images (the document’s `spec.sections` facets); content is mirrored into the **spec store** and fed into **incubate**.
2. **Incubator** — Connects **input nodes**, optional **preview → incubator** reference designs, and a **model** node. **Incubate** calls the server LLM to produce an **incubation plan** (hypothesis strategies).
3. **Hypothesis nodes** — Each card is one strategy. A **model** connection sets provider/model. **Design** always runs the multi-file Pi loop with tools; **Auto-improve** toggles evaluator-driven revision passes after the first build + scorecard. Domain state (wiring, models, design systems, revision defaults) lives in `workspace-domain-store`; the graph is a **projection** kept in sync via `domain-commands`.
4. **Design system node** — Optional; injects tokens/text into prompts when wired to hypotheses or used from domain snapshots.
5. **Preview nodes** — Show iframe previews (URL-backed virtual FS for agentic multi-file); zip, evaluation summary. Versions stack per strategy; **Existing design** feedback loops can capture screenshots from previews.

Multi-model runs per hypothesis use **`/api/hypothesis/generate`**: one SSE stream multiplexed with `laneIndex` and `lane_done` per model.

---

## Prompts and where they come from

Prompt **bodies** live on disk: **`skills/<key>/SKILL.md`** plus **`prompts/designer-agentic-system/PROMPT.md`**. **`server/lib/prompt-resolution.ts`** loads and composes them per request; **`src/lib/prompts/defaults.ts`** defines **keys** and labels only. Canvas usage and editing workflow: [USER_GUIDE.md](USER_GUIDE.md).


| Role                  | Purpose                                                                       | Typical storage                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Incubator (plan)**  | Turn connected inputs into dimensions + hypothesis strategies                 | Skills **`hypotheses-generator-system`**, **`incubator-user-inputs`**                                                                                                                                                                                                             |
| **Hypothesis prompt** | Per-hypothesis user-facing generation prompt template                         | Skill **`designer-hypothesis-inputs`** + client **`compileVariantPrompts()`** in `src/test-support/compile-variant-prompts.ts` (merges strategy into the template — function name is historical); API uses the same template server-side                                                                                           |
| **Agentic system**    | Multi-file static artifact rules (entry `index.html`, local assets, tool use) | **`prompts/designer-agentic-system/PROMPT.md`** plus **`use_skill`** for repo **`skills/`** when the model loads them (host-backed, not sandbox files)                                                                                                                                           |
| **Skills**            | Repo-backed Agent Skills packages                                             | Files under repo-root **`skills/<key>/SKILL.md`**. Each Pi session embeds **`<available_skills>`** in the **`use_skill`** tool (non-`manual`); skills are loaded via **`use_skill`** from the host catalog, not as pre-copied sandbox files |


Evaluators use separate LLM rubrics (browser / design / strategy / implementation) orchestrated on the server — not the same prompts as the builder model.

---

## PI engine (agentic generation)

**Swap boundary** — Only `server/services/pi-sdk/` imports **`@mariozechner/pi-ai`** / **`@mariozechner/pi-coding-agent`**. Session wiring lives in **`pi-agent-service.ts`** (plus `agent-bash-sandbox.ts`, **`sandbox-resource-loader.ts`** for a no-op Pi resource loader, `pi-bash-tool.ts`, `pi-app-tools.ts`, `pi-session-event-bridge.ts`). The rest of the server calls **`runDesignAgentSession`** through generate/orchestrator code — not the Pi SDK directly — so another agent runtime could replace Pi behind the same seam.

**Sandbox** — **just-bash** provides an in-memory tree at a fixed project root for **generated** artifacts only; repo skills are **not** copied in — the agent loads them via **`use_skill`**. **`tools: []`** disables Pi’s default host-FS tools. **`pi-sdk/virtual-tools.ts`** registers the same Pi tool *schemas* (`read`, `write`, `edit`, `ls`, `find`, `grep`) with `operations` / `bash.exec` backed by that virtual FS, plus **`bash`**, **`todo_write`**, **`validate_js`**, **`validate_html`**. The wrapped **`edit`** tool can **retry once** after a “could not find” error using `[edit-match-cascade.ts](server/services/pi-sdk/edit-match-cascade.ts)` (see [ARCHITECTURE.md § Pi design sandbox](ARCHITECTURE.md#pi-design-sandbox-three-layer-contract) for the full tool table and cascade behavior). SSE **`file`** events fire when paths under the project root change via virtual tool writes or bash.

**Loop** — `createAgentSession` + `session.prompt`; subscribe events are bridged to app SSE. Long histories **compact** with the SDK’s token-aware compaction; evaluation context is appended in revision rounds when **Auto-improve** is on.

**Evaluation and revision** — Only when **Auto-improve** is on: after the first build, **design-evaluation-service** runs rubric workers and a deterministic **browser QA** preflight (VM); optional **Playwright** merges when enabled and Chromium is available. Scores and a revision brief can **re-seed** the agent (bounded max rounds). Single-pass runs skip this entirely.

---

## Client/server boundary (mental model)

- **Browser:** Canvas UI, Zustand, IndexedDB for code/files, local **prompt assembly** (`compileVariantPrompts`) before generate, API client with **Zod-validated** JSON for stable endpoints and **SSE framing** helpers for generate streams.
- **Server:** All provider keys, **incubate**, generate, hypothesis multiplex, design-system extract, logs. Hypothesis routes validate workspace payloads (including **DesignSpec** and **design system** shapes) before building context from `hypothesis-generation-pure.ts`.

---

## Where to read next


| Topic                         | Document                             |
| ----------------------------- | ------------------------------------ |
| API routes, stores, file map  | [ARCHITECTURE.md](ARCHITECTURE.md)   |
| Feature list and modes        | [PRODUCT.md](PRODUCT.md)             |
| Step-by-step canvas usage     | [USER_GUIDE.md](USER_GUIDE.md)       |
| Repo commands / agent gotchas | [AGENTS.md](AGENTS.md)               |
| How we maintain docs          | [DOCUMENTATION.md](DOCUMENTATION.md) |
