---
version: alpha
name: Wireframe
description: A low-fidelity, monochrome design system in the classic black and white only UX wireframe tradition — sketchy strokes, handwritten type. Use it when the output should read as "draft, not done."

colors:
  primary: "#1F1F1F"
  secondary: "#6B6B6B"
  tertiary: "#FFD66B"
  neutral: "#A8A8A8"
  surface: "#FAFAFA"
  on-surface: "#1F1F1F"
  surface-muted: "#EFEFEF"
  error: "#B83838"

typography:
  headline-lg:
    fontFamily: "Caveat, Kalam, 'Patrick Hand', 'Balsamiq Sans', 'Comic Sans MS', cursive"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
  headline-md:
    fontFamily: "Caveat, Kalam, 'Patrick Hand', 'Balsamiq Sans', 'Comic Sans MS', cursive"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
  body-lg:
    fontFamily: "Kalam, 'Patrick Hand', 'Balsamiq Sans', 'Comic Sans MS', cursive"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: "Kalam, 'Patrick Hand', 'Balsamiq Sans', 'Comic Sans MS', cursive"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Kalam, 'Patrick Hand', 'Balsamiq Sans', 'Comic Sans MS', cursive"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: "Kalam, 'Patrick Hand', 'Balsamiq Sans', 'Comic Sans MS', cursive"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.02em
  label-sm:
    fontFamily: "Kalam, 'Patrick Hand', 'Balsamiq Sans', 'Comic Sans MS', cursive"
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.04em
  annotation:
    fontFamily: "Caveat, 'Patrick Hand', 'Comic Sans MS', cursive"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.3

rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 6px
  full: 9999px

spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  gutter: 16px
  margin: 24px

components:
  page-title:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.headline-lg}"
  section-heading:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.headline-md}"
  body-prose:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: 12px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: 12px
    height: 40px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 8px
    height: 40px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.none}"
    padding: 24px
  placeholder-box:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: 16px
  annotation-sticky:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.annotation}"
    rounded: "{rounded.sm}"
    padding: 12px
  divider:
    backgroundColor: "{colors.neutral}"
    height: 1px
  caption-meta:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-sm}"
  error-note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.label-sm}"
---

## Overview

This is a "Wireframe" design system in the UX tradition: a deliberately low-fidelity, paper-and-marker aesthetic intended to communicate that the layout is a **draft for discussion**, not a finished product. Use it when you want the agent to generate UI that focuses the conversation on structure, hierarchy, and content — and away from polish, brand, or pixel-perfection.

The personality is rough, friendly, and honest. Lines look hand-drawn. Type looks scribbled. Image placeholders are obvious "X-boxes" rather than stock photography. The only color is a single sticky-note yellow used sparingly to flag annotations and notes — everything else is grayscale.

The reference points are Balsamiq Mockups, paper-and-marker sketches taped to a whiteboard, and the "lo-fi" mode in tools like Whimsical and Excalidraw. If you have ever explained a feature to a teammate by drawing it on a napkin, this is that — codified.

## Colors

The palette is black and white and grayscale with one accent. Grayscale removes the urge to debate brand color before the layout is settled. The single accent — a warm sticky-note yellow — is used **only** for annotations, comments, and "TODO" markers, never for primary UI.

- **Primary (#1F1F1F):** The "ink." Used for body text, button fills, and 1–2px borders that simulate hand-drawn strokes.
- **Secondary (#6B6B6B):** A medium graphite. Used for muted body text, placeholder labels, and the hover state of primary buttons.
- **Tertiary (#FFD66B):** Sticky-note yellow. Reserved for annotation backgrounds, comment callouts, and "designer's notes" overlays. Never used for primary actions.
- **Neutral (#A8A8A8):** A light pencil gray. Used for dashed dividers, secondary borders, and section separators.
- **Surface (#FAFAFA):** The "paper." Off-white rather than pure white to suggest a physical sketch surface.
- **Surface-muted (#EFEFEF):** Placeholder fill. Used to mark image, video, and chart placeholders so the agent does not invent stock imagery.
- **Error (#B83838):** Desaturated brick red. Used **only** to flag missing-content warnings or open questions in annotations — not for live form validation styling.

## Typography

All type is set in handwritten or "marker" fonts. This is the single strongest signal that the artifact is a draft. The recommended stack is **Caveat** (Google Fonts) for headlines and annotations, **Kalam** for body and labels, and **Balsamiq Sans** as a fallback. Do not substitute clean sans-serifs (Inter, Public Sans, etc.) — doing so collapses the wireframe aesthetic immediately.

- **Headlines (Caveat, 24–32px, bold):** Page and section titles. Slightly oversized to mimic marker-on-whiteboard writing.
- **Body (Kalam, 14–18px, regular):** Paragraphs, descriptions, and form helper text. Use Lorem Ipsum or visibly placeholder copy ("Greeking is fine here") rather than real-sounding content.
- **Labels (Kalam, 12–14px, bold):** Button text, form labels, navigation. Slightly tighter line-height to feel deliberate.
- **Annotations (Caveat, 14px):** Reserved for sticky-note callouts — "needs review," "use real copy here," "open question."

## Layout & Spacing

The layout is generous, asymmetric, and sketch-friendly. Use an 8px base grid for consistency, but resist pixel-perfect alignment — wireframes should feel hand-placed, not auto-laid-out.

- **Rhythm:** 8px base; the 4px half-step is permitted only for inline icons against text.
- **Containers:** Wide outer margins (24px+) and generous internal padding (24px) keep the "paper" visible around content blocks.
- **Density:** Bias toward sparse layouts. A wireframe's job is to surface the most important elements — adding density means decisions are being made too early.
- **Grid:** A loose 12-column grid is appropriate but should not be visible. No alignment guides, snap lines, or background grids in the rendered output.

## Elevation & Depth

There is no elevation. Wireframes are flat by definition — depth implies polish, and polish implies done.

- **No drop shadows.** Anywhere. Ever.
- **No gradients.** Solid fills only.
- **Hierarchy is conveyed by:** stroke weight (thicker borders for primary containers), spacing (more whitespace around important elements), and type size — never by light, color, or blur.
- **The single permitted exception:** sticky-note annotations may use a 1px offset solid border in `secondary` to suggest a piece of paper resting on the canvas.

## Shapes

Corners are sharp or barely-rounded. The brain reads rounded corners as "designed"; sharp corners read as "drafted." The only exceptions are circular avatars and pill-shaped tags — these conventions are universal enough that their roundness does not break the wireframe reading.

- **Containers, cards, inputs, buttons:** 0px corner radius (`rounded.none`).
- **Sticky-note annotations:** 2px (`rounded.sm`) — barely enough to suggest a torn paper edge.
- **Avatars and pill tags:** Full circle (`rounded.full`).
- **Borders are 1px or 2px solid lines in `primary`.** Where the spec calls for a "dashed line" — section dividers, image-placeholder X-boxes, drop targets — render the stroke as 1px dashed in `neutral`. (Border colors are conveyed in prose only; the spec's component schema does not include a `borderColor` token.)

## Components

### Buttons

Primary buttons are solid black-ink fills with paper-colored labels. Secondary buttons are paper-colored with a 1px black border. Both use sharp corners and the bold label typography. On hover, the primary button shifts to `secondary` gray rather than tinting — the change should feel like a stamp re-pressed in lighter ink, not a glow.

### Inputs

Text inputs and text areas are open rectangles with a 1px primary border on a paper background. Labels sit above the input, never inside as floating placeholders. Helper text below uses `caption-meta`. Error states use `error-note` text and a 1px solid border in `error` — no red fill, no shake animations.

### Cards & Containers

Cards are 1px-bordered rectangles in `primary` ink on a `surface` background. No shadow, no hover lift, no rounded corners. A card's border should read as a hand-drawn line, not a CSS shadow trick.

### Placeholders

The `placeholder-box` component is the workhorse of this system. Use it for:

- **Image placeholders:** A `surface-muted` rectangle with a 1px dashed `neutral` border, an "X" diagonal line crossing the box corner-to-corner, and the label "Image" centered in `body-sm`.
- **Video placeholders:** Same as image, but labeled "Video" with a small play-triangle glyph drawn as an outline.
- **Chart placeholders:** Same rectangle with the label "Chart: [type]" and a few stub axis lines in `neutral`. Do not render actual data.

### Annotations

Sticky-note annotations are the **only** colored element on the page. Use them to call out open questions, designer notes, or items that need real content. They should sit slightly off-axis (rotation: -1deg to 1deg) and use the `annotation` typography. Examples: "TODO: confirm copy with legal," "Mike to review icon set," "use customer's real data here."

### Lists & Navigation

Navigation is rendered as plain text labels in `label-md`, separated by generous spacing. No active-state pill, no underline animation. The active item is indicated by a 2px solid bottom border in `primary`.

### Dividers

Section dividers are 1px solid lines in `neutral`. For "torn paper" or "fold" suggestions between major sections, use a row of repeating dashes — but do not overuse.

## Do's and Don'ts

- **Do** use Lorem Ipsum or visibly placeholder copy. The audience should never mistake the draft for real content.
- **Do** add sticky-note annotations to flag any decision that has not yet been made.
- **Do** leave generous whitespace. Sparse beats dense in a wireframe.
- **Don't** use any color other than the grayscale palette and the single sticky-note yellow.
- **Don't** add drop shadows, gradients, glows, or any other "depth" effects.
- **Don't** round corners beyond 2px (sticky notes only).
- **Don't** substitute clean sans-serif fonts for the handwritten stack — the entire effect collapses.
- **Don't** use real product photography or stock imagery. Use the `placeholder-box` component instead.
- **Don't** add motion, transitions, or hover animations beyond a simple color swap.
- **Don't** treat wireframe output as final UI. The whole point of this system is to look provisional.
