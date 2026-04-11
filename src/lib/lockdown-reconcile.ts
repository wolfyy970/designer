import { NODE_TYPES } from '../constants/canvas';
import { useCanvasStore } from '../stores/canvas-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { LOCKDOWN_MODEL_ID, LOCKDOWN_PROVIDER_ID } from './lockdown-model';

/** Align persisted canvas model nodes and domain profiles with lockdown pinning. */
export function reconcileLockdownCanvasState(): void {
  const { nodes, updateNodeData } = useCanvasStore.getState();
  const domain = useWorkspaceDomainStore.getState();

  for (const n of nodes) {
    if (n.type !== NODE_TYPES.MODEL) continue;
    updateNodeData(n.id, {
      providerId: LOCKDOWN_PROVIDER_ID,
      modelId: LOCKDOWN_MODEL_ID,
    });
    const prof = domain.modelProfiles[n.id];
    domain.upsertModelProfile(n.id, {
      providerId: LOCKDOWN_PROVIDER_ID,
      modelId: LOCKDOWN_MODEL_ID,
      title: prof?.title,
      thinkingLevel: prof?.thinkingLevel,
    });
  }
}
