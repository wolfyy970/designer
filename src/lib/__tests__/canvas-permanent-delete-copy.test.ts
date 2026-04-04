import { describe, expect, it } from 'vitest';
import {
  hypothesisDeleteCopy,
  keyboardMultiDeleteCopy,
  sectionCardDeleteCopy,
} from '../canvas-permanent-delete-copy';
import type { WorkspaceNode } from '../../types/workspace-graph';

describe('canvas-permanent-delete-copy', () => {
  it('sectionCardDeleteCopy includes section title', () => {
    const { title } = sectionCardDeleteCopy('Brief');
    expect(title).toContain('Brief');
  });

  it('hypothesisDeleteCopy pluralizes variants when count > 1', () => {
    const one = hypothesisDeleteCopy(1);
    expect(one.description).toContain('1 connected variant');
    const many = hypothesisDeleteCopy(2);
    expect(many.description).toContain('2 connected variants');
    const none = hypothesisDeleteCopy(0);
    expect(none.description).not.toContain('connected');
  });

  it('keyboardMultiDeleteCopy uses multi-node title for two hypotheses', () => {
    const nodes: WorkspaceNode[] = [
      { id: 'h1', type: 'hypothesis', position: { x: 0, y: 0 }, data: {} },
      { id: 'h2', type: 'hypothesis', position: { x: 0, y: 0 }, data: {} },
    ];
    const { title } = keyboardMultiDeleteCopy(nodes, nodes, []);
    expect(title).toContain('2 selected nodes');
    expect(title).toContain('Remove');
  });
});
