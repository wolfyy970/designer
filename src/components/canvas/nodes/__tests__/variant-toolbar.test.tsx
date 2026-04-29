/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VariantToolbar from '../VariantToolbar';

const defaultProps = {
  variantName: 'Specification-rich deep filter',
  isArchived: false,
  isBestCurrent: false,
  hasCode: false,
  nodeId: 'preview-1',
  versionStackLength: 1,
  stackTotal: 1,
  stackIndex: 0,
  goNewer: vi.fn(),
  goOlder: vi.fn(),
  zoom: 1,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  resetZoom: vi.fn(),
  onDownload: vi.fn(),
  onDeleteVersion: vi.fn(),
  onExpand: vi.fn(),
  onToggleWorkspace: vi.fn(),
  isWorkspaceOpen: false,
  onRemove: vi.fn(),
};

describe('VariantToolbar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses a compact icon control for stopping generation', () => {
    render(
      <VariantToolbar
        {...defaultProps}
        showStopGeneration
        onStopGeneration={vi.fn()}
      />,
    );

    const stop = screen.getByRole('button', { name: 'Stop generation' });

    expect(stop.textContent).toBe('');
    expect(screen.queryByText('Stop')).toBeNull();
  });
});
