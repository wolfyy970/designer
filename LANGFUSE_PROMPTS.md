# Langfuse prompt names (human guide)

In **Langfuse** and **Prompt Studio**, templates are keyed by **kebab-case** identifiers (stable API names). This page maps each name to **what it’s for** and **when the app uses it**.

**Backward compatibility:** Pre-rename **camelCase** names (e.g. `compilerSystem`, `variant` as a **prompt** key) are still accepted when opening Prompt Studio from deep links — see `LEGACY_PROMPT_KEY_ALIASES` in `[src/lib/prompts/defaults.ts](src/lib/prompts/defaults.ts)`. Canvas **node** type is now `preview` (renamed from `variant`).

The API’s `**getPromptBody`** (when Langfuse is configured) tries the **new** Langfuse name first, then the **legacy** name, so runs keep working until `pnpm db:seed` / `pnpm langfuse:sync-prompts` has created the kebab-case prompts.

**Production source of truth for template text:** labeled versions in [Langfuse Cloud](https://langfuse.com/docs/deployment/cloud) (or self-hosted) — the server resolves prompts via **`getPromptBody`** at runtime. The repo’s `src/lib/prompts/shared-defaults.ts` is used when **creating** a missing prompt and as the **import source** for `**pnpm langfuse:sync-prompts**`. **Prompt Studio** in the app **reads** that baseline from **`GET /api/prompts`** but **does not write Langfuse** from Save; local drafts live in the browser and are sent as optional **`promptOverrides`** on incubate / hypothesis / design-system / inputs-generate requests (see [ARCHITECTURE.md](ARCHITECTURE.md)). `**pnpm db:seed**` bootstraps missing keys only; `**pnpm langfuse:sync-prompts**` aligns every labeled prompt with repo/SQLite by calling **`prompt.create`** per changed key — Langfuse stores a **new version** and moves **`LANGFUSE_PROMPT_LABEL`** (e.g. `production`) to it; **older versions stay** in the UI for history. `**pnpm db:seed**` also runs a **migration step** for legacy Langfuse names.

**In-app labels** (Prompt Studio sidebar) match `[PROMPT_META](src/lib/prompts/defaults.ts)` — use that file for **template variables** (e.g. `{{DESIGN_BRIEF}}`) per key.

---

## Incubator (incubation plan)


| Langfuse name                     | Plain-language goal                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**hypotheses-generator-system`** | Tells the LLM how to think as the **Incubator**: read your spec, infer **dimensions** and **hypothesis strategies**, and return structured **JSON** (the incubation plan). |
| `**incubator-user-inputs`**       | The **filled-in spec package** sent with `hypotheses-generator-system`: brief, constraints, research, metrics, images — the concrete inputs for that incubate call.    |


**Runs when:** you incubate from the **Incubator** node (`POST /api/incubate`, SSE `incubate_result`).

---

## Designer (generate for a hypothesis)


| Langfuse name                    | Plain-language goal                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `**designer-agentic-system`**    | **Agentic** generation: system rules for the **tool-using agent** (virtual files, milestones, self-critique) before the static artifact is finalized.                          |
| `**designer-agentic-revision-user`** | **Agentic revision rounds only**: user instructions merged after the **assembled** hypothesis context and before the evaluator **revision brief** (post-evaluation Pi passes).   |
| `**designer-hypothesis-inputs`** | The **per-hypothesis user prompt**: strategy name, hypothesis, dimensions, design brief, optional design-system block — what tells the model *which* design to build this run. |


**Runs when:** you **Design** on a hypothesis (`/api/hypothesis/generate`; Pi tools always; evaluation + revision only when **Auto-improve** is on — otherwise a single build, `evaluationContext: null` on the wire).

---

## Design system (screenshot extract)


| Langfuse name                          | Plain-language goal                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `**design-system-extract-system`**     | System instructions for turning **screenshots** into a structured **JSON design system** (tokens, components, patterns). |
| `**design-system-extract-user-input`** | Short user message paired with the images for that extract call (no placeholders in the default).                        |


**Runs when:** you extract from the **Design System** flow (`/api/design-system/extract`).

---

## Input nodes (magic wand auto-fill)

System prompts for **Generate** on **Research Context**, **Objectives & Metrics**, and **Design Constraints** when the user fills **Design Brief** first. The server builds a structured user message from the brief and any other spec sections; these keys control tone, grounding, and hallucination rules.

**Canonical keys** (new): `inputs-gen-research-context`, `inputs-gen-objectives-metrics`, `inputs-gen-design-constraints`. **Legacy aliases** `section-gen-*` still resolve via `LEGACY_PROMPT_KEY_ALIASES` in `defaults.ts`.


| Langfuse name                        | Plain-language goal                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `**inputs-gen-research-context`**   | Draft **Research & Context** from the brief: users, behaviors, and themes — **(Inferred)** where extrapolated; no fake studies or data.      |
| `**inputs-gen-objectives-metrics`** | Draft **Objectives & Metrics**: outcomes and observable success signals; no invented KPI numbers unless the brief states them.              |
| `**inputs-gen-design-constraints`** | Draft **Design Constraints**: non-negotiables vs exploration ranges, grounded in the brief.                                                   |


**Runs when:** you click **Generate** on one of those three input nodes (`POST /api/inputs/generate`). **Prompt Studio** includes these keys for local overrides.

---

## Agent (context compaction + sandbox)


| Langfuse name                  | Plain-language goal                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**agent-context-compaction`** | When the agentic session **truncates history**, this prompt defines how to **summarize** prior work into a checkpoint the model can continue from without losing the thread.                                                          |
| `**agents-md-file`**           | Body seeded as `**AGENTS.md**` at the virtual workspace root (`/home/user/project`). Describes the **virtual file tree** (multi-page HTML, CSS, JS, assets), default preview entry (`index.html`), and forbids npm/Vite/CDNs/network. |


**Runs during:** `**agent-context-compaction`** — when the Pi session compacts long histories (still in `pi-agent-service`). `**agents-md-file**` — when `**buildAgenticSystemContext**` runs at each orchestrator Pi session boundary (initial build and revision rounds), merged into sandbox seed files as `**AGENTS.md**`.

---

## Evaluators (after generation)

Three **separate rubrics** score the artifact for **design quality**, **strategy fidelity**, and **implementation quality**. Each returns structured **JSON** for downstream gating.


| Langfuse name                     | Plain-language goal                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `**evaluator-design-quality`**    | Subjective **design / UX** critique (craft, coherence, originality, usability) of the preview.                                                                                 |
| `**evaluator-strategy-fidelity`** | Does the output **match the hypothesis**, KPIs, constraints, and design-system guidance?                                                                                       |
| `**evaluator-implementation`**    | **Frontend engineering** review: file-tree structure, `**preview_page_url`** + `source_files`, optional bundled fallback; whether the implementation expresses the design bet. |


**Runs when:** evaluation runs after each hypothesis build on the server — not the same call as the “builder” model.

---

## Quick “what should I tweak?”


| If this feels wrong…                                  | Start with these Langfuse names                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Strategies are vague or JSON is malformed             | `hypotheses-generator-system`, `incubator-user-inputs`                                          |
| First-pass HTML off-brief or off-style               | `designer-agentic-system`, `designer-hypothesis-inputs`                                          |
| Agent doesn’t plan, files are messy, or tools misused | `designer-agentic-system` (+ **Skills** in repo `skills/`, not Langfuse)                        |
| Extract misses tokens or invents structure            | `design-system-extract-system`                                                                  |
| Agent “forgets” after long runs                       | `agent-context-compaction`                                                                      |
| Agent tries npm/Vite/host-repo workflows              | `agents-md-file` (+ sealed Pi `cwd` / resource loader; see ARCHITECTURE)                        |
| Scores don’t match what you care about                | `evaluator-design-quality`, `evaluator-strategy-fidelity`, `evaluator-implementation`           |
| Need to **reset all** prompt bodies from repo/SQLite  | `pnpm langfuse:sync-prompts` (new Langfuse **versions** + label move; history retained); routine `pnpm db:seed` does **not** |


---

## Observability vs Langfuse

**In-app Observability** (LLM + Run trace tabs) reads `**/api/logs`** on your API: local rings and optional NDJSON. The **Run trace** list is not the same as Langfuse’s nested trace graph.

**Langfuse** (cloud or self-hosted) receives **OpenTelemetry spans and generation events** from the server when tracing keys are set. Use the Observability **Langfuse** tab to jump to the project UI for deep inspection. Details: [USER_GUIDE.md](USER_GUIDE.md) (Observability), [ARCHITECTURE.md](ARCHITECTURE.md) (`/api/logs`, observability sink).

---

## See also

- [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) — where prompts sit in the canvas and agent LLM loop
- [USER_GUIDE.md](USER_GUIDE.md) — Prompt Studio and workflow
- [docker/langfuse/README.md](docker/langfuse/README.md) — optional self-hosted Langfuse