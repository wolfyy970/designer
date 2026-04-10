---
name: Sandbox environment guide
description: Use when building inside the virtual filesystem sandbox. Covers available file types, what tools and frameworks are NOT available, Google Fonts allowlist, and file structure best practices.
tags:
  - design
when: auto
---

# Sandbox Environment

You are building inside a virtual filesystem. There is no package manager, no build tool, and agent tools cannot open arbitrary network connections.

## Available
- A virtual **directory tree**: multiple `.html` pages if needed, plus `.css`, `.js`, images, fonts, `.svg`, etc.
- Default preview entry is `index.html` when present — create it for most artifacts so preview lands predictably.

## Not available
- npm, pnpm, yarn, or any package manager
- Vite, webpack, esbuild, or any bundler/build tool
- React, Vue, Svelte, or any framework
- TypeScript (write plain JS)
- External CDN links **except** allowlisted **Google Fonts**: `https://fonts.googleapis.com/...` stylesheets and `https://fonts.gstatic.com/...` font files (loaded when the user's preview browser fetches the CSS — tools here do not download them)
- Any other hosted stylesheets, scripts, or assets from the network

## File structure
- Pick splits and folder names that keep the design **easy to edit** (e.g. `css/common.css`, `pages/about.html`, `js/main.js`) — **no fixed trio** of files.
- Cross-link with **relative paths** so multi-page navigation works in preview.
- Every referenced local asset must exist in this workspace.
