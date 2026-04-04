import { useCallback } from 'react';
import type { Connection } from '@xyflow/react';
import { useCanvasStore } from '../../../stores/canvas-store';
import { nodeById } from '../../../workspace/graph-queries';
import { useGenerationStore, getActiveResult } from '../../../stores/generation-store';
import { useSpecStore } from '../../../stores/spec-store';
import { loadCode } from '../../../services/idb-storage';
import { captureScreenshot, prepareIframeContent } from '../../../lib/iframe-utils';
import { generateId, now } from '../../../lib/utils';

/**
 * When a variant node connects to an existing design node,
 * capture a screenshot and add it as a reference image.
 * The edge persists as a visible feedback-loop connection.
 */
async function capturePreviewIntoExistingDesign(previewNodeId: string) {
  const snap = useCanvasStore.getState();
  const node = nodeById(snap, previewNodeId);
  const vsId = node?.data.strategyId as string | undefined;
  if (!vsId) return;

  const result = getActiveResult(useGenerationStore.getState(), vsId);
  if (!result) return;

  // Load code from IndexedDB
  const code = await loadCode(result.id);
  if (!code) return;

  useSpecStore.getState().setCapturingImage('existing-design');
  try {
    const htmlContent = prepareIframeContent(code);
    const dataUrl = await captureScreenshot(htmlContent);
    useSpecStore.getState().addImage('existing-design', {
      id: generateId(),
      filename: `preview-${result.metadata?.model ?? 'design'}.png`,
      dataUrl,
      description: result.metadata?.model
        ? `Generated preview (${result.metadata.model})`
        : 'Generated design preview',
      createdAt: now(),
    });
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to capture preview screenshot:', err);
    }
  } finally {
    useSpecStore.getState().setCapturingImage(null);
  }
}

/**
 * Hook to manage feedback loop connections, specifically capturing
 * screenshots when a Variant node connects to the Existing Design node.
 */
export function useFeedbackLoopConnection() {
  const storeOnConnect = useCanvasStore((s) => s.onConnect);

  const handleConnect = useCallback(
    (connection: Connection) => {
      // Create the edge via the store
      storeOnConnect(connection);

      const snap = useCanvasStore.getState();
      const sourceNode = connection.source ? nodeById(snap, connection.source) : undefined;
      const targetNode = connection.target ? nodeById(snap, connection.target) : undefined;
      
      if (
        sourceNode?.type === 'preview' &&
        targetNode?.type === 'existingDesign' &&
        connection.source &&
        connection.target
      ) {
        capturePreviewIntoExistingDesign(connection.source);
      }

      // Re-layout after new edge
      const cs = useCanvasStore.getState();
      if (cs.autoLayout) cs.applyAutoLayout();
    },
    [storeOnConnect]
  );

  return { handleConnect };
}
