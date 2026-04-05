# Product

## North Star

Auto Designer exists to **replace the UX designer**, not assist one.

Given a problem statement and appropriate research, a brilliant designer synthesizes everything — user needs, competitive landscape, behavioral patterns, business constraints — and produces groundbreaking hypotheses that break conventions with something genuinely better. Then they execute those hypotheses into designs where every affordance is clear, every interaction is intuitive, time on task drops, and users never have to think. *Don't Make Me Think*, Nielsen Norman heuristics, information architecture, visual hierarchy — the entire discipline, applied at an expert level.

That is what this application must do autonomously. The ambition is not parity with existing design; it is to **surpass** it. Every feature, every prompt, every evaluation rubric, and every architectural decision exists to deliver against that standard. If a capability does not move the system closer to producing work a brilliant designer would be proud of, it does not belong here.

**Concretely, the pipeline has two jobs:**

1. **Hypothesis generation** — From a design brief (plus research, objectives, and constraints), produce strategies that are genuinely differentiated: not reshuffled templates, not minor variations, but fundamentally different bets about what will work best for the stated audience and problem. The bar is creative and strategic, not just technically valid.

2. **Design execution** — Turn each hypothesis into a rendered, usable artifact that implements the strategy with craft, clarity, and conviction. Typography, spacing, motion, content, interaction — all working together to embody the hypothesis so clearly that the design *is* the argument for why this approach works.

Every subsystem — the incubator, the agentic builder, the evaluator, the revision loop, the skills, the prompts — is measured against these two jobs. Ship work that a senior designer would look at and think: *I wish I'd done that.*

---

## What Exists Today

**Status:** Canvas interface complete. Single-shot and agentic generation operational with post-build evaluation, bounded revision rounds, and optional headless browser QA. Vision support implemented. Repo **Agent Skills** under **`skills/`** are discovered per Pi session, pre-seeded into the virtual workspace (all non-`manual`), and surfaced in the preview run UI; the model reads relevant skills on demand.

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
| Preview | Output | Rendered design preview. Single-file results show an HTML iframe. Multi-file (agentic) results show a file explorer + preview/code tabs + zip download. Completed agentic runs show an **evaluation scorecard** (aggregate score, prioritized fixes, runtime QA) and, when available, a **headless browser thumbnail**. Version navigation across all results. |

### Canvas Features

- **Desktop viewport gate** — Viewports under **1024px** width show a full-screen fallback (design-system styled) explaining the canvas workspace requires a larger display.
- **Auto-layout** — Edge-driven Sugiyama-style layout. Toggleable checkbox in header. Positions all nodes based on connections, prevents overlap, centers layers vertically.
- **Auto-connect** — Adding a node auto-connects structural edges (sections→incubator, design systems→hypotheses). Model connections are scoped: when hypotheses are generated from an Incubator, they inherit that Incubator's model — not every model on the canvas.
- **Context menu** — Right-click canvas to add nodes at click position
- **Node palette** — Grouped picker (input/processing/output) in toolbar
- **Lineage highlighting** — Select a node to highlight its full connected component (siblings, ancestors, descendants). Unconnected nodes dim to 40% opacity.
- **Edge animations** — Custom DataFlowEdge with status indicators (idle/processing/complete/error)
- **Full-screen preview** — Expand any preview to full-screen overlay: primary arrows step **other preview nodes on the same hypothesis** (domain `previewSlots`; falls back to canvas-wide if no slot). Inner control steps **version stack** (v1, v2, …) for that hypothesis strategy. **Mark as best** / **Clear best pick** lets the user override evaluator-ranked “best” for that lane (persisted in `generation-store`).
- **Reset canvas** — Reset button in header clears all nodes and re-initializes with the default template (Design Brief + Model + Incubator)
- **Stop generation** — Aborts the active SSE / agent session for a hypothesis strategy lane (hypothesis controls or preview run workspace).
- **Permanent node delete** — Backspace/Delete with confirmation removes selected nodes from the canvas graph and keeps domain/compiler state consistent; not an “undo” stack.
- **Screenshot capture** — Connect a preview to Existing Design to automatically capture a screenshot as a reference image for the next iteration
- **Version stacking** — Results accumulate across generation runs. Each preview shows version badges (v1, v2, ...) with ChevronLeft/Right navigation to browse previous versions.
- **Agentic eval rounds (workspace)** — When a run has multiple evaluation rounds (build + revisions), the **preview run workspace** (side panel) can show **Eval round** on **Design** and **Evaluation** tabs; per-round file trees are stored in IndexedDB (`{resultId}:round:{n}`) so earlier revisions remain viewable without bloating localStorage metadata.
- **Observability (dev)** — Header modal listing **LLM** calls and **trace** events from the API session; optional NDJSON on disk when enabled (see [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Prompt Studio** — Settings → Prompts: edit prompts against the **server baseline**; **Save** / ⌘S persists drafts **in the browser** and sends **`promptOverrides`** on compile / generate / extract / **section auto-generate** (no automatic save; does not create Langfuse versions from the UI).
- **Section auto-generate** — On **Research Context**, **Objectives & Metrics**, and **Design Constraints**, optional **LLM-assisted drafting** from the Design Brief (and cross-section context) via **`POST /api/section/generate`**, using credentials from the **first Model** node when lockdown is off.
- **Optional section slots** — Fresh canvases can show **ghost** placeholders for inputs not in the minimal default. Loading a **Canvas Manager** entry **materializes** optional section nodes when the persisted spec has non-empty text or images for those sections (see `src/lib/spec-materialize-sections.ts`).
- **Design tokens kitchen sink** (development only) — Settings → General opens a modal reference for `@theme` tokens and patterns; full-page route `/dev/design-tokens`. Documented in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

### Iteration Loop

Previews can connect to **Existing Design** (screenshot reference) or **Incubator** (prior output as reference code). This creates a feedback loop:
1. Generate designs
2. Connect a strong preview → Existing Design and/or wire a preview → Incubator
3. Re-incubate with the new context
4. Generate improved designs

Structured critique during agentic runs comes from the **evaluator** (scorecard, fix list, revision rounds), not a separate canvas node.

## Generation Engine

Each hypothesis-model pair produces a design via one of two modes. Server routes, SSE events, and store boundaries are summarized in [ARCHITECTURE.md](ARCHITECTURE.md); this section is the product-facing behavior.

### Single-Shot Mode

The server sends the compiled hypothesis prompt (hypothesis + spec context) to the LLM with the `designer-direct-system` system prompt, in one call. The response is extracted as a complete, self-contained HTML document with inline CSS and JS. Code streams back via SSE and renders immediately.

**Parallel generation.** Multiple hypotheses generate simultaneously. Progress and completion update independently per preview.

### Agentic Mode

Enabled by choosing **Agentic** in Mode on a Hypothesis node; use **Run agent** to start it. Powered by `@mariozechner/pi-coding-agent` with a **`just-bash`** in-memory project shell.

**Server pipeline (not a single LLM call):**
1. **Build** — PI multi-turn tool loop produces the file tree (streaming events: plan, files, activity, todos).
2. **Evaluate** — Four workers run: **design**, **strategy**, and **implementation** rubrics (structured JSON from the LLM) plus **browser QA**. The eval harness registers the same **virtual file tree** the agent wrote and passes a **`preview_page_url`** into LLM evaluators; Playwright **`goto`** that URL for a real render when enabled. Browser **preflight** still uses a **bundled** HTML view for fast VM checks (structure, assets, inline scripts) and scans **all `.html` files** for broken relative references. When Playwright browsers are installed, **headless Chromium** adds console/page errors, layout/text heuristics, and may attach a **viewport screenshot** on the scorecard. If Chromium is unavailable, the merge keeps preflight only and records a note — setup gaps do not hard-fail the whole evaluation.
3. **Revise** — If the merged scores trip the revision gate, the server can run additional PI sessions seeded with the current files and an evaluation brief, until satisfied or until **max revision rounds** (server default / env / API). Provenance stores **checkpoint** metadata (e.g. stop reason, revision attempt count).

**Tools:** Pi-native **`read`**, **`write`**, **`edit`** (search/replace), **`ls`**, **`find`**, **`grep`** against the **virtual** project tree (not the host disk); plus **`bash`** for shell utilities; **`todo_write`**, **`validate_js`**, **`validate_html`**.

**Typical flow:** plan milestones → create or edit files with `write` / `edit` → validate → optional bash for edge cases. Live **`file`** events update the preview as design artifacts change.

**Skills.** Agent Skills live under **`skills/<key>/SKILL.md`** (YAML frontmatter: `name`, `description`, `tags`, `when`: `auto` | `always` | `manual`). On each agentic **build** and **revision** round, the server walks the directory, puts the **`<available_skills>`** list in the Pi **`use_skill`** tool description (paths + descriptions for non-**`manual`** entries), and **pre-seeds** those packages into **`skills/<key>/…`** in the virtual workspace. The agent should call **`use_skill`** (or **`read`** on `SKILL.md`) when relevant. Streamed **`skills_loaded`** lists the catalog; **`skill_activated`** fires when **`use_skill`** succeeds. Optional reference files in the package copy with the skill (see server limits).

**Preview uses the real file tree.** The UI **POSTs** the current map to **`/api/preview/sessions`** (debounced while files stream) and loads the canonical HTML entry in an iframe via **`src`** (relative links and multi-page navigation work). If registration fails, **`bundleVirtualFS()`** falls back to a single **`srcDoc`**. Original paths stay available in the code tab and zip export.

**Live evaluation status.** While the server runs rubric workers, SSE **`evaluation_worker_done`** updates the preview run workspace **Evaluation** tab (and tab affordance) with per-worker progress before the merged report.

**Headless eval URL** — Set **`PREVIEW_PUBLIC_URL`** if the API isn’t reachable at `http://127.0.0.1:$PORT` from the Playwright process (defaults assume same machine).

**Multi-file output.** Agentic previews show a file explorer sidebar, Preview/Code tab bar, and a download button that produces a `.zip` file.

**Context compaction.** For long agent runs (turn count threshold), the context is compacted: the first message (full hypothesis/spec context), a fresh **LLM summary** of the middle turns, and the most recent turns are kept, with file paths and todos surfaced in the summary so work is not lost.

**Thinking** (Hypothesis node). When the connected model advertises reasoning support: **None / Light / Deep** map to API levels *off* / *minimal* / *medium*. Other levels exist in the stack but are not exposed in this UI.

**Prompts.** **Production** text for compile, hypothesis, single-shot, agentic, evaluators, design-system extract, and agent compaction templates lives in **Langfuse** (or shared defaults when Langfuse is off). **Prompt Studio** (**Settings → Prompts**) edits against that baseline but **saves local browser drafts** only, applied per request via **`promptOverrides`** — see **[LANGFUSE_PROMPTS.md](LANGFUSE_PROMPTS.md)** for keys and **[USER_GUIDE.md](USER_GUIDE.md)** for workflow. Loop limits (e.g. max revision rounds) are server-configured unless overridden via API/env — there is no dedicated canvas control yet.

## Prompt keys (catalog)

Do not duplicate the prompt catalog here — use **[LANGFUSE_PROMPTS.md](LANGFUSE_PROMPTS.md)** for the list of keys and when each runs.

## Providers

| Provider | Compilation | Generation | Vision |
|----------|-------------|------------|--------|
| OpenRouter | Yes | Yes | Auto-detected from model metadata |
| LM Studio | Yes | Yes | Configurable via `VITE_LMSTUDIO_VISION_MODELS` env var |

- Both stages (compilation and generation) support independent provider + model selection via connected Model nodes **when server lockdown is off** (`LOCKDOWN=false` or equivalent). Default / locked deployments pin **OpenRouter + MiniMax M2.5** for all LLM calls and disable changing provider/model in the UI.
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
- Admin/canvas UI for authoring **manual** skills or attaching packages without editing the repo
- End-user controls for agentic **max revision rounds** and optional **early-stop score** thresholds (server env and API already support overrides)
