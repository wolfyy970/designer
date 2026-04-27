# Design System Blueprint — Portable Recipe

> **For coding agents:** this document describes the design system pattern used by Org Chart Studio (TypeScript + Next.js + React + Tailwind v4), extracted for reuse in other projects. An external audit scored the implementation 9.4/10. Follow the rules literally. Skip the "why" sections only if you're already convinced.
>
> **Scope.** Single app or multi-app monorepo. Works whether you have one product surface or several (main + admin + mobile viewer). Assumes a TypeScript + React + Tailwind CSS stack.

---

## 1 · Why this shape

| Problem | This blueprint | The usual mistake |
|---|---|---|
| "Where does a new component live?" | Atomic tiers + promotion rules | Flat `components/` folder, no theory |
| "Is this still on-brand after three sprints?" | Three AST drift guards run in CI | Eyeballing PRs |
| "How do I show contributors what exists?" | `/kitchen-sink` page backed by an integrity linter | Storybook (then unmaintained) |
| "How do we theme a second app?" | Shared source package + semantic aliases | Copy/paste primitives, drift within a quarter |
| "Dark mode?" | Lightness flip on OKLCH scales, dark tokens generated from one file | Hand-maintain two token sets |

**Invariants you get for free:**
- Every color that ships is in `tokens.json`. No magic OKLCH literals in `.ts/.tsx` (linter enforces).
- Every primitive that ships is in the kitchen-sink (integrity linter enforces).
- Every `:root` token has a `.dark` counterpart (parity test enforces).
- Every body-text FG/BG pair meets WCAG 4.5:1, every UI pair meets 3:1 (contrast test enforces in both themes).

---

## 2 · The 60-second mental model

1. **One shared-source package** at `packages/design-system/`. Even a single-app repo gets it — the cost is near-zero and adding a second app later is free.
2. **Tokens cascade top-down.** Raw OKLCH scales → generator script → `_generated-tokens.css` → `globals.css` (semantic aliases + `@theme inline`) → Tailwind utilities.
3. **Atomic tiers with promotion rules.** Atoms + molecules + organisms in `components/ui/`. Compositions in `components/patterns/`. App-specific chrome in `components/studio/`. Features get lifted in only when 2+ consumers exist.
4. **Kitchen sink IS the catalog.** Not Storybook. A real route at `/kitchen-sink` rendered from real DS imports — guarded by an AST linter that fails CI if a raw `<button>` sneaks in.
5. **Three CI guards keep the system honest.** Tailwind drift, no-OKLCH-in-src, kitchen-sink integrity. None is optional.

---

## 3 · Package layout

Copy this tree verbatim for a new project. Every file below exists in the reference implementation and does something specific.

```
packages/design-system/
├── tokens.json                 # Raw color scales (Design Tokens Format, dual-theme)
├── build-tokens.mjs            # tokens.json → _generated-tokens.css (runs on prebuild)
├── _generated-tokens.css       # AUTO-GENERATED — committed; regenerated on every build
├── globals.css                 # @import generated + semantic aliases + @theme inline + utilities
├── components/
│   ├── ui/                     # Atoms + molecules + organism shells (Button, Input, Card, Dialog, …)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── …
│   │   └── __tests__/          # Behavior + ARIA tests
│   ├── patterns/               # Compositions of 2+ atoms, used by 2+ consumers
│   │   ├── icon-badge.tsx
│   │   ├── status-card.tsx
│   │   ├── stat-card.tsx
│   │   ├── page-header.tsx
│   │   ├── empty-state.tsx
│   │   ├── form-field.tsx
│   │   ├── blog-card.tsx
│   │   ├── index.ts            # Barrel for the folder (imports are still file-specific)
│   │   └── __tests__/
│   ├── studio/                 # App-specific chrome (this is YOUR product's primitives)
│   │   ├── studio-panel-primitives.tsx
│   │   └── __tests__/
│   └── table-editor/           # Example of a feature LIFTED to the DS (had 2+ consumers)
│       ├── OrgTableView.tsx
│       └── __tests__/
├── lib/
│   ├── utils.ts                # cn() helper with tailwind-merge classGroups registration
│   └── node-display.ts         # Pure helpers lifted from feature code
├── types/
│   └── *.ts                    # Public type contracts (shared between app and DS)
└── __tests__/
    └── build-tokens.test.ts    # Token parity + generator idempotency
```

**Path alias.** In both app and package `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": { "@ds/*": ["./packages/design-system/*"] }
  }
}
```
Admin portal or secondary apps use a relative path: `"@ds/*": ["../packages/design-system/*"]`.

**Imports use `@ds/*` everywhere.** Never relative paths into the package.

---

## 4 · Token cascade (step by step)

This is the most important part. Skip the sugar and get the pipeline right.

### Step 1 — `tokens.json` (source of truth)

Use the Design Tokens Format with per-step `{ light, dark }` leaves:

```json
{
  "color": {
    "primary": {
      "50":  { "light": { "value": "oklch(0.97 0.02 258)", "type": "color" },
               "dark":  { "value": "oklch(0.18 0.015 258)", "type": "color" } },
      "100": { "light": { "value": "oklch(0.94 0.04 258)", "type": "color" },
               "dark":  { "value": "oklch(0.22 0.02 258)", "type": "color" } },
      "600": { "light": { "value": "oklch(0.52 0.15 258)", "type": "color" },
               "dark":  { "value": "oklch(0.68 0.12 258)", "type": "color" } }
    }
  }
}
```

**Scales to include at minimum:**
- `primary` (brand) — 10 steps: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
- `gray` — same 10 steps
- One accent (we call it `brand-gold`) — usually 7 steps: 50–600
- Semantic: `success`, `warning`, `error`, `info` — at least 50, 100, 300, 600, 800 in both themes

**OKLCH rationale.** Perceptually uniform. Lightness-only flip for dark mode works because chroma/hue remain stable. Hex gets you uneven dark ramps.

### Step 2 — `build-tokens.mjs` (generator)

Plain 40-line script. No Style Dictionary runtime needed for this shape.

```js
// packages/design-system/build-tokens.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(here, "tokens.json"), "utf8"));

function toCssBlock(theme) {
  const out = [];
  for (const [scale, steps] of Object.entries(tokens.color ?? {})) {
    out.push(`  /* ${scale} */`);
    for (const [step, token] of Object.entries(steps)) {
      const value = token?.[theme]?.value;
      if (!value) continue;
      out.push(`  --${scale}-${step}: ${value};`);
    }
  }
  return out.join("\n");
}

const body = `/* AUTO-GENERATED — do not edit by hand. Source: tokens.json */
:root {
${toCssBlock("light")}
}
.dark {
${toCssBlock("dark")}
}
`;
writeFileSync(resolve(here, "_generated-tokens.css"), body);
```

Wire it into `package.json`:
```json
{
  "scripts": {
    "tokens:build": "node packages/design-system/build-tokens.mjs",
    "prebuild": "npm run tokens:build"
  }
}
```

### Step 3 — `globals.css` (semantic aliases)

This is the hand-written layer. Import the generated file, then declare semantic aliases that components consume:

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
@layer theme, base, components, utilities;

@import "./_generated-tokens.css";    /* Raw scales */

:root {
  /* Semantic aliases — THIS is what components reference */
  --background: var(--gray-50);
  --foreground: var(--gray-800);
  --card: #ffffff;
  --border: var(--gray-200);
  --primary: var(--primary-600);
  --primary-foreground: #ffffff;
  --ring-color: var(--primary-500);
  --ring-width: 2px;
  /* Text role ladder — keeps components from reaching for raw gray-* */
  --text-foreground: var(--gray-800);
  --text-foreground-strong: var(--gray-700);
  --text-foreground-heading: var(--gray-900);
  --text-foreground-secondary: var(--gray-600);
  --text-on-accent: var(--gray-950);  /* Near-black on gold (not white) */
}

.dark {
  --background: var(--gray-50);        /* Dark gray-50 is near-black (see tokens.json) */
  --foreground: var(--gray-800);
  /* ... mirror every :root token, no exceptions ... */
}
```

**Rule.** Components never reference raw `--gray-700`. They reference `--text-foreground-strong`. The semantic layer is the contract; the raw layer is an implementation detail.

### Step 4 — `@theme inline` (Tailwind utilities)

Map every CSS variable to a Tailwind class name:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-border: var(--border);
  /* Custom font-size tokens (see Step 5) */
  --text-control: 13px;
  --tracking-heading: -0.02em;
}
```

Now `bg-background`, `text-foreground`, `text-control`, `tracking-heading` all work as Tailwind classes.

### Step 5 — Register custom utilities in `cn()`

**Critical bug trap.** `tailwind-merge` defaults to treating any `text-foo` as a text-color utility. If you add a custom `text-control` font-size token and don't register it, `tailwind-merge` will silently drop legitimate text colors when both are applied.

```ts
// packages/design-system/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-control",
        "text-studio-label",
        "text-studio-control",
        // …every custom --text-* token in @theme inline
      ],
      tracking: ["tracking-heading"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
```

**Regression guard.** Add a test (`packages/design-system/lib/__tests__/cn.test.ts`) that asserts `cn("text-white", "text-control")` keeps both classes. One of the easiest bugs to ship.

---

## 5 · Atomic tiers

| Tier | Location | Criteria to belong here | Promotion up from below |
|---|---|---|---|
| **Atoms** | `components/ui/` | Irreducible. Wraps one HTML element or one Radix primitive. No business logic. | — |
| **Molecules** | `components/ui/` | 2–3 atoms in a fixed composition. Still generic (Alert = Icon + Title + Text). | Lift an inline pattern used 2+ places. |
| **Organisms** | `components/ui/` | Complex multi-part structures (Card, Dialog, Table). No app-specific behavior. | Rare; usually imported from shadcn/Radix. |
| **Patterns** | `components/patterns/` | Compositions of atoms/organisms with tone/slot vocabulary (StatusCard, PageHeader, FormField). Used by 2+ surfaces. | Inline blocks duplicated 2+ times graduate here. |
| **App-specific primitives** | `components/studio/` (or your name) | Product-UI chrome that's reusable within your app but not generic (studio toggle group with 9 className constants). | These live in the package from day one if the app has distinctive chrome. |
| **Feature-lifted** | `components/table-editor/` (or similar) | Full feature subtrees with 2+ consumers, a stable API, and NO engine/runtime coupling. | See §10. |

**Promotion rule of thumb.** If you're reaching for a third inline copy of the same block, promote it. Earlier than that, inline is cheaper.

---

## 6 · Kitchen sink as live catalog

### Why not Storybook

- Storybook is a parallel universe: stories diverge from real usage; contributors don't maintain them.
- The kitchen-sink route is just a Next.js page. It renders what the app renders. If the page works, the DS works.
- Drift detection becomes an AST scan of one folder instead of an out-of-process add-on.

### Section structure

Create `/kitchen-sink` (authenticated or public, your call) with this order:

1. **Foundations** — color scales, text ladder, spacing, elevations. Token docs.
2. **Atoms** — every variant/size/state for Button, Badge, Input, Label, Switch, etc. Real DS imports.
3. **Molecules** — Alert, Accordion, Dropdown, Select, Tabs, Tooltip, Toast.
4. **Organisms** — Card variations, Dialog confirm flow, Table with real data.
5. **Patterns** — render each pattern with realistic content.
6. **States** — idle/hover/focus/disabled/error matrix for the Big Three (Button, Input, Select).
7. **Crosswalk** — token → utility reference table.

Each section is a single file at `src/app/kitchen-sink/showcase/section-<tier>.tsx`. Keep them narrow — no cross-section helpers, no business logic, no bespoke component demos. If a demo is too big to inline, the thing it's demonstrating belongs in `patterns/`.

### The integrity linter

`scripts/check-kitchen-sink-integrity.mjs` parses every kitchen-sink file with `@babel/parser` and applies two rules:

**Rule 1 — no raw HTML primitives.** `<button>`, `<input>`, `<select>` fail unless the file imports the matching DS component (Button / Input / Select) or the matching cva factory (`buttonVariants`).

**Rule 2 — no large local components.** Any component whose body exceeds BOTH 20 JSX elements AND 60 source lines fails, unless the component name appears in `scripts/kitchen-sink-allowlist.txt`. The allowlist is the social mechanism: adding a name requires PR review and forces the question "should this be a real DS component?"

Thresholds are AND not OR — conservative by design. The goal is catching "kitchen-sink lies by rendering inline chrome," not punishing layout helpers.

Wire into `package.json`:
```json
{ "scripts": { "check:kitchen-sink": "node scripts/check-kitchen-sink-integrity.mjs" } }
```

---

## 7 · Three drift guards (all required)

### 7.1 `check-no-oklch-in-src.mjs`

Fail if any `.ts/.tsx` under `src/` or `packages/design-system/` matches `/oklch\s*\(/i`. Colors belong in `tokens.json` and `globals.css`, not string literals in component code. Exempts `__tests__/` (tests parse globals.css and may construct oklch() strings in assertions).

### 7.2 `check-tailwind-drift.mjs`

Fail on these patterns anywhere outside an explicit allowlist:
- `*-gray-*` scale utilities (`text-gray-700`, `bg-gray-50`, etc.) — force semantic aliases.
- Raw neutrals (`bg-white`, `text-black`, `border-white`).
- Prohibited font weights — **DS allows 400/500/600 ONLY.** `font-bold`, `font-extrabold`, `font-light` fail. (Use `font-semibold` + `tracking-heading` for editorial emphasis.)
- Sub-12px arbitrary sizes (`text-[8px]`, `text-[11px]`) — readable text has a floor.
- Bracket values that have named aliases: `text-[13px]` fails if `--text-control: 13px` exists in `@theme inline`.
- Deprecated tokens (e.g. old names during migrations).

Keep the allowlist at `scripts/tailwind-drift-allowlist.txt`. One file per line, glob-like matches. Review allowlist additions as part of PR review.

Scope the scan to `src/`, `packages/design-system/`, AND `admin-portal/src/` (or whatever secondary apps exist). Missing a secondary app is how `font-bold` reaches production.

### 7.3 `check-kitchen-sink-integrity.mjs`

See §6.

### Wiring

```json
{
  "scripts": {
    "lint": "eslint src packages scripts && node scripts/check-no-oklch-in-src.mjs",
    "check:tailwind-drift": "node scripts/check-tailwind-drift.mjs",
    "check:kitchen-sink": "node scripts/check-kitchen-sink-integrity.mjs",
    "verify:ship": "npm run lint && npm run check:tailwind-drift && npm run check:kitchen-sink && npm run test:vitest && npm run build"
  }
}
```

`verify:ship` is the local pre-merge gate. Mirror in CI.

---

## 8 · Testing strategy

**Core rule:** test behavior + ARIA, not class strings — UNLESS the class IS the contract (Button variants, IconBadge tones).

| Tier | What to test | Example |
|---|---|---|
| Atoms | Ref forwarding, ARIA props propagation, variant class output, disabled/checked state | `<Input aria-invalid>` → `aria-invalid="true"` on `<input>` |
| Molecules | Keyboard interaction, open/close state, focus management | `<Dialog>` → Escape closes, focus traps |
| Patterns | Slot rendering, tone propagation to child IconBadge, composed ARIA wiring | `<FormField error>` → `aria-describedby` joins desc+error IDs |
| Pure helpers | Edge cases: empty, whitespace, null, fallback chains | `getNodeLabel("", "")` → `"Untitled"` |

**Required foundation tests** (these are non-negotiable):

- **Contrast.** `packages/design-system/__tests__/contrast.test.ts` — resolve every semantic FG/BG pair from `globals.css` + `_generated-tokens.css`, convert OKLCH → linear sRGB → relative luminance, assert ≥ 4.5:1 body and ≥ 3:1 UI in both `:root` and `.dark`.
- **Token parity.** Every `--*` declared in `:root` has a counterpart in `.dark`. Allow an explicit opt-out list for light-only tokens.
- **Build idempotency.** Running `build-tokens.mjs` twice produces identical output.
- **cn() classGroups.** `cn("text-white", "text-control")` preserves both. One test per custom token.

---

## 9 · Multi-app scaling (adding an admin later)

The whole point of packaging the DS from day one: the second app is nearly free.

### Path alias (secondary app `tsconfig.json`)

```json
{ "compilerOptions": { "paths": { "@ds/*": ["../packages/design-system/*"] } } }
```

### Next.js config (secondary app `next.config.mjs`)

```js
const nextConfig = {
  experimental: { externalDir: true },       // Allow imports from ../packages
  outputFileTracingRoot: path.resolve(__dirname, ".."),
};
```

This lifts the usual "module not found" / "file outside the project" noise.

### CSS import (secondary app `globals.css`)

```css
@import "../../packages/design-system/globals.css";

/* Admin-only additions LAYER on top — never redeclare shared tokens */
:root {
  --sidebar-bg: var(--gray-50);
  --shadow-2xs: 0 1px 2px oklch(0 0 0 / 0.04);
  --brand-yellow: var(--brand-gold-500);   /* Legacy alias for historical admin code */
}
```

### Extend drift guards to the new app

```js
// scripts/check-tailwind-drift.mjs
const targetDirs = [
  path.join(root, "src"),
  path.join(root, "packages", "design-system"),
  path.join(root, "admin-portal", "src"),    // ← add this
];
```

### Add a test

`packages/design-system/__tests__/admin-globals.test.ts`:
- Admin's `globals.css` `@import`s the shared package's globals.
- Admin-only tokens (`--sidebar-*`, etc.) exist and differ from the shared set.
- Admin does NOT redeclare shared tokens (`--primary-600`, `--foreground`, etc.) — catches copy-paste bugs.

---

## 10 · Promotion pattern: feature → DS

When a feature component becomes valuable elsewhere, lift it — but do so without dragging engine coupling into the DS.

### Trigger

- A second surface wants the component (tables want the same row style as a dashboard card, etc.)
- The component has a stable prop API and no runtime coupling to feature-specific engines/state.
- Inline duplication has reached 2–3 copies.

### Steps

1. **Extract pure helpers first.** Anything that takes primitives and returns primitives (`getNodeLabel`, format utilities) moves to `packages/design-system/lib/`. Leave a re-export shim in the old location so existing callers keep working.
2. **Define public types in `packages/design-system/types/`.** If the component's props reference feature types, either lift the types (if they're data shapes) or define DS-local types that your feature code maps to.
3. **Introduce prop injection for feature coupling.** If the component relied on a feature hook (e.g. `isDefaultChart()`), replace with a prop (`isChartEmpty?: boolean`) and pass it in at the call site. The DS must not import from the feature tree.
4. **Move with git history.** `git mv src/components/feature/Thing.tsx packages/design-system/components/thing/`.
5. **Accept small cross-package coupling when it's genuinely product-specific.** 1–2 imports from the DS back into feature code (e.g. "this mobile menu is only ever used here") is fine. Over-abstracting to eliminate every coupling produces worse code.
6. **Leave a re-export shim in the old location.** Feature files keep working with old import paths; migrate them opportunistically.
7. **Delete the shim after two releases** when no callers remain.

### Anti-pattern

Don't promote a feature component whose props include runtime handles (`engineRef`, `subscriptionGate`, etc.). Those don't belong in a design system. If you must, split the component into a DS shell + feature-owned wrapper that injects the handle.

---

## 11 · Migration playbook — introducing this to an existing app

For a TypeScript + React + Tailwind project that currently has sprawling CSS:

1. **Create the package shell.** `mkdir -p packages/design-system/{components/ui,components/patterns,lib,types,__tests__}`. Add `package.json` that's private: `"private": true`. Configure the `@ds/*` path alias in app `tsconfig.json`.
2. **Move tokens to `tokens.json`.** Audit your existing colors. Consolidate to 10-step scales in OKLCH. Commit `tokens.json` + the 40-line `build-tokens.mjs`. Wire to `prebuild`. Delete hardcoded color declarations from `globals.css`.
3. **Write semantic aliases in `globals.css`.** Replace every raw `--gray-700` reference in components with a semantic alias. This is the heaviest step; expect a sweep.
4. **Move ONE primitive first (Button).** Validate the full pipeline (alias → import → tailwind-merge → theme mode flip). Add primitive tests.
5. **Stand up `/kitchen-sink`.** Render the one primitive you moved. Add the `section-foundations.tsx`/`section-atoms.tsx` structure even with just one atom in it. Future moves add sections.
6. **Add the three drift guards.** Start with empty allowlists. Expect initial violations — capture them in the allowlist, then migrate off the allowlist file-by-file (not all at once). This quarantines drift so new code doesn't regress.
7. **Sweep remaining primitives.** Button → Input → Badge → Label → Card → Dialog → Select → Switch → … (roughly in that order by consumer count). Each gets a test. Each gets a kitchen-sink entry.
8. **Introduce patterns.** Audit for duplicated inline compositions (status cards, empty states, page headers). Each pattern deserves its own prop API, its own test, its own kitchen-sink entry.
9. **Wire `verify:ship`.** Chain lint + drift + kitchen-sink + vitest + build. This is your merge gate.

**Expected timeline.** One engineer, 2–4 weeks to reach "all primitives in the DS + three guards green + baseline test coverage." Adding patterns and lifting features is ongoing.

---

## 12 · Common pitfalls

- **`tailwind-merge` silently drops text colors.** Any custom `text-*` size token must be registered in `cn()`'s `classGroups["font-size"]`. See §4 Step 5.
- **forwardRef on patterns.** Only on single-root patterns. Wrapper patterns with an internal `<div>` skip it — the ref value is low.
- **Decentralized tone maps.** Define `toneClasses: Record<Tone, string>` once per pattern (or in `IconBadge`), not inline per component. When a designer says "warning should be orange, not yellow," you edit one place.
- **OKLCH literals in `.ts/.tsx`.** Never. Linter enforces. Use `var(--token)` or a Tailwind alias.
- **`font-bold`.** Banned. Use `font-semibold` (600) + `tracking-heading` (-0.02em) for editorial emphasis. Reason: bold + heading tracking gets you the "professional SaaS" look without the blog-typography-generator feel.
- **Premature abstraction.** Three similar inline usages < one pattern with five props and three `className` overrides. Wait for the third copy.
- **Admin-only tokens colliding with shared ones.** Always layer additive. Redeclaring a shared token in the admin's `globals.css` creates a theme-flip bug that lint won't catch.
- **Kitchen-sink → real page leaks.** The kitchen-sink is aggressively real — real Dialog opens and traps focus, real Dropdown navigates. Don't disable pointer events to "keep things static." Bugs in the kitchen-sink are bugs in the DS.
- **Forgetting `transpilePackages` / `externalDir`.** Next.js won't bundle files outside the app dir without one of these. Admin bundlers fail at build time — obvious if you hit it, silent if CI is skipped.
- **Re-export shims that never die.** Flag shims for deletion two releases out. Track in a Looking-Glass issue. Otherwise the DS has two import paths for the same thing forever.

---

## 13 · Deliverable checklist

A complete implementation has all of these:

### Structure
- [ ] `packages/design-system/` with `components/ui/`, `components/patterns/`, `lib/`, `types/`, `__tests__/`
- [ ] `@ds/*` TypeScript path alias in every consumer
- [ ] `tokens.json` in Design Tokens Format with dual-theme leaves

### Build pipeline
- [ ] `build-tokens.mjs` generator
- [ ] `_generated-tokens.css` committed (regenerated on build)
- [ ] `npm run tokens:build` script, wired to `prebuild`

### CSS
- [ ] `globals.css` imports `_generated-tokens.css`, declares semantic aliases, declares `@theme inline`, declares `@layer utilities` custom utilities (`.focus-ring`, etc.)
- [ ] Every `:root` token has a `.dark` counterpart

### Components
- [ ] 8–12 atoms (Button, Badge, Input, Label, Switch, Toggle, Slider, Avatar, …)
- [ ] 8–10 molecules (Alert, Accordion, Dropdown, Select, Tabs, Tooltip, Toast, …)
- [ ] 3–5 organism shells (Card, Dialog, Table, NavigationMenu)
- [ ] 5–7 patterns (IconBadge, StatusCard, PageHeader, FormField, EmptyState, …)

### Utilities
- [ ] `cn()` helper with every custom font-size/tracking utility registered

### Live catalog
- [ ] `/kitchen-sink` route with sections for Foundations, Atoms, Molecules, Organisms, Patterns, States
- [ ] Every component rendered via a real `@ds` import

### Drift guards (all three)
- [ ] `check-no-oklch-in-src.mjs`
- [ ] `check-tailwind-drift.mjs` with allowlist
- [ ] `check-kitchen-sink-integrity.mjs` with allowlist

### Tests
- [ ] Contrast: WCAG 4.5:1 body, 3:1 UI, both themes
- [ ] Token parity: every `:root` has `.dark`
- [ ] Build idempotency: generator is pure
- [ ] `cn()` classGroups: custom tokens don't drop real colors
- [ ] Behavior + ARIA tests for every atom and pattern

### Gate
- [ ] `verify:ship` chains lint + drift + kitchen-sink + vitest + build
- [ ] CI mirrors `verify:ship`

---

## 14 · What's deliberately excluded

- **Storybook.** Replaced by kitchen-sink + integrity linter. If you've been burned by stale stories, you already agree.
- **Figma design tokens sync.** Pointing `tokens.json` at a Figma variables export is feasible and orthogonal to this blueprint. Start without it; add it only when designers request it.
- **Component-level runtime theming.** Users don't pick their own primary color. If they could, you'd restructure everything around runtime CSS variable swaps — that's a different blueprint.
- **Monorepo tooling.** This works with npm/pnpm/yarn workspaces equally. The examples use relative paths + `externalDir` rather than explicit `transpilePackages` because the underlying package is TS source, not a built artifact. Either works.
- **Mobile-native theming.** The DS here is web-first. Native apps need RN-compatible token consumption — a parallel package that reads `tokens.json` and emits StyleSheet objects.

---

## 15 · Reference implementation

The working reference implementation is Org Chart Studio (`github.com/wolfyy970/org-chart-app`). Worth browsing:

- [`packages/design-system/`](packages/design-system/) — the full DS package
- [`packages/design-system/tokens.json`](packages/design-system/tokens.json) — token structure
- [`packages/design-system/build-tokens.mjs`](packages/design-system/build-tokens.mjs) — the 57-line generator
- [`packages/design-system/lib/utils.ts`](packages/design-system/lib/utils.ts) — cn() with classGroups
- [`packages/design-system/components/patterns/icon-badge.tsx`](packages/design-system/components/patterns/icon-badge.tsx) — reference pattern
- [`scripts/check-kitchen-sink-integrity.mjs`](scripts/check-kitchen-sink-integrity.mjs) — AST drift script
- [`scripts/check-tailwind-drift.mjs`](scripts/check-tailwind-drift.mjs) — class drift script
- [`src/app/(site)/(app)/kitchen-sink/`](<src/app/(site)/(app)/kitchen-sink/>) — live catalog

The project's internal design doc ([`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)) describes the tokens and rules specific to that brand; this blueprint describes the *pattern* that doc sits on top of.
