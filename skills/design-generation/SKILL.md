---
name: Design generation
description: Use when building static web artifacts (HTML/CSS/JS) that embody a design hypothesis. Covers output requirements, file organization, self-critique validation, and design quality bar for multi-file design agent sessions.
tags:
  - design
when: auto
---

# Design generation

Apply when building a static web artifact from a design hypothesis.

## Mission

The user message is a design hypothesis — a bet about what will work for this audience. That bet is your north star for palette, type, layout, motion, and copy. Before tools, state the bet in one sentence (visible in the activity log).

Create the **file tree** the design needs: usually `index.html` plus linked CSS/JS/assets, and **additional `.html` pages** when the hypothesis implies multiple screens, flows, or IA. Prefer maintainable paths (optional folders like `css/`, `js/`, `pages/`); **file count is not a goal — clarity is**.

## Output requirements

**Preview entry:** Prefer `index.html` at the workspace root so the canvas preview resolves a default URL. Add more `.html` files when the bet implies multiple views, steps, or information architecture; link with **relative URLs** so navigation works.

Each HTML document should:
- Use a proper DOCTYPE, `html`, `head`, and `body` for full pages
- Use semantic HTML (nav, main, section, footer, article) where it helps accessibility and structure

**CSS / JS organization:** Choose what fits the artifact. Linked `.css` / `.js` files scale well for shared styles or behavior across pages; inline `<style>` / `<script>` is acceptable for small or page-specific pieces. Prefer **linked** assets when files grow large or are reused.

When you use CSS (inline or files):
- Use CSS custom properties for key tokens where appropriate
- Be fully responsive (mobile + desktop)
- Prefer local files over external `@import`; **exception:** Google Fonts via `https://fonts.googleapis.com/...` (in `<link>` or `@import`) and font files loaded from `https://fonts.gstatic.com` via Google's CSS — **only** those hosts

When you use JS:
- Plain vanilla JS only — no `import`/npm packages
- Use DOMContentLoaded or `defer` / appropriate load order for external scripts

All assets:
- No external CDNs except the Google Fonts allowlist above (no jsDelivr, unpkg, other scripts/styles from the network)
- External `<script src>` is not allowed — all JS must be local/inline
- Local relative paths for everything else; every referenced **local** file must exist in the virtual workspace

## Interpreting hypothesis inputs

When hypothesis inputs include objectives and metrics, treat them as how this hypothesis will be judged — design for measurable success against those signals.

When design constraints are provided, treat them as non-negotiable boundaries and exploration space — satisfy all hard constraints while exploring within the defined ranges.

When a design system is provided, apply those design tokens, components, and patterns faithfully. Avoid arbitrary drift without reason.

## Self-critique pass

Before finishing:
- Run **validate_html** on **every** HTML file you ship (at minimum the preview entry — usually `index.html` — and any other `.html` pages), and **validate_js** on each external `.js` file you changed; fix blockers.
- Grep for palette/motion/class usage to catch drift; **read** where you need full context.
- Ask: does the UI embody the hypothesis in ~30s? Use **edit** for targeted fixes.
- todo_write marks review tasks complete.

## Design quality

Create a visually striking, memorable design that embodies the hypothesis. Avoid generic "AI-generated" aesthetics.

Typography: Choose distinctive, characterful font stacks. Avoid defaulting to system fonts, Arial, or Inter. Use allowlisted Google Fonts, creative system stacks, or `@font-face` with local/embedded fonts as needed.

Color: Commit to a bold, cohesive palette using CSS custom properties. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Avoid clichéd purple-gradient-on-white schemes.

Spatial composition: Use intentional layouts — asymmetry, overlap, generous negative space, or controlled density. Break predictable grid patterns where it serves the design intent.

Motion: Add CSS transitions and animations for micro-interactions, hover states, and page-load reveals. Use animation-delay for staggered entrance effects.

Atmosphere: Create depth with layered gradients, subtle textures, geometric patterns, or dramatic shadows. Solid white backgrounds are a missed opportunity.

Content: Include realistic, plausible content — never lorem ipsum. Names, dates, prices, and copy should feel authentic and reinforce the hypothesis.
