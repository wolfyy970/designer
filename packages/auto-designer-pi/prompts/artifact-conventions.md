---
description: Use when building static web artifacts in the virtual workspace. Covers what artifacts to produce, the framework / TypeScript / CDN restrictions, the Google Fonts allowlist, and the default file structure conventions (index.html as preview entry, relative cross-links, all referenced assets must exist).
---

# Artifact Conventions

These are conventions for **what to build** in the virtual workspace. The shell environment that runs your tools (just-bash, available built-ins, no host binaries) is described in the system prompt's `<sandbox_environment>` section — this file is about the artifacts themselves.

## Available
- A virtual **directory tree**: multiple `.html` pages if needed, plus `.css`, `.js`, images, fonts, `.svg`, etc.
- Default preview entry is `index.html` when present — create it for most artifacts so preview lands predictably.

## Not available
- React, Vue, Svelte, or any framework
- TypeScript (write plain JS)
- External CDN links **except** allowlisted **Google Fonts**: `https://fonts.googleapis.com/...` stylesheets and `https://fonts.gstatic.com/...` font files (loaded when the user's preview browser fetches the CSS — tools here do not download them)
- Any other hosted stylesheets, scripts, or assets from the network

## File structure
- Pick splits and folder names that keep the design **easy to edit** (e.g. `css/common.css`, `pages/about.html`, `js/main.js`) — **no fixed trio** of files.
- Cross-link with **relative paths** so multi-page navigation works in preview.
- Every referenced local asset must exist in this workspace.
