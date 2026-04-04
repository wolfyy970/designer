# Design system (SPA)

**Scope:** Browser UI colors and dense typography. **Source of truth for values:** `src/index.css` (`@theme` block and the short comment above it). This file describes **semantics and how to use tokens**; do not copy hex values here — change CSS once, grep the repo for drift.

**Stack:** Tailwind CSS v4 reads `@theme` custom properties as utilities (e.g. `bg-warning-subtle`, `text-file-html`). Body/UI sans-serif, monospace, and the canvas header wordmark are wired in `@theme` (see **Typefaces** below).

---

## Typefaces

| Role | `@theme` / utilities | Packages (`src/index.css` imports) |
|------|----------------------|-------------------------------------|
| **Body / UI** | `--font-sans` → default `font-sans` | `@fontsource-variable/space-grotesk` (primary); `@fontsource-variable/inter` remains loaded as fallback |
| **Code** | `--font-mono` | `@fontsource-variable/jetbrains-mono` |
| **Header wordmark** | `--font-logo` → `font-logo` (e.g. `CanvasHeader`) | `@fontsource/orbitron` weight **500** only |

Do not list font file names elsewhere — change imports and `--font-*` in `src/index.css` once; this table stays semantic.

---

## Principles

| Rule | Why |
|------|-----|
| **Accent is not severity** | Orange (`accent`) is brand, selection, primary emphasis. Evaluation severity uses **status** tokens so “medium” never reads as “brand”. |
| **One base per family** | Brand and status colors use a single base hue. `*-subtle` and `*-surface` backgrounds must map to pure Zinc elevations (`var(--color-surface-raised)`) or hand-tuned dark mode hexes to avoid muddy translucent washes. Translucent borders (`color-mix(in srgb, ...)`) stem from the same base. No orphaned RGBA triplets. |
| **No default Tailwind palette in product UI** | Utilities like `text-orange-400` bypass `@theme` and clash with intentional accent. Add or reuse a semantic token instead. |
| **No slash opacity or translucent washes for brand/status backgrounds** | Do not write `bg-accent/15`, `border-error/35`, `text-success/20`, etc. More importantly, **never use translucent brand or status colors for backgrounds in dark mode** (e.g. `color-mix(in srgb, var(--color-accent) 10%, transparent)`), as they physically read as muddy brown. Active/subtle states must use pure, elevated Zinc backgrounds (`surface-raised`) paired with crisp, high-opacity borders, hairlines, or text. Translucent mixes (`in srgb`) are acceptable *only* for borders or text, never for backgrounds. |
| **Dense type uses scale tokens** | Prefer `text-pico` → `text-micro` over arbitrary `text-[Npx]` in canvas, variant-run, and evaluation surfaces. |
| **Layout uses theme dimensions** | Repeat min-heights, modal max heights, and title widths belong in `@theme` (`--min-height-variant-node`, `--max-height-modal`, `--width-canvas-title`, …) — reference with `min-h-[var(--token)]`, not raw `px`/`vh` scattered in JSX. |
| **Chroma is earned** | Start from neutrals, then add **small doses** of status or accent so hierarchy is readable—without saturating borders, fills, or competing high-contrast heroes. |

---

## Emphasis and restraint (modals & dense UI)

**Goal:** *subtle* emphasis—enough to read hierarchy without loud fills or status-colored callout boxes. **Do not** tune `accent/NN` (or other opacity slashes) ad hoc in JSX; use the **`@theme` tokens** in [`src/index.css`](src/index.css) (`--color-accent-*`, `--color-surface-note`, status border tokens, layout `--width-*` / `--max-height-*`, …) or the **`ds-*` composition classes** in the same file’s `@layer components`.

**Informational callouts** (e.g. local-storage lines that include the word “WARNING”): **neutral chrome only**—prefer `.ds-callout-note` (uses `--color-surface-note` + `border-border` + `text-fg-secondary`). Do **not** tint with `warning-*` unless the situation is a true in-flow alert requiring action.

**List selection / “current” rows:** `.ds-list-row` + `.ds-list-row-current` — uses a clean `surface-raised` (Zinc) background with a crisp, 100% opacity 2px solid orange left-border (`border-l-accent`), entirely avoiding muddy background washes. Avoid stacking loud `text-accent` on the row title when a `.ds-chip-current` already marks state.

**Primary actions in a button group (vs ghost siblings):** Prefer `.ds-btn-primary-muted`: Zinc fill (`surface-raised`) + **inset 1px** solid `--color-accent` (hover `--color-accent-hover`). Reserve inverted `bg-fg text-bg` for rare single-hero cases.

**State chips:** Prefer `.ds-chip-current` (neutral label + **1px** solid `--color-accent` border, no tinted fill). Avoid loud `text-accent` on the chip when the row already carries selection chrome.

**Focus rings on inputs:** `.input-focus:focus` uses **solid** `--color-accent` on the field border and a matching **1px** outer ring—no washed translucent glow.

---

## Palette architecture (hue budget)

We keep **one neutral foundation** (**cool Zinc** surfaces—with no brown cast—and gray foreground steps) and a **small chromatic set** tuned for dark UI. The goal is fewer competing hues and a clear brand story, not fewer semantic *names* (error / warning / success / info stay).

| Axis | Tokens | Role |
|------|--------|------|
| **Neutrals** | `bg`, `surface*`, `border*`, `fg*` | Structure and typography; no hue noise. |
| **Warm** | `accent`, `accent-hover`, `warning` | Brand orange plus **analogous** amber for caution — warmth reads as one family. |
| **Cool** | `info`, `success` | **Complement** to orange: cyan-blue for info; **analogous** teal-green for success so it is not a second blue. |
| **Alert** | `error` | Rose/red kept distinct for convention and contrast vs success green. |

**Complement:** Orange (~24°) pairs with cyan-blue (~200–220°); `info` sits in that range so secondary emphasis and “low severity” feel structurally related to the brand, not arbitrary.

**File explorer icons:** `--color-file-html` … `--color-file-data` are **aliases** of `accent`, `info`, `warning`, and `success` — same hues as the rest of the product, no parallel palette.

---

## Color semantics

| Role | CSS variables (base) | Typical utilities | Use for |
|------|----------------------|-------------------|---------|
| **Accent** | `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--color-accent-glow` | `text-accent`, `bg-accent-subtle`, `ring-accent` | Brand, primary controls, selection chrome. **`bg-accent-subtle`** is an elevated **Zinc** fill (not an orange wash)—pair with solid accent borders/text for hierarchy. |
| **Accent / hairline & rings** | `--color-accent-focus-hairline`, `--color-accent-ring-muted*`, `--color-accent-edge-strong` | Utilities or ad hoc rails where a **translucent** accent edge is still needed (borders/progress—not backgrounds) | Prefer **solid** `--color-accent` in `.input-focus`, `.ds-btn-primary-muted`, `.ds-chip-current`, and `.ds-list-row-current` left edge; keep named mixes for non-fill cases only. |
| **Accent / strong mix** | `--color-accent-edge-strong` | `border-l-accent-edge-strong`, custom emphasis | Stronger mix from accent when a thicker border or rail is needed; **`.ds-list-row-current`** uses **solid** left border + `surface-raised` instead |
| **Surfaces / note** | `--color-surface-note` | `.ds-callout-note`, or `bg-surface-note` | Neutral modal callouts (replaces `bg-surface-raised/60` patterns) |
| **Error** | `--color-error`, `--color-error-subtle` | `text-error`, `bg-error-subtle` | Hard fails, high severity, destructive emphasis |
| **Warning** | `--color-warning`, `--color-warning-subtle` | `text-warning`, `bg-warning-subtle` | Medium severity, cautions |
| **Success** | `--color-success`, `--color-success-subtle` | `text-success`, `bg-success-subtle` | Pass, completion, positive state |
| **Info** | `--color-info`, `--color-info-subtle` | `text-info`, `bg-info-subtle` | Low / informational severity, neutral-positive emphasis |
| **Surfaces / fg** | `--color-bg`, `--color-surface*`, `--color-border*`, `--color-fg*` | `bg-surface`, `text-fg-muted`, `border-border` | Layout and readable text hierarchy |
| **File roles** | `--color-file-html`, … (alias `accent` / `info` / `warning` / `success`) | `text-file-html`, … | Explorer icon tints only — **no extra hues** beyond the axes above |

**Evaluation inline tags (no chroma):** In `EvalPrioritizedFixList.tsx`, severity chips (`[high]`, `[medium]`, `[low]`) and hard-fail code chips (`[hard_fail:…]`, e.g. `MISSING_SIDEBAR`) are **neutral only** — `bg-surface-raised`, `text-fg-secondary`, `ring-border-subtle`. Do **not** map them to `info` / `warning` / `error`; the uppercase label already carries meaning. **Extremely sparing color:** reserve `error` / `warning` / `info` / `success` for deliberate product-level emphasis (e.g. destructive buttons, node status), not dense eval enumerations.

**Evaluation scorecard summary line:** The compact “N design/strategy fail(s)” count under the eval header uses **foreground secondary** (`text-fg-secondary`), not `text-error`, for the same reason.

**Elsewhere (browser QA, etc.):** Section headers or one-line outcomes may still use status tints when a single glance needs pass/fail — keep that rare and avoid duplicating hue on both a header and every row tag.

**Version badges:** `badgeColor()` in `src/lib/badge-colors.ts` is **always accent** (`bg-accent-subtle` / `text-accent`) for v1, v2, … — no per-run hue rotation; not eval severity.

---

## Typography scale

| Token | Utility | When |
|-------|---------|------|
| `--text-pico` | `text-pico` | 8px — very dense labels (use sparingly) |
| `--text-badge` | `text-badge` | 9px — chips, uppercase section labels |
| `--text-nano` | `text-nano` | 10px — secondary lines in tight panels |
| `--text-micro` | `text-micro` | 11px — slightly larger dense UI |

Larger copy uses component classes in the same file (`h1`–`h4`, `body-text`, `caption`, `label`) or standard Tailwind sizes where appropriate.

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — System layout, stores, API; links here for UI tokens.
- [DOCUMENTATION.md](DOCUMENTATION.md) — How documentation is organized (this file is in the README hub).

---

## Developer kitchen sink

**In-app (all builds):** **Settings** (gear in the canvas header) → **General** → **Open design tokens kitchen sink…** opens a large, scrollable modal with the same reference content.

**Full page (development only):** run the app and open **`/dev/design-tokens`** for the standalone route. It is omitted from production builds.

Both show `@theme` color swatches (including **`--color-success`** / `bg-success`), dense type scale, `ds-*` compositions, and `.input-focus`. Use them to catch token drift and confirm new product chrome uses utilities from [`src/index.css`](src/index.css), not one-off hex or default Tailwind palette classes.

---

## Maintenance

1. **New color** — Add `--color-*` under `@theme` in `src/index.css`. For **fills**, prefer Zinc elevations or hand-tuned dark hexes; use `color-mix(in srgb, …)` only for **borders/text**, never muddy translucent brand/status backgrounds (see principles table).
2. **New dense size** — Add `--text-*` in `@theme` only if the scale truly needs another step; avoid one-off pixel classes in new code.
3. **Accent emphasis** — Tune `--color-accent-*` mix percentages where those tokens are still used for rails/progress; composition classes (`.ds-btn-primary-muted`, lists, focus) use **solid** accent. Avoid new `accent/NN` opacity utilities in shared UI.
4. **Update this doc** when you introduce a new **semantic role** or change naming — not for every visual tweak.
