/**
 * Artifact integrity: does the generated file tree actually contain everything
 * the entry document references?
 *
 * **Why this exists.** An agentic build can be interrupted — the stream-idle
 * watchdog aborting a stalled turn, a provider error, a browser disconnect.
 * The run then ends with a *partial* tree: `index.html` referencing
 * `styles.css` and `app.js` that were never written. Nothing errored from the
 * preview's point of view, so the iframe faithfully renders that tree — as an
 * unstyled, broken-looking page. To the viewer, "the agent built something
 * crap" is indistinguishable from "the build was cut off".
 *
 * This check makes the difference visible. It is deliberately about the
 * *artifact*, not about any particular failure cause, so it also catches a
 * truncated write or a mis-planned file list.
 *
 * Pure — no DOM, no Node. Reuses the same path resolution the bundler and the
 * preview URL server use, so "referenced" means the same thing everywhere.
 */

import { resolvePreviewEntryPath } from './preview-entry';
import { resolveVirtualAssetPath } from './resolve-virtual-asset-path';

/** `href="…"` or `src="…"` inside the entry document. */
const LOCAL_REF_RE = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;

export interface ArtifactIntegrity {
  /** Entry document the check used, or null when the tree has no HTML entry. */
  entry: string | null;
  /** Referenced paths with no matching file in the tree. */
  missing: string[];
  /** True when a referenced asset is absent — the render will look wrong. */
  incomplete: boolean;
}

/**
 * Names that are legitimately not files in the virtual tree: in-document
 * fragment links (`#section`), which `resolveVirtualAssetPath` already drops,
 * plus the empty and root refs.
 */
function isIgnorable(ref: string): boolean {
  const trimmed = ref.trim();
  return trimmed === '' || trimmed === '/' || trimmed.startsWith('#');
}

/**
 * Find local assets referenced by the entry document that the tree does not
 * contain. External URLs, data URIs, and fragment links are not "missing" —
 * they are simply not our files.
 */
export function checkArtifactIntegrity(files: Record<string, string>): ArtifactIntegrity {
  const entry = resolvePreviewEntryPath(files);
  const html = files[entry];
  if (!html) return { entry: null, missing: [], incomplete: false };

  const missing = new Set<string>();
  for (const match of html.matchAll(LOCAL_REF_RE)) {
    const ref = match[1];
    if (isIgnorable(ref)) continue;
    const key = resolveVirtualAssetPath(ref, entry);
    if (!key) continue; // external / data URI / non-path scheme
    if (!(key in files)) missing.add(key);
  }

  const sorted = [...missing].sort();
  return { entry, missing: sorted, incomplete: sorted.length > 0 };
}

/** Short human sentence for a banner. Empty when the artifact is complete. */
export function describeArtifactIntegrity(result: ArtifactIntegrity): string {
  if (!result.incomplete) return '';
  const list = result.missing.slice(0, 3).join(', ');
  const more = result.missing.length > 3 ? `, +${result.missing.length - 3} more` : '';
  return `Build incomplete — ${result.missing.length} referenced file${
    result.missing.length === 1 ? '' : 's'
  } missing (${list}${more}). The preview below is not the finished design.`;
}
