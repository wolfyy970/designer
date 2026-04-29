# Design system (SPA)

**Scope:** Browser UI colors and dense typography. **Source of truth for values:** [`packages/design-system/tokens.json`](packages/design-system/tokens.json). A small Node build (`pnpm tokens:build`) fans out to `packages/design-system/_generated-tokens.css` (the `:root` and `.dark` base tokens). Derived/composed tokens (`color-mix(...)`, aliases) live in `packages/design-system/globals.css`, which `src/index.css` imports. This file describes **semantics and how to use tokens**; do not copy hex values here — change `tokens.json` once, rebuild, grep the repo for drift.

**Stack:** Tailwind CSS v4 reads `@theme inline { … }` custom properties in `globals.css` as utilities (e.g. `bg-warning-subtle`, `text-file-html`, `font-display`). Body/UI sans, display serif, and monospace are wired in `@theme inline` (see **Typefaces**). React atoms live under `packages/design-system/components/ui/` and import as `@ds/components/ui/<name>` (TS path alias).

**Canonical visual reference:** [`Designer Indigo Reference.html`](Designer%20Indigo%20Reference.html) — pixel-accurate spec for every atom/molecule/organism in both themes. Open side-by-side when building or reviewing canvas chrome.

---

## Typefaces — Indigo triad

| Role | `@theme` token / utility | Family | Used for |
|------|-------------------------|--------|----------|
| **Body / UI** | `--font-sans` → default `font-sans` | **Inter Tight Variable** (latin subset in `src/fonts/latin-subsets.css`) | Node body text, inputs, buttons, labels — everything that isn't a title or numeric |
| **Display** | `--font-display` → `font-display` | **Fraunces Variable** (same subsets file) | Canvas title in the header (italic), `h1.page-title`-style emphasis. **Not** used on node `<h3>` titles — those stay sans per the reference |
| **Wordmark / logo** | `--font-logo` → `font-logo` | **Fraunces Variable** | Designer wordmark in `CanvasHeader` |
| **Code / numerics** | `--font-mono` | **JetBrains Mono Variable** (same subsets file) | Chips, badges, per-dimension scorecard numerics, file paths, code blocks |

The three-voice triad (serif display + tight sans body + mono numerics) is the system. **Never introduce a fourth family.** Do not list font file names elsewhere — change `tokens.json` `font.*` entries + the `@font-face` declarations in `src/fonts/latin-subsets.css` once; this table stays semantic.

---

## Themes — light default, dark via `.dark` class

| Mode | Trigger | Canvas | Applied by |
|------|---------|--------|------------|
| **Light** (default) | `html` has no `dark` class | Warm bone (`--color-bg: #f4efe6`), near-black ink (`--color-fg`), indigo brand | `useThemeEffect` (reads `localStorage.theme`, default `'light'`) |
| **Dark** | `html.dark` | Cool near-black surfaces, brighter indigo/sage/amber tuned for dark | Same hook; token overrides live in the `.dark { … }` block of `_generated-tokens.css` (generated from `tokens.json`) |

Tailwind v4 wires the class through `@custom-variant dark (&:is(.dark *))` in `globals.css`, so `dark:*` utilities work off the same switch. `useThemeEffect` (`src/hooks/useThemeEffect.ts`) is tested (`__tests__/useThemeEffect.test.tsx`). Preview iframes stay on pure white in both modes — user-generated HTML must render on neutral paper regardless of canvas theme.

---

## Principles

| Rule | Why |
|------|-----|
| **Accent is brand + primary action — nothing else.** | Indigo (`--color-accent: #3a5a7d`) fills the three primary CTAs (Design / Generate / Extract), the selection ring, the focus ring, and the queued-hypothesis border. Never status, never chrome panels, never a secondary button. |
| **Sage + amber do real work.** | `--color-success` (sage) = filled / OK / passing score. `--color-warning` (amber) = empty / needs input / below-threshold score. Used on handles, left-rails, chips, and scorecard bars so state reads at a glance. |
| **Info is rationed.** | `--color-info` (pacific) only on file-css badges and the capture-screenshot indicator. Don't let it creep into general UI. |
| **One hue per role.** | `*-subtle` / `*-surface` / `*-border-*` derive from the same base via `color-mix(in srgb, …)`. No orphaned RGBA triplets; no invented hues. |
| **No default Tailwind palette in product UI.** | Utilities like `text-indigo-500` or `bg-gray-100` bypass `@theme inline`. Add or reuse a semantic token. |
| **Dense type uses scale tokens.** | Prefer `text-pico` → `text-micro` over arbitrary `text-[Npx]`. |
| **Layout uses theme dimensions.** | Repeat min-heights and widths belong in `tokens.json` (`--min-height-variant-node`, `--max-height-modal`, `--width-canvas-title`, …) — reference with `min-h-[var(--token)]`, not raw px. |
| **No hex literals in `.tsx`.** | Every color belongs in `tokens.json`. If you see `style={{ color: '#...' }}` in a component, that's a bug. Same rule applies to `globals.css` color-mix partners — use `var(--color-surface-raised)`, not `#ffffff`, or dark mode will wash out. |

---

## Atoms — reusable visual primitives

| Atom | Tokens | Notes |
|------|--------|-------|
| **Handle** | ring `--color-success` (filled) or `--color-warning` (empty), inner `--color-surface-raised` | Circle (optional), diamond (required). `handle-pulse` keyframe in `globals.css` uses warning. |
| **Badge** (`@ds/components/ui/badge`) | `shape="pill"` (rounded-full, border, `font-mono text-nano`) or `shape="tab"` (rounded, no border, `text-badge font-medium`) × `tone="warning|success|accent|neutral"` | Replaces the old inline chip pattern in node components. Migrated sites: InputNode status, HypothesisGenerateButton hint, IncubatorNode hint, VariantToolbar Archived/Best, VariantPreviewOverlay Best-current. cva variants + compoundVariants split to `badge-variants.ts`. Tests at `components/ui/__tests__/badge.test.tsx`. |
| **Left-edge rail** | `border-l-2 border-l-success` or `border-l-2 border-l-warning` | Implemented as `leftRail?: 'success' \| 'warning' \| null` on `NodeShell` (`src/components/canvas/nodes/NodeShell.tsx`). Pure mapping covered by `__tests__/NodeShell-rail.test.ts`. Never combined with selected/error borders (those states own the full border). |
| **Button** (`@ds/components/ui/button`) | `variant="primary|secondary|destructive|ghost|link"` × `size="sm|md|lg|icon|iconSm"` | `primary` = `bg-accent text-white` (Design/Generate/Extract CTAs). `destructive` = bordered raised surface + `text-error` + hover `border-error-border` / `bg-error-subtle` (see `button-variants.ts` — matches Stop on the hypothesis card and delete-style confirms). `ghost` + `iconSm` (size-5, p-0.5) for toolbar-chrome X-close. `asChild` via `@radix-ui/react-slot`. cva variants split to `button-variants.ts`. Tests at `components/ui/__tests__/button.test.tsx`. |
| **StatusPanel** (`@ds/components/ui/status-panel`) | `tone="accent|success|warning|info|error|neutral"` via `StatusDot`, dense label/status type, optional action slot | Compact status row for node/panel chrome when an object has a label, current state, and optional actions. Use instead of ad hoc rounded status boxes in product UI. Tests at `components/ui/__tests__/status-panel.test.tsx`; rendered in the kitchen sink. |
| **DocumentViewer** (`@ds/components/ui/document-viewer`) | Tokenized metadata block + read-only `pre` surface | Read-only display for generated Markdown/plain-text artifacts. Use when the app needs an inspectable generated document without introducing local modal body chrome. Tests at `components/ui/__tests__/document-viewer.test.tsx`; rendered in the kitchen sink. |
| **Scorecard bar** | Track `--color-border-subtle`, fill `bg-success` / `bg-warning` based on threshold | `DimensionBar` in `EvaluationScorecard.tsx`. Threshold + clamp logic in `scorecard-threshold.ts`; covered by unit tests. |

---

## Color semantics

| Role | CSS variables (base) | Typical utilities | Use for |
|------|----------------------|-------------------|---------|
| **Accent** | `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--color-accent-surface` | `bg-accent`, `text-accent`, `border-accent`, `ring-accent` | Brand, selection, focus, queued hypothesis border, React Flow edge-selected, primary button fill, progress. |
| **Success (sage)** | `--color-success`, `--color-success-subtle`, `--color-success-border-muted` | `bg-success`, `text-success`, `border-l-success`, `border-success-border-muted` | Filled handles, sage left rail, scorecard bars ≥ threshold (3.8), any "complete/ok" signal. (Input nodes do **not** show a success pill when complete — green handle + rail is enough.) |
| **Warning (amber)** | `--color-warning`, `--color-warning-subtle`, `--color-warning-border` | `bg-warning`, `text-warning`, `border-l-warning`, `border-warning-border` | Empty-required handles (diamond + pulse), amber left rail, problem-only pills (e.g. `needs input`, incubator readiness), scorecard bars below threshold, fix-list bullets. |
| **Error (rose)** | `--color-error`, `--color-error-subtle`, `--color-error-border*` | `text-error`, `bg-error-subtle`, `border-error-border-medium` | Destructive only — delete hover, error callouts (`NodeErrorBlock`), generation failures. Never for low scores (use warning). |
| **Info (pacific)** | `--color-info`, `--color-info-subtle` | `text-file-css`, `bg-info-subtle` | CSS file icon, capture-screenshot indicator. **Nothing else.** |
| **Surfaces / fg** | `--color-bg` (canvas), `--color-surface` (paper), `--color-surface-raised` (cards), `--color-fg*` | `bg-surface`, `bg-surface-raised`, `text-fg`, `text-fg-muted`, `border-border`, `border-border-subtle` | Three-layer paper stack: desk → sheets → raised cards. Text hierarchy four-step: `fg` → `fg-secondary` → `fg-muted` → `fg-faint`. |
| **Nested / inset** | `--color-surface-nested`, `--color-surface-note`, `--color-surface-floating` | `bg-surface-nested`, `.ds-callout-note` | Inspector rails, scorecard container, neutral note callouts. |
| **File roles (aliases)** | `--color-file-{html,css,script,data}` → `accent` / `info` / `warning` / `success` | `text-file-html`, … | Explorer icon tints only — no extra hues. |

**Evaluation inline tags stay neutral.** Severity chips (`[high]`, `[medium]`, `[low]`) and hard-fail codes in `EvalPrioritizedFixList.tsx` render as `bg-surface-raised text-fg-secondary ring-border-subtle`. The uppercase label carries meaning; do **not** map them to status hues.

**Prioritized-fix rows** show an amber bullet (`bg-warning` dot) preceding the text — the heading "Prioritized fixes" uses `text-badge uppercase text-fg-muted`. Row text is `text-fg-secondary`.

**Scorecard threshold coloring.** `SCORECARD_PASS_THRESHOLD` (3.8) lives in `src/components/canvas/variant-run/scorecard-threshold.ts`. Overall score + every per-dimension bar + every per-dimension numeric all key off the same `thresholdTone(score)` helper — the eye reads the scorecard as one coherent signal rather than "numbers here, bars there." Override the threshold by reading `useEvaluatorDefaultsStore.getState().minOverallScore` if product logic requires it.

**Version badges:** Preview footers use **`Badge` `shape="tab"` `tone="accent"`** for v1, v2, … — not per-run hue rotation, not eval severity.

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

Both render token swatches, the dense type scale, `ds-*` compositions, `.input-focus`, and (for **destructive**) the real **`Button variant="destructive"`** — use them to catch token drift and confirm new chrome goes through `tokens.json` / `globals.css` / `button-variants.ts`, not one-off hexes.

---

## Package shell — `packages/design-system/`

```
packages/design-system/
├── tokens.json               # Source of truth for base color / font / text / width / height tokens (light + dark)
├── build-tokens.mjs          # Node generator — reads tokens.json, writes _generated-tokens.css
├── _generated-tokens.css     # :root { ... } + .dark { ... } base tokens (committed, linguist-generated)
├── globals.css               # @import "tailwindcss", @custom-variant dark, :root derived tokens, @theme inline, @layer components, keyframes
├── components/ui/            # React atoms: button.tsx + button-variants.ts, badge.tsx + badge-variants.ts
├── lib/utils.ts              # cn() = clsx + tailwind-merge with custom classGroups for text-micro/nano/badge/pico
├── __tests__/                # Drift guards (see below)
└── package.json              # Private workspace package — `@auto-designer/design-system` / `@ds/*` alias
```

The root `src/index.css` collapses to two imports: `@ds/globals.css` and the Latin-subset `@font-face` block. Running `pnpm tokens:build` before Vite (wired as `prebuild`) regenerates `_generated-tokens.css` deterministically.

### Drift guards — `packages/design-system/__tests__/`

Run with `pnpm test` (chained) or `pnpm -F @auto-designer/design-system test`.

| Test | Catches |
|------|---------|
| **`build-tokens-idempotent.test.ts`** | `build-tokens.mjs` is non-deterministic (two runs produce different output). Wraps in try/finally so a failing test leaves the working tree clean. |
| **`token-parity.test.ts`** | A fixed-value `--color-*` in `:root` that has no `.dark` counterpart (bug class: pink hover that stays pink in dark mode). Also flags **var + literal hex** color-mix tokens (bug class: `color-mix(var(--color-accent) 8%, #ffffff)` — the var flips with theme but the hex doesn't). Intentionally-shared colors go in `SHARED_COLOR_TOKENS` (e.g. `--color-overlay`, preview-canvas, fixed-white media-chrome alphas). |
| **`theme-inline-coverage.test.ts`** | A token declared in `:root` that isn't exposed as a Tailwind utility via `@theme inline`. Uses a brace-counting extractor so multiple `:root` scopes or nested at-rules don't silently truncate. |

These are the DS-side counterpart to the wider drift guards in the [blueprint](DESIGN-SYSTEM-BLUEPRINT.md); the blueprint's `check-tailwind-drift` / `check-kitchen-sink-integrity` / `check-no-oklch-in-src` guards are **not yet wired**.

---

## Maintenance

1. **New color role** — Add a leaf under `color.<role>` in `tokens.json` with `light.value` + `dark.value` hex. Run `pnpm tokens:build`. For derived tokens (`*-subtle` / `*-border-muted` / `*-surface-hover` via `color-mix`), add to the `:root` block of `globals.css`; if the mix partner is a surface color, use `var(--color-surface-raised)` — not `#ffffff` — so it tracks theme. Then add the token to the `@theme inline` block if you want a Tailwind utility.
2. **New dense size** — Add under `text.*` in `tokens.json` only if the scale truly needs another step. Re-register the class group in `lib/utils.ts` so `cn('text-white', 'text-micro')` keeps both.
3. **New atom or pattern** — Live in `packages/design-system/components/ui/<name>.tsx` (component) + `<name>-variants.ts` (cva factory, split for `react-refresh/only-export-components`). Test in the sibling `__tests__/`. Import at call sites via `@ds/components/ui/<name>`.
4. **Update this doc** when you introduce a new **semantic role** or change naming — not for every visual tweak.

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — System layout, stores, API; links here for UI tokens.
- [Designer Indigo Reference.html](Designer%20Indigo%20Reference.html) — canonical visual reference; every atom/state rendered pixel-accurate.
- [DESIGN-SYSTEM-BLUEPRINT.md](DESIGN-SYSTEM-BLUEPRINT.md) — portable DS blueprint (full spec; Phases 1–5 + hardening + Badge landed, remaining phases queued — atoms sweep, patterns, studio tier, kitchen-sink restructure, full drift guards, CI).
- [DOCUMENTATION.md](DOCUMENTATION.md) — How documentation is organized (this file is in the README hub).
