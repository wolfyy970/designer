# Product — What Exists Today

**Status:** Canvas interface complete. Single-shot and agentic generation operational. Vision support implemented.

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
| Hypothesis | Processing | Editable strategy card with built-in generation controls. Toggle between single-shot and agentic modes. Connect a Model node, then click Create or Think & Create. |
| Variant | Output | Rendered design preview. Single-file results show an HTML iframe. Multi-file (agentic) results show a file explorer + preview/code tabs + zip download. Version navigation across all results. |
| Critique | Processing | Structured feedback (strengths, improvements, direction) for iteration |

### Canvas Features

- **Auto-layout** — Edge-driven Sugiyama-style layout. Toggleable checkbox in header. Positions all nodes based on connections, prevents overlap, centers layers vertically.
- **Auto-connect** — Adding a node auto-connects structural edges (sections→incubator, design systems→hypotheses). Model connections are scoped: when hypotheses are generated from an Incubator, they inherit that Incubator's model — not every model on the canvas.
- **Context menu** — Right-click canvas to add nodes at click position
- **Node palette** — Grouped picker (input/processing/output) in toolbar
- **Lineage highlighting** — Select a node to highlight its full connected component (siblings, ancestors, descendants). Unconnected nodes dim to 40% opacity.
- **Edge animations** — Custom DataFlowEdge with status indicators (idle/processing/complete/error)
- **Full-screen preview** — Expand any variant to full-screen overlay with version navigation
- **Reset canvas** — Reset button in header clears all nodes and re-initializes with the default template (Design Brief + Model + Incubator)
- **Screenshot capture** — Connect a variant to Existing Design to automatically capture a screenshot as a reference image for the next iteration
- **Version stacking** — Results accumulate across generation runs. Each variant shows version badges (v1, v2, ...) with ChevronLeft/Right navigation to browse previous versions.

### Iteration Loop

Variants can connect back to Existing Design (or to a Critique node, then to Incubator). This creates a feedback loop:
1. Generate variants
2. Connect best variant → Existing Design (captures screenshot) or add Critique
3. Re-incubate with the new context
4. Generate improved variants

## Generation Engine

Each hypothesis-model pair produces a variant via one of two modes.

### Single-Shot Mode

The server sends the compiled variant prompt (hypothesis + spec context) to the LLM with the `genSystemHtml` system prompt, in one call. The response is extracted as a complete, self-contained HTML document with inline CSS and JS. Code streams back via SSE and renders immediately.

**Parallel generation.** Multiple hypotheses generate simultaneously. Progress and completion update independently per variant.

### Agentic Mode

Enabled by the **Agentic** toggle on a Hypothesis node. Powered by `@mariozechner/pi-agent-core`.

The agent runs a multi-turn tool-use loop with three tools:
- `plan_files` — Declares the file structure before writing (visible as a progress plan)
- `write_file` — Writes or overwrites files one at a time (live preview updates per file)
- `read_file` — Reads a file back for review before revising

**What the agent does:**
1. Reads the hypothesis and reasons out loud — this appears in the activity log
2. Calls `plan_files` to declare the file structure
3. Writes each file comprehensively (no length limit — a styles.css can be 500+ lines)
4. Self-critique pass: reads each file back, identifies weak points, revises with `write_file`

**Files are bundled for preview.** `bundleVirtualFS()` inlines linked CSS and JS into a single HTML document for sandboxed iframe rendering. The original files remain separately accessible in the code tab.

**Multi-file output.** Agentic variants show a file explorer sidebar, Preview/Code tab bar, and a download button that produces a `.zip` file.

**Context compaction.** For long agent runs (> 30 turns), the context is automatically compacted: the original hypothesis prompt and the 20 most recent turns are preserved; earlier turns are replaced with a summary listing which files have been written. This prevents context-limit failures on complex generations.

**Thinking levels.** When agentic mode is on, a thinking-level selector appears on the Hypothesis node: None / Light / Deep. Controls the model's extended reasoning budget.

**Prompt override.** The agentic system prompt (`genSystemHtmlAgentic`) is exposed in the Prompt Editor and can be overridden per-session.

## Prompt Editor

All LLM prompts are exposed to the user and editable at runtime via the Prompt Editor (accessible from the canvas header):

| Prompt | Purpose |
|--------|---------|
| Incubator — System | Role, output format, and guidelines for dimension map production |
| Incubator — User | Template for spec data (variables: `{{SPEC_TITLE}}`, etc.) |
| Designer — System | System prompt for single-shot HTML generation |
| Designer — System (Agentic) | System prompt for the agentic multi-file loop. Includes hypothesis reasoning framework, self-critique instructions, and tool mechanics. |
| Designer — User | User prompt template for variant generation (variables: `{{STRATEGY_NAME}}`, `{{DESIGN_BRIEF}}`, etc.) |
| Design System — Extract | Prompt for vision-based token extraction from screenshots |

Overrides persist in localStorage. All overrides are sent per-request to the server — the server is stateless.

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
