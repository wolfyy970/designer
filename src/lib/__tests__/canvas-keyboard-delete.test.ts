import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_DELETE_PROTECTED_NODE_TYPES,
  removableWorkspaceNodesFromFlowSelection,
} from '../canvas-keyboard-delete';
import type { WorkspaceNode } from '../../types/workspace-graph';

describe('canvas-keyboard-delete', () => {
  it('excludes protected node types', () => {
    expect(KEYBOARD_DELETE_PROTECTED_NODE_TYPES.has('incubator')).toBe(true);
    expect(KEYBOARD_DELETE_PROTECTED_NODE_TYPES.has('designBrief')).toBe(true);
    expect(KEYBOARD_DELETE_PROTECTED_NODE_TYPES.has('hypothesis')).toBe(false);
    expect(KEYBOARD_DELETE_PROTECTED_NODE_TYPES.has('designSystem')).toBe(false);
  });

  it('removableWorkspaceNodesFromFlowSelection keeps deletable types and drops protected', () => {
    const store: WorkspaceNode[] = [
      { id: 'ds-1', type: 'designSystem', position: { x: 0, y: 0 }, data: {} },
      { id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: {} },
      { id: 'h-1', type: 'hypothesis', position: { x: 0, y: 0 }, data: {} },
    ];
    const flowSelected = [{ id: 'ds-1' }, { id: 'inc-1' }, { id: 'h-1' }];
    const removable = removableWorkspaceNodesFromFlowSelection(flowSelected, store);
    expect(removable.map((n) => n.id)).toEqual(['ds-1', 'h-1']);
  });

  it('drops ids missing from store', () => {
    const store: WorkspaceNode[] = [
      { id: 'a', type: 'preview', position: { x: 0, y: 0 }, data: {} },
    ];
    expect(
      removableWorkspaceNodesFromFlowSelection([{ id: 'ghost' }, { id: 'a' }], store).map((n) => n.id),
    ).toEqual(['a']);
  });
});
