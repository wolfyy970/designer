---
name: Accessibility basics
description: Semantic HTML, keyboard use, ARIA when needed, contrast, and focus visibility for inclusive static pages
tags:
  - accessibility
  - a11y
  - wcag
  - aria
  - semantic
  - keyboard
  - focus
when: auto
---

# Accessibility basics

Apply when building HTML that real users navigate with keyboard, screen readers, or zoom.

## Rules of thumb

- Use native interactive elements (`button`, `a`, `input`, `label`) before ARIA.
- Every form control has a visible label (or `aria-label` with a clear purpose).
- Visible `:focus` styles; do not remove outlines without replacing them.
- Meaningful heading order (`h1` → `h2` → …); do not skip levels for styling.
- Images that convey information need `alt`; decorative images use `alt=""`.
- Color is not the only signal for state (errors, success, required fields).
- Target touch areas roughly 44×44px where practical.

## Quick tests

- Tab through the page: order matches visual order; no keyboard traps.
- Zoom 200%: content remains usable without horizontal scroll unless intended.
