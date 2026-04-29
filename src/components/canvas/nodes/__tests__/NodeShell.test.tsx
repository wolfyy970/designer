/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NodeShell from '../NodeShell';

vi.mock('@xyflow/react', () => ({
  Handle: ({ className, type }: { className?: string; type: string }) => (
    <div data-testid={`handle-${type}`} className={className} />
  ),
  Position: { Left: 'left', Right: 'right' },
}));

describe('NodeShell', () => {
  afterEach(() => cleanup());

  it('emits success handle affordance classes for configured nodes', () => {
    const { getByTestId } = render(
      <NodeShell
        nodeId="node-1"
        nodeType="input"
        selected={false}
        width="w-node"
        status="filled"
        handleColor="green"
      >
        <div />
      </NodeShell>,
    );

    expect(getByTestId('handle-target').className).toContain('canvas-handle-success');
    expect(getByTestId('handle-source').className).toContain('canvas-handle-success');
    expect(getByTestId('handle-target').className).toContain('canvas-handle-cutout');
    expect(getByTestId('handle-source').className).toContain('canvas-handle-cutout');
  });

  it('emits warning handle affordance classes by default', () => {
    const { getByTestId } = render(
      <NodeShell
        nodeId="node-1"
        nodeType="input"
        selected={false}
        width="w-node"
        status="empty"
      >
        <div />
      </NodeShell>,
    );

    expect(getByTestId('handle-target').className).toContain('canvas-handle-warning');
    expect(getByTestId('handle-source').className).toContain('canvas-handle-warning');
  });

  it('allows target and source handles to carry separate readiness states', () => {
    const { getByTestId } = render(
      <NodeShell
        nodeId="node-1"
        nodeType="preview"
        selected={false}
        width="w-node"
        status="processing"
        targetHandleColor="green"
        sourceHandleColor="amber"
      >
        <div />
      </NodeShell>,
    );

    expect(getByTestId('handle-target').className).toContain('canvas-handle-success');
    expect(getByTestId('handle-source').className).toContain('canvas-handle-warning');
  });
});
