# Langfuse prompt names (human guide)

In **Langfuse** and **Prompt Studio**, templates are keyed by short **camelCase names**. Those strings are stable API identifiers — they are not meant to read like prose. This page maps each name to **what it’s for** and **when the app uses it**.

**Source of truth for template text:** [Langfuse Cloud](https://langfuse.com/docs/deployment/cloud) (or self-hosted) and **Prompt Studio** — not the repo. Repo baselines in `src/lib/prompts/shared-defaults.ts` are used only when **creating** a missing prompt. **`pnpm db:seed`** bootstraps missing keys only; **`pnpm langfuse:sync-prompts`** forces every labeled prompt to match repo/SQLite (overwrites drift).

**In-app labels** (Prompt Studio sidebar) match [`PROMPT_META`](src/lib/prompts/defaults.ts) — use that file for **template variables** (e.g. `{{DESIGN_BRIEF}}`) per key.

---

## Incubator (dimension map compile)

| Langfuse name | Plain-language goal |
|----------------|---------------------|
| **`compilerSystem`** | Tells the LLM how to think as the **Incubator**: read your spec, infer **dimensions** and **variant strategies**, and return structured **JSON** (the dimension map). |
| **`compilerUser`** | The **filled-in spec package** sent with `compilerSystem`: brief, constraints, research, metrics, images — the concrete inputs for that compile call. |

**Runs when:** you compile from the **Incubator** node (`/api/compile`).

---

## Designer (generate a variant)

| Langfuse name | Plain-language goal |
|----------------|---------------------|
| **`genSystemHtml`** | **Direct / single-shot** generation: system rules for outputting one self-contained **HTML** page from the hypothesis + context. |
| **`genSystemHtmlAgentic`** | **Agentic** generation: system rules for the **tool-using agent** (virtual files, milestones, self-critique) before the static artifact is finalized. |
| **`variant`** | The **per-hypothesis user prompt**: strategy name, hypothesis, dimensions, design brief, optional design-system block — what tells the model *which* design to build this run. |

**Runs when:** you **Generate** or **Run agent** on a hypothesis (`/api/generate`, agentic path includes tools + eval).

---

## Design system (screenshot extract)

| Langfuse name | Plain-language goal |
|----------------|---------------------|
| **`designSystemExtract`** | System instructions for turning **screenshots** into a structured **JSON design system** (tokens, components, patterns). |
| **`designSystemExtractUser`** | Short user message paired with the images for that extract call (no placeholders in the default). |

**Runs when:** you extract from the **Design System** flow (`/api/design-system/extract`).

---

## Agent (context compaction + sandbox)

| Langfuse name | Plain-language goal |
|----------------|---------------------|
| **`agentCompactionSystem`** | When the agentic session **truncates history**, this prompt defines how to **summarize** prior work into a checkpoint the model can continue from without losing the thread. |
| **`sandboxAgentsContext`** | Body seeded as **`AGENTS.md`** at the virtual workspace root (`/home/user/project`). Tells the tool-using agent what the sandbox supports (static HTML/CSS/JS) and forbids (npm, Vite, bundlers, CDNs, etc.). |

**Runs during:** **`agentCompactionSystem`** — when the Pi session compacts long histories (still in `pi-agent-service`). **`sandboxAgentsContext`** — when **`buildAgenticSystemContext`** runs at each orchestrator Pi session boundary (initial build and revision rounds), merged into sandbox seed files as **`AGENTS.md`**.

---

## Evaluators (after generation)

Three **separate rubrics** score the artifact for **design quality**, **strategy fidelity**, and **implementation quality**. Each returns structured **JSON** for downstream gating.

| Langfuse name | Plain-language goal |
|----------------|---------------------|
| **`evalDesignSystem`** | Subjective **design / UX** critique (craft, coherence, originality, usability) of the preview. |
| **`evalStrategySystem`** | Does the output **match the hypothesis**, KPIs, constraints, and design-system guidance? |
| **`evalImplementationSystem`** | **Frontend engineering** review: HTML/CSS/JS structure, completeness, whether the code plausibly expresses the design bet. |

**Runs when:** evaluation runs after agentic (and related paths) on the server — not the same call as the “builder” model.

---

## Quick “what should I tweak?”

| If this feels wrong… | Start with these Langfuse names |
|----------------------|----------------------------------|
| Strategies are vague or JSON is malformed | `compilerSystem`, `compilerUser` |
| Single-shot HTML off-brief or off-style | `genSystemHtml`, `variant` |
| Agent doesn’t plan, files are messy, or tools misused | `genSystemHtmlAgentic` (+ **Skills** in Prisma, not Langfuse) |
| Extract misses tokens or invents structure | `designSystemExtract` |
| Agent “forgets” after long runs | `agentCompactionSystem` |
| Agent tries npm/Vite/host-repo workflows | `sandboxAgentsContext` (+ sealed Pi `cwd` / resource loader; see ARCHITECTURE) |
| Scores don’t match what you care about | `evalDesignSystem`, `evalStrategySystem`, `evalImplementationSystem` |
| Need to **reset all** prompt bodies from repo/SQLite | `pnpm langfuse:sync-prompts` (overwrites labeled versions); routine `pnpm db:seed` does **not** |

---

## Observability vs Langfuse

**In-app Observability** (LLM + Run trace tabs) reads **`/api/logs`** on your API: local rings and optional NDJSON. The **Run trace** list is not the same as Langfuse’s nested trace graph.

**Langfuse** (cloud or self-hosted) receives **OpenTelemetry spans and generation events** from the server when tracing keys are set. Use the Observability **Langfuse** tab to jump to the project UI for deep inspection. Details: [USER_GUIDE.md](USER_GUIDE.md) (Observability), [ARCHITECTURE.md](ARCHITECTURE.md) (`/api/logs`, observability sink).

---

## See also

- [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) — where prompts sit in the canvas and agent loop
- [USER_GUIDE.md](USER_GUIDE.md) — Prompt Studio and workflow
- [docker/langfuse/README.md](docker/langfuse/README.md) — optional self-hosted Langfuse
