import { z } from 'zod';

/** Wire shape for `HypothesisWorkspaceApiPayload.snapshot` (nodes/edges arrays, elements untyped). */
export const WorkspaceSnapshotSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

export type WorkspaceSnapshotWire = z.infer<typeof WorkspaceSnapshotSchema>;
