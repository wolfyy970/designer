# User Guide

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Add your API key to `.env.local`:
```
OPENROUTER_API_KEY=sk-or-...
```

This key stays server-side (Vite proxy). Alternatively, enter an OpenRouter key via the Settings panel (gear icon in header) — keys entered there are stored in localStorage.

For LM Studio vision models, optionally set:
```
VITE_LMSTUDIO_VISION_MODELS=llava,minicpm-v,qwen2-vl
```

```bash
pnpm dev          # Vite SPA (port 5173)
pnpm dev:server   # Hono API (port 3001)
```

Both processes are needed for local development.

## Canvas Workflow

The canvas (`/canvas`) is the default interface. Nodes connect left-to-right.

### 1. Fill in Input Nodes

The canvas starts with a **Design Brief**, a **Model**, and an **Incubator** — all pre-connected. Add more input nodes from the toolbar:

- **Design Brief** — The primary directive. What are you designing and why?
- **Existing Design** — Describe what exists today. Drag-and-drop screenshots as reference images.
- **Research Context** — User research, behavioral insights, qualitative findings.
- **Objectives & Metrics** — Success criteria, KPIs, evaluation measures.
- **Design Constraints** — Non-negotiable boundaries + exploration ranges.

Write in prose, not bullets. Precision is the product.

### 2. Connect a Model Node

Add a **Model** node (Processing group) and connect it to the Incubator. Select your provider and model in the Model node. You can use different Model nodes for compilation vs generation — e.g., a powerful reasoning model for the Incubator and a faster one for generation.

### 3. Incubate (Compile)

Connect input nodes to the **Incubator** (edges auto-connect on add). With a Model node connected, click **Generate**. The Incubator sends your connected inputs to the LLM and produces hypothesis strategies.

### 4. Edit Hypotheses

Hypothesis nodes appear to the right of the Incubator. Each represents a variant strategy with:
- **Name** — Editable label (double-click or pencil icon)
- **Hypothesis** — The core design bet
- **Details** (expandable) — Rationale, measurements

Edit these before generation. Remove strategies not worth exploring.

### 5. Add Design System (Optional)

Add a **Design System** node from the toolbar (Processing group). It auto-connects to all existing hypotheses. You can have multiple design system nodes — e.g., one for Material Design tokens, another for a custom system.

- Type or paste design tokens directly into the content area
- Drag-and-drop screenshots of existing design systems, then click **Extract from Images** to have an LLM read the tokens from the images

### 6. Generate Variants

Each hypothesis has built-in generation controls at the bottom. Connect a Model node, then choose your mode:

**Single-shot (default):** Click **Create**. The server makes one LLM call and returns a complete self-contained HTML document. Fast — typically 10–30 seconds.

**Agentic:** Toggle **Agentic** on the hypothesis node, choose a thinking level (None / Light / Deep), then click **Think & Create**. The agent:
1. Reasons out loud about the hypothesis before touching any tool
2. Plans the file structure (`plan_files`)
3. Writes each file comprehensively — CSS can be 500+ lines
4. Reads files back and revises (self-critique pass)

Agentic runs take longer (1–5 minutes) but produce more considered designs. The file explorer sidebar and progress bar show what the agent is doing in real time.

Running generation again adds new versions — use the version navigation arrows to browse previous results.

### 7. Review Variants

Variant nodes render the generated code in sandboxed iframes.

**Single-file results:**
- **Zoom** — +/- buttons or auto-fit
- **Source** — Toggle Preview/Source to see the raw HTML
- **Full-screen** — Click the expand icon for full-viewport preview

**Multi-file (agentic) results:**
- **Preview tab** — Bundled preview (CSS and JS inlined into the HTML)
- **Code tab** — File explorer on the left, raw file content on the right
- **Download** — Zip button downloads all files as a `.zip` archive
- **Full-screen** — Same as single-file

**Version badges** — v1, v2, etc. with ChevronLeft/Right to browse accumulated versions across runs.

### 8. Iterate

To iterate on results:
- **Screenshot feedback** — Drag a connection from a variant's right handle to the Existing Design node. This captures a screenshot and adds it as a reference image.
- **Critique** — Add a Critique node, connect a variant to it, write structured feedback (strengths, improvements, direction), then connect the critique to a new Incubator.
- **Re-incubate** — The Incubator reads reference designs and critiques from its connected inputs, producing improved hypotheses.

### Auto-Layout

Toggle the **Auto Layout** checkbox in the header. When on:
- All nodes are positioned automatically based on their connections
- Nodes are not draggable (prevents accidental misalignment)
- Layout updates after compilation, generation, adding/removing nodes, or new connections

When off, drag nodes freely.

## Managing Canvases

Click **Canvas Manager** in the header:

- **Save Current** — Snapshot the active canvas to localStorage
- **New Canvas** — Saves the current canvas, creates a blank canvas
- **Duplicate** — Creates a copy for iteration
- **Export JSON** — Downloads the canvas as a `.json` file
- **Import JSON** — Loads a previously exported canvas
- **Load** — Switch to a saved canvas
- **Delete** — Remove a saved canvas from localStorage
