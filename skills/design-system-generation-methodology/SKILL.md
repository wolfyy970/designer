---
name: Design system generation methodology
description: Use with DESIGN.md extraction when source material is sparse and a complete inferred design system must be generated. Covers principled defaults for palette, typography, spacing, rounded corners, components, accessibility, and uncertainty labeling.
tags:
  - design-system
when: auto
---

# Design system generation methodology

Use this skill when the supplied design-system source is incomplete, such as a short brand note, a partial token list, or a small number of screenshots. The goal is still to produce a complete, valid Google `DESIGN.md`; sparse input means more values are inferred, not that sections or token groups are omitted.

## Method

- Start with the strongest evidence: explicit tokens, written style rules, visible colors, visible typography, visible component treatments, and image descriptions.
- Convert observed values into valid `DESIGN.md` token values. If exact measurement is impossible, choose the closest coherent value and label it inferred in Markdown prose.
- Make the generated system internally consistent. Palette, typography, spacing, rounded corners, and component tokens should feel like they belong to the same product.
- Keep all inferred YAML values valid. Do not put `~`, comments, uncertainty notes, or prose inside typed token values.

## Principled Defaults

- Palette: include primary, secondary, tertiary, neutral, surface, on-surface, and error when possible. Ensure foreground/background pairs are plausibly accessible.
- Typography: create a practical scale with display/headline, body, and label levels. Use common UI sizes and line heights when the source is silent.
- Spacing: prefer a simple 4px or 8px rhythm unless the source points elsewhere. Include base, xs, sm, md, lg, xl, gutter, and margin tokens when useful.
- Rounded: create a coherent scale such as none, sm, md, lg, xl, and full. Match visible shape language when screenshots exist.
- Components: define core component tokens for primary buttons and key controls using references to the generated tokens. Include variants when the source implies states.
- Accessibility: choose contrast-aware defaults and note where contrast could not be verified from source material.

## Uncertainty

In every official Markdown section that contains inferred decisions, say what was inferred and why. Keep the statement short and operational, for example: "Typography scale inferred from the single visible heading/body pairing; exact font family was not specified."
