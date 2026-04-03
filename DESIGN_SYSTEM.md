# Design system (SPA)

**Scope:** Browser UI colors and dense typography. **Source of truth for values:** `src/index.css` (`@theme` block and the short comment above it). This file describes **semantics and how to use tokens**; do not copy hex values here — change CSS once, grep the repo for drift.

**Stack:** Tailwind CSS v4 reads `@theme` custom properties as utilities (e.g. `bg-warning-subtle`, `text-file-html`).

---

## Principles

| Rule | Why |
|------|-----|
| **Accent is not severity** | Orange (`accent`) is brand, selection, primary emphasis. Evaluation severity uses **status** tokens so “medium” never reads as “brand”. |
| **One base per family** | Each `*-subtle` background is `color-mix(in srgb, var(--color-*) …)` from the same `--color-*` as the solid foreground. No orphaned RGBA triplets. |
| **No default Tailwind palette in product UI** | Utilities like `text-orange-400` bypass `@theme` and clash with intentional accent. Add or reuse a semantic token instead. |
| **Dense type uses scale tokens** | Prefer `text-pico` → `text-micro` over arbitrary `text-[Npx]` in canvas, variant-run, and evaluation surfaces. |

---

## Palette architecture (hue budget)

We keep **one neutral foundation** (zinc-like surfaces and foreground steps) and a **small chromatic set** tuned for dark UI. The goal is fewer competing hues and a clear brand story, not fewer semantic *names* (error / warning / success / info stay).

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
| **Accent** | `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--color-accent-glow` | `text-accent`, `bg-accent-subtle`, `ring-accent` | Brand, focus rings, primary controls, selection chrome |
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

## Maintenance

1. **New color** — Add `--color-*` under `@theme` in `src/index.css`; use `color-mix` for any subtle variant of that base.
2. **New dense size** — Add `--text-*` in `@theme` only if the scale truly needs another step; avoid one-off pixel classes in new code.
3. **Update this doc** when you introduce a new **semantic role** or change naming — not for every visual tweak.
