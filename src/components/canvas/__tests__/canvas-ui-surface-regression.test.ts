/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { PreviewHoverOverlay } from '../nodes/PreviewHoverOverlay';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function readCanvasNodeSources(): string[] {
  const nodesDir = resolve(repoRoot, 'src/components/canvas/nodes');
  return readdirSync(nodesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => {
      const path = `src/components/canvas/nodes/${entry.name}`;
      return `${path}\n${readRepoFile(path)}`;
    });
}

describe('canvas UI surface regressions', () => {
  it('does not dim the canvas when the run inspector is open', () => {
    const source = readRepoFile('src/components/canvas/CanvasWorkspace.tsx');

    expect(source).not.toContain('z-40 bg-overlay');
    expect(source).not.toContain('runInspectorPreviewNodeId != null ? (');
  });

  it('keeps modal/dialog content on opaque design-system surfaces', () => {
    const sources = [
      'src/components/shared/SettingsModal.tsx',
      'src/components/canvas/variant-run/DesignDebugExportDialog.tsx',
      'src/components/shared/PermanentDeleteConfirmDialog.tsx',
    ].map((path) => `${path}\n${readRepoFile(path)}`);

    const forbidden = [
      'bg-surface/60',
      'bg-surface/40',
      'bg-bg/50',
      'bg-surface/70',
      'bg-surface-nested/30',
      'bg-surface-floating',
    ];

    for (const source of sources) {
      for (const token of forbidden) {
        expect(source).not.toContain(token);
      }
    }
  });

  it('routes app modals and confirmations through the shared dialog viewport', () => {
    const sources = [
      'src/components/shared/Modal.tsx',
      'src/components/shared/PermanentDeleteConfirmDialog.tsx',
    ].map((path) => `${path}\n${readRepoFile(path)}`);

    for (const source of sources) {
      expect(source).toContain('DialogViewport');
      expect(source).not.toContain('fixed inset-0 z-');
      expect(source).not.toContain('createPortal(');
    }
  });

  it('does not use native select controls inside transformed canvas nodes', () => {
    for (const source of readCanvasNodeSources()) {
      expect(source).not.toContain('<select');
    }
  });

  it('keeps the preview hover scrim see-through', () => {
    // The scrim sits on top of the design being judged. `bg-overlay-heavy`
    // (92%) read as a blank panel and hid the artwork; `bg-overlay` (45%) keeps
    // the work visible while the Preview button stays legible on its own
    // secondary surface.
    //
    // Asserted by executing the component rather than grepping its source: the
    // source *mentions* `bg-overlay-heavy` in the doc comment explaining this
    // decision, so a text scan can't tell the class from the rationale.
    const Scrim = renderHoverOverlay();
    const classes = Scrim.classList;

    expect(classes.contains('bg-overlay')).toBe(true);
    expect(classes.contains('bg-overlay-heavy')).toBe(false);
  });
});

/** Render the scrim and return its root element. */
function renderHoverOverlay(): HTMLElement {
  // createElement, not JSX: this file is `.ts` (it also does fs scans).
  const { container } = render(
    createElement(PreviewHoverOverlay, { onClick: () => {}, ariaLabel: 'Open preview' }),
  );
  const el = container.firstElementChild;
  if (!el) throw new Error('PreviewHoverOverlay rendered nothing');
  cleanup();
  return el as HTMLElement;
}
