import { describe, it, expect } from 'vitest';
import { WorkspaceSnapshotSchema } from '../workspace-snapshot-schema';

describe('WorkspaceSnapshotSchema', () => {
  it('accepts nodes and edges arrays', () => {
    const r = WorkspaceSnapshotSchema.safeParse({
      nodes: [{ id: 'a' }],
      edges: [],
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-array nodes', () => {
    expect(WorkspaceSnapshotSchema.safeParse({ nodes: {}, edges: [] }).success).toBe(false);
  });
});
