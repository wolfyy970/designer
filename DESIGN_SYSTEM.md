# Design system (SPA)

**Scope:** Browser UI colors and dense typography. **Source of truth for values:** `src/index.css` (`@theme` block + the `html[data-theme="dark"]` block immediately after). This file describes **semantics and how to use tokens**; do not copy hex values here — change CSS once, grep the repo for drift.

**Stack:** Tailwind CSS v4 reads `@theme` custom properties as utilities (e.g. `bg-warning-subtle`, `text-file-html`, `font-display`). Body/UI sans, display serif, and monospace are wired in `@theme` (see **Typefaces**).

**Canonical visual reference:** [`AutoDesigner Indigo Reference.html`](AutoDesigner%20Indigo%20Reference.html) — pixel-accurate spec for every atom/molecule/organism in both themes. Open side-by-side when building or reviewing canvas chrome.

---

## Typefaces — Indigo triad

| Role | `@theme` token / utility | Family | Used for |
|------|-------------------------|--------|----------|
| **Body / UI** | `--font-sans` → default `font-sans` | **Inter Tight Variable** (latin subset in `src/fonts/latin-subsets.css`) | Node body text, inputs, buttons, labels — everything that isn't a title or numeric |
| **Display** | `--font-display` → `font-display` | **Fraunces Variable** (same subsets file) | Canvas title in the header (italic), `h1.page-title`-style emphasis. **Not** used on node `<h3>` titles — those stay sans per the reference |
| **Wordmark / logo** | `--font-logo` → `font-logo` | **Fraunces Variable** | AutoDesigner wordmark in `CanvasHeader` |
| **Code / numerics** | `--font-mono` | **JetBrains Mono Variable** (same subsets file) | Chips, badges, per-dimension scorecard numerics, file paths, code blocks |

The three-voice triad (serif display + tight sans body + mono numerics) is the system. **Never introduce a fourth family.** Do not list font file names elsewhere — change imports and `--font-*` in `src/index.css` + the `@font-face` declarations in `src/fonts/latin-subsets.css` once; this table stays semantic.

---

## Themes — light default, dark via `data-theme`

| Mode | Trigger | Canvas | Applied by |
|------|---------|--------|------------|
| **Light** (default) | `html` has no `data-theme` attr or `data-theme="light"` | Warm bone (`--color-bg: #f4efe6`), near-black ink (`--color-fg`), indigo brand | `useThemeEffect` (reads `localStorage.theme`, default `'light'`) |
| **Dark** | `html[data-theme="dark"]` | Cool near-black surfaces, brighter indigo/sage/amber tuned for dark | Same hook, token overrides live inside `html[data-theme="dark"] { … }` below `@theme` in `src/index.css` |

`useThemeEffect` (`src/hooks/useThemeEffect.ts`) is tested (`__tests__/useThemeEffect.test.tsx`). Preview iframes stay on pure white in both modes — user-generated HTML must render on neutral paper regardless of canvas theme.

---

## Principles

| Rule | Why |
|------|-----|
| **Accent is brand + primary action — nothing else.** | Indigo (`--color-accent: #3a5a7d`) fills the three primary CTAs (Design / Generate / Extract), the selection ring, the focus ring, and the queued-hypothesis border. Never status, never chrome panels, never a secondary button. |
| **Sage + amber do real work.** | `--color-success` (sage) = filled / OK / passing score. `--color-warning` (amber) = empty / needs input / below-threshold score. Used on handles, left-rails, chips, and scorecard bars so state reads at a glance. |
| **Info is rationed.** | `--color-info` (pacific) only on file-css badges and the capture-screenshot indicator. Don't let it creep into general UI. |
| **One hue per role.** | `*-subtle` / `*-surface` / `*-border-*` derive from the same base via `color-mix(in srgb, …)`. No orphaned RGBA triplets; no invented hues. |
| **No default Tailwind palette in product UI.** | Utilities like `text-indigo-500` or `bg-gray-100` bypass `@theme`. Add or reuse a semantic token. |
| **Dense type uses scale tokens.** | Prefer `text-pico` → `text-micro` over arbitrary `text-[Npx]`. |
| **Layout uses theme dimensions.** | Repeat min-heights and widths belong in `@theme` (`--min-height-variant-node`, `--max-height-modal`, `--width-canvas-title`, …) — reference with `min-h-[var(--token)]`, not raw px. |
| **No hex literals in `.tsx`.** | Every color belongs in `@theme` or `tokens.json` (future). If you see `style={{ color: '#...' }}` in a component, that's a bug. |

---

## Atoms — reusable visual primitives

| Atom | Tokens | Notes |
|------|--------|-------|
| **Handle** | ring `--color-success` (filled) or `--color-warning` (empty), inner `--color-surface-raised` | Circle (optional), diamond (required). `handle-pulse` keyframe in `src/index.css` uses warning. |
| **Chip** | `bg-{warning,success,accent,neutral}-subtle` + matching border + matching text, `font-mono text-nano` | Four variants: `warn` (needs input), `ok` (filled), `accent` (current/best/queued), `neutral` (optional/meta). Inline in node components today; shared `Badge` component is a future lift. |
| **Left-edge rail** | `border-l-2 border-l-success` or `border-l-2 border-l-warning` | Implemented as `leftRail?: 'success' \| 'warning' \| null` on `NodeShell` (`src/components/canvas/nodes/NodeShell.tsx`). Pure mapping covered by `__tests__/NodeShell-rail.test.ts`. Never combined with selected/error borders (those states own the full border). |
| **Primary button** | `bg-accent text-white hover:bg-accent-hover` | Used on Design, Generate, Extract. |
| **Secondary button** | `border-border bg-surface-raised text-fg-secondary hover:border-accent` | Wand-generate, rename, download, icon-only close buttons. |
| **Destructive button** | `border-error-border bg-error-subtle text-error hover:bg-error-surface-hover` | Stop generation, delete confirms. |
| **Scorecard bar** | Track `--color-border-subtle`, fill `bg-success` / `bg-warning` based on threshold | `DimensionBar` in `EvaluationScorecard.tsx`. Threshold + clamp logic in `scorecard-threshold.ts`; covered by unit tests. |

---

## Color semantics

| Role | CSS variables (base) | Typical utilities | Use for |
|------|----------------------|-------------------|---------|
| **Accent** | `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--color-accent-surface` | `bg-accent`, `text-accent`, `border-accent`, `ring-accent` | Brand, selection, focus, queued hypothesis border, React Flow edge-selected, primary button fill, progress. |
| **Success (sage)** | `--color-success`, `--color-success-subtle`, `--color-success-border-muted` | `bg-success`, `text-success`, `border-l-success`, `border-success-border-muted` | Filled handles, sage left rail, "filled" chip, scorecard bars ≥ threshold (3.8), any "complete/ok" signal. |
| **Warning (amber)** | `--color-warning`, `--color-warning-subtle`, `--color-warning-border` | `bg-warning`, `text-warning`, `border-l-warning`, `border-warning-border` | Empty-required handles (diamond + pulse), amber left rail, "needs input" chip, scorecard bars below threshold, fix-list bullets. |
| **Error (rose)** | `--color-error`, `--color-error-subtle`, `--color-error-border*` | `text-error`, `bg-error-subtle`, `border-error-border-medium` | Destructive only — delete hover, error callouts (`NodeErrorBlock`), generation failures. Never for low scores (use warning). |
| **Info (pacific)** | `--color-info`, `--color-info-subtle` | `text-file-css`, `bg-info-subtle` | CSS file icon, capture-screenshot indicator. **Nothing else.** |
| **Surfaces / fg** | `--color-bg` (canvas), `--color-surface` (paper), `--color-surface-raised` (cards), `--color-fg*` | `bg-surface`, `bg-surface-raised`, `text-fg`, `text-fg-muted`, `border-border`, `border-border-subtle` | Three-layer paper stack: desk → sheets → raised cards. Text hierarchy four-step: `fg` → `fg-secondary` → `fg-muted` → `fg-faint`. |
| **Nested / inset** | `--color-surface-nested`, `--color-surface-note`, `--color-surface-floating` | `bg-surface-nested`, `.ds-callout-note` | Inspector rails, scorecard container, neutral note callouts. |
| **File roles (aliases)** | `--color-file-{html,css,script,data}` → `accent` / `info` / `warning` / `success` | `text-file-html`, … | Explorer icon tints only — no extra hues. |

**Evaluation inline tags stay neutral.** Severity chips (`[high]`, `[medium]`, `[low]`) and hard-fail codes in `EvalPrioritizedFixList.tsx` render as `bg-surface-raised text-fg-secondary ring-border-subtle`. The uppercase label carries meaning; do **not** map them to status hues.

**Prioritized-fix rows** show an amber bullet (`bg-warning` dot) preceding the text — the heading "Prioritized fixes" uses `text-badge uppercase text-fg-muted`. Row text is `text-fg-secondary`.

**Scorecard threshold coloring.** `SCORECARD_PASS_THRESHOLD` (3.8) lives in `src/components/canvas/variant-run/scorecard-threshold.ts`. Overall score + every per-dimension bar + every per-dimension numeric all key off the same `thresholdTone(score)` helper — the eye reads the scorecard as one coherent signal rather than "numbers here, bars there." Override the threshold by reading `useEvaluatorDefaultsStore.getState().minOverallScore` if product logic requires it.

**Version badges:** `badgeColor()` in `src/lib/badge-colors.ts` is **always accent** (`bg-accent-subtle text-accent`) for v1, v2, … — not per-run hue rotation, not eval severity.

---

## Typography scale

| Token | Utility | When |
|-------|---------|------|
| `--text-pico` | `text-pico` | 8px — very dense labels (sparingly) |
| `--text-badge` | `text-badge` | 9px — chips, uppercase section labels |
| `--text-nano` | `text-nano` | 10px — secondary lines in tight panels |
| `--text-micro` | `text-micro` | 11px — scorecard overall numeric, compact meta |

Larger copy uses `h1`–`h4` / `body-text` / `caption` / `label` component classes in `@layer components` (same file), or standard Tailwind sizes for canvas-level content.

---

## Developer kitchen sink

**In-app (development only):** Settings (gear icon in canvas header) → **General** → **Open design tokens kitchen sink…** opens a scrollable modal with the same reference content.

**Full page (development only):** run the app and open **`/dev/design-tokens`** for the standalone route. Omitted from production builds.

Both render `@theme` swatches, the dense type scale, `ds-*` compositions, and `.input-focus` — use them to catch token drift and confirm new chrome goes through `src/index.css`, not one-off hexes.

---

## Maintenance

1. **New color role** — Add `--color-*` under `@theme` in `src/index.css`. Mirror in the `html[data-theme="dark"]` block for dark mode. Use `color-mix(in srgb, …)` for `*-subtle` / `*-border-muted` / `*-surface-hover` derivatives.
2. **New dense size** — Add `--text-*` in `@theme` only if the scale truly needs another step.
3. **New atom or pattern** — Before inventing a hex: check if an existing role (accent / success / warning / error / info) can do the semantic job via a new application (outline vs. fill, dashed vs. solid). See the anti-patterns in the blueprint below if in doubt.
4. **Update this doc** when you introduce a new **semantic role** or change naming — not for every visual tweak.

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — System layout, stores, API; links here for UI tokens.
- [AutoDesigner Indigo Reference.html](AutoDesigner%20Indigo%20Reference.html) — canonical visual reference; every atom/state rendered pixel-accurate.
- [DESIGN-SYSTEM-BLUEPRINT.md](DESIGN-SYSTEM-BLUEPRINT.md) — portable DS blueprint (packages/design-system pattern, drift guards, kitchen-sink-as-catalog). **Not currently adopted**; future-direction reference only.
- [DOCUMENTATION.md](DOCUMENTATION.md) — How documentation is organized (this file is in the README hub).
