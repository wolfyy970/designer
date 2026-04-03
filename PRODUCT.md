# Product — What Exists Today

**Status:** Canvas interface complete. Single-shot and agentic generation operational with post-build evaluation, bounded revision rounds, and optional headless browser QA. Vision support implemented. Versioned skills in DB feed the agentic builder when selected by context.

## Canvas Interface (`/canvas` — default route)

A visual node-graph workspace built on @xyflow/react v12. Nodes connect left-to-right representing the design exploration pipeline.

### Node Types

| Node | Type | Purpose |
|------|------|---------|
| Design Brief | Input | Primary directive for the design exploration |
| Existing Design | Input | What exists today — text + reference images (drag-and-drop) |
| Research Context | Input | User research, behavioral insights |
| Objectives & Metrics | Input | Success criteria and evaluation measures |
| Design Constraints | Input | Non-negotiable boundaries + exploration ranges |
| Model | Processing | Centralizes provider + model selection. Connect to Compiler, Hypothesis, or Design System nodes to configure which LLM they use. |
| Design System | Processing | Self-contained design token definitions. Supports multiple instances (e.g., Material Design vs custom tokens). Content stored in node data, not spec store. Optional vision-based extraction from uploaded images. |
| Incubator | Processing | Compiles connected inputs → hypothesis strategies via LLM |
| Hypothesis | Processing | Editable strategy card with built-in generation controls. Mode **Direct** (one forward generation) vs **Agentic** (tool loop + evaluation). Connect a Model node, then **Generate** or **Run agent**. |
| Variant | Output | Rendered design preview. Single-file results show an HTML iframe. Multi-file (agentic) results show a file explorer + preview/code tabs + zip download. Completed agentic runs show an **evaluation scorecard** (aggregate score, prioritized fixes, runtime QA) and, when available, a **headless browser thumbnail**. Version navigation across all results. |
| Critique | Processing | Structured feedback (strengths, improvements, direction) for iteration |

### Canvas Features

- **Auto-layout** — Edge-driven Sugiyama-style layout. Toggleable checkbox in header. Positions all nodes based on connections, prevents overlap, centers layers vertically.
- **Auto-connect** — Adding a node auto-connects structural edges (sections→incubator, design systems→hypotheses). Model connections are scoped: when hypotheses are generated from an Incubator, they inherit that Incubator's model — not every model on the canvas.
- **Context menu** — Right-click canvas to add nodes at click position
- **Node palette** — Grouped picker (input/processing/output) in toolbar
- **Lineage highlighting** — Select a node to highlight its full connected component (siblings, ancestors, descendants). Unconnected nodes dim to 40% opacity.
- **Edge animations** — Custom DataFlowEdge with status indicators (idle/processing/complete/error)
- **Full-screen preview** — Expand any variant to full-screen overlay: primary arrows step **other variant nodes on the same hypothesis** (domain `variantSlots`; falls back to canvas-wide if no slot). Inner control steps **version stack** (v1, v2, …) for that variant strategy. **Mark as best** / **Clear best pick** lets the user override evaluator-ranked “best” for that lane (persisted in `generation-store`).
- **Reset canvas** — Reset button in header clears all nodes and re-initializes with the default template (Design Brief + Model + Incubator)
- **Stop generation** — Aborts the active SSE / agent session for a hypothesis strategy lane (hypothesis controls or variant run workspace).
- **Permanent node delete** — Backspace/Delete with confirmation removes selected nodes from the canvas graph and keeps domain/compiler state consistent; not an “undo” stack.
- **Screenshot capture** — Connect a variant to Existing Design to automatically capture a screenshot as a reference image for the next iteration
- **Version stacking** — Results accumulate across generation runs. Each variant shows version badges (v1, v2, ...) with ChevronLeft/Right navigation to browse previous versions.
- **Agentic eval rounds (workspace)** — When a run has multiple evaluation rounds (build + revisions), the **variant run workspace** (side panel) can show **Eval round** on **Design** and **Evaluation** tabs; per-round file trees are stored in IndexedDB (`{resultId}:round:{n}`) so earlier revisions remain viewable without bloating localStorage metadata.
- **Observability (dev)** — Header modal listing **LLM** calls and **trace** events from the API session; optional NDJSON on disk when enabled (see [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Prompt Studio** — Settings → Prompts: edit DB-backed system prompts; **Save** / ⌘S commits a new **version** (no automatic save).

### Iteration Loop

Variants can connect back to Existing Design (or to a Critique node, then to Incubator). This creates a feedback loop:
1. Generate variants
2. Connect best variant → Existing Design (captures screenshot) or add Critique
3. Re-incubate with the new context
4. Generate improved variants

## Generation Engine

Each hypothesis-model pair produces a variant via one of two modes. Server routes, SSE events, and store boundaries are summarized in [ARCHITECTURE.md](ARCHITECTURE.md); this section is the product-facing behavior.

### Single-Shot Mode

The server sends the compiled variant prompt (hypothesis + spec context) to the LLM with the `genSystemHtml` system prompt, in one call. The response is extracted as a complete, self-contained HTML document with inline CSS and JS. Code streams back via SSE and renders immediately.

**Parallel generation.** Multiple hypotheses generate simultaneously. Progress and completion update independently per variant.

### Agentic Mode

Enabled by choosing **Agentic** in Mode on a Hypothesis node; use **Run agent** to start it. Powered by `@mariozechner/pi-coding-agent` with a **`just-bash`** in-memory project shell.

**Server pipeline (not a single LLM call):**
1. **Build** — PI multi-turn tool loop produces the file tree (streaming events: plan, files, activity, todos).
2. **Evaluate** — Four workers run: **design**, **strategy**, and **implementation** rubrics (structured JSON from the LLM) plus **browser QA**. Browser QA starts with a fast **VM/preflight** pass on bundled HTML (structure, assets, inline script checks). When Playwright browsers are installed, a **headless Chromium** pass adds real render signals (console/page errors, layout/text heuristics) and may attach a **viewport screenshot** that appears on the variant scorecard. If Chromium is unavailable, the merge keeps preflight only and records a note — setup gaps do not hard-fail the whole evaluation.
3. **Revise** — If the merged scores trip the revision gate, the server can run additional PI sessions seeded with the current files and an evaluation brief, until satisfied or until **max revision rounds** (server default / env / API). Provenance stores **checkpoint** metadata (e.g. stop reason, revision attempt count).

**Tools:** Pi-native **`read`**, **`write`**, **`edit`** (search/replace), **`ls`**, **`find`**, **`grep`** against the **virtual** project tree (not the host disk); plus **`bash`** for shell utilities; **`todo_write`**, **`validate_js`**, **`validate_html`**.

**Typical flow:** plan milestones → create or edit files with `write` / `edit` → validate → optional bash for edge cases. Live **`file`** events update the variant preview as design artifacts change.

**Skills.** Agent Skills–style packages live as plain files under repo-root **`skills/`** (for a future Pi mount). They are **not** injected into the agentic sandbox or system prompt yet.

**Files are bundled for preview.** `bundleVirtualFS()` inlines linked CSS and JS into a single HTML document for sandboxed iframe rendering. The original files remain separately accessible in the code tab.

**Multi-file output.** Agentic variants show a file explorer sidebar, Preview/Code tab bar, and a download button that produces a `.zip` file.

**Context compaction.** For long agent runs (turn count threshold), the context is compacted: the first message (full hypothesis/spec context), a fresh **LLM summary** of the middle turns, and the most recent turns are kept, with file paths and todos surfaced in the summary so work is not lost.

**Thinking** (Hypothesis node). When the connected model advertises reasoning support: **None / Light / Deep** map to API levels *off* / *minimal* / *medium*. Other levels exist in the stack but are not exposed in this UI.

**Prompts.** Compile, variant, single-shot and agentic system prompts, evaluators, design-system extract, and agent compaction templates are stored in **Langfuse** and edited in **Prompt Studio** (**Settings → Prompts**); save commits a new version. Stable key names and plain-English descriptions: **[LANGFUSE_PROMPTS.md](LANGFUSE_PROMPTS.md)**. Loop limits (e.g. max revision rounds) are server-configured unless overridden via API/env — there is no dedicated canvas control yet.

## Prompt Studio (Langfuse)

Do not duplicate the prompt catalog here — use **[LANGFUSE_PROMPTS.md](LANGFUSE_PROMPTS.md)** for the list of keys and when each runs.

## Providers

| Provider | Compilation | Generation | Vision |
|----------|-------------|------------|--------|
| OpenRouter | Yes | Yes | Auto-detected from model metadata |
| LM Studio | Yes | Yes | Configurable via `VITE_LMSTUDIO_VISION_MODELS` env var |

- Both stages (compilation and generation) support independent provider + model selection via connected Model nodes
- Models fetched dynamically via each provider's API
- Vision-capable models show an eye icon in the model selector
- When vision is available, reference images are sent as multimodal content alongside text
- LM Studio runs sequentially (returns 500 on concurrent requests); OpenRouter runs in parallel

## Persistence

- Store metadata auto-saves via Zustand `persist` middleware (localStorage)
- Generated code and provenance snapshots stored in IndexedDB (avoids localStorage size limits)
- Agentic multi-file results stored in a separate IndexedDB object store (`files`)
- In-memory fields (`liveCode`, `liveFiles`, `liveFilesPlan`) are stripped from localStorage persistence
- Canvas Manager: save, load, duplicate, delete, export/import JSON
- Canvas state persists across sessions (nodes, edges, viewport, layout preferences)
- Automatic garbage collection removes orphaned IndexedDB entries (code, provenance, and files stores) on app startup

## What's Not Built Yet

- Self-hosted inference (vLLM)
- Experimentation/deployment integration
- Spec version history
- Role-based collaboration
- Admin/canvas UI for skill upload and versioning (zip ingest, validation); skills are DB-backed but maintained out-of-band today
- End-user controls for agentic **max revision rounds** and optional **early-stop score** thresholds (server env and API already support overrides)
