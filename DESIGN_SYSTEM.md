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

## Color semantics

| Role | CSS variables (base) | Typical utilities | Use for |
|------|----------------------|-------------------|---------|
| **Accent** | `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--color-accent-glow` | `text-accent`, `bg-accent-subtle`, `ring-accent` | Brand, focus rings, primary controls, selection chrome |
| **Error** | `--color-error`, `--color-error-subtle` | `text-error`, `bg-error-subtle` | Hard fails, high severity, destructive emphasis |
| **Warning** | `--color-warning`, `--color-warning-subtle` | `text-warning`, `bg-warning-subtle` | Medium severity, cautions |
| **Success** | `--color-success`, `--color-success-subtle` | `text-success`, `bg-success-subtle` | Pass, completion, positive state |
| **Info** | `--color-info`, `--color-info-subtle` | `text-info`, `bg-info-subtle` | Low / informational severity, neutral-positive emphasis |
| **Surfaces / fg** | `--color-bg`, `--color-surface*`, `--color-border*`, `--color-fg*` | `bg-surface`, `text-fg-muted`, `border-border` | Layout and readable text hierarchy |
| **File roles** | `--color-file-html`, `--color-file-css`, `--color-file-script`, `--color-file-data` | `text-file-html`, … | Virtual file explorer icons / syntax tint only — not brand |

**Evaluation severity mapping (UI):** high / hard_fail → error; medium → warning; low → info (filled `bg-*-subtle` + matching `text-*`, compact badge type — see `EvalPrioritizedFixList.tsx`).

**Version badges:** Colors in `src/lib/badge-colors.ts` are **decorative rotation** (v1, v2, …), not eval severity.

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
