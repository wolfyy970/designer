import { useEffect } from 'react';
import { useCompilerStore } from '../../../stores/compiler-store';
import { useGenerationStore } from '../../../stores/generation-store';
import { useCanvasStore } from '../../../stores/canvas-store';
import { GENERATION_STATUS } from '../../../constants/generation';
import { syncDomainForRemovedNode } from '../../../workspace/domain-commands';
import {
  applyOrphanRemovalToGraph,
  collectOrphanNodeIds,
  pruneDimensionMapsToLinkedRefIds,
  staleGeneratingResultIds,
} from '../../../workspace/canvas-orchestrator';

/**
 * Lightweight orchestrator: cleans up orphaned canvas nodes
 * whose backing data was removed from the compiler or generation stores.
 *
 * Node creation/sync is now driven by the nodes themselves:
 * - CompilerNode.handleCompile → syncAfterCompile
 * - HypothesisNode.handleGenerate → syncAfterGenerate
 *
 * Effect deps include the graph (`nodes`, `edges`) so orphan cleanup and dimension-map
 * pruning run when only the canvas graph changes, not only when compiler/generation slices change.
 */
export function useCanvasOrchestrator() {
  const dimensionMaps = useCompilerStore((s) => s.dimensionMaps);
  const results = useGenerationStore((s) => s.results);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  useEffect(() => {
    const isCompiling = useCompilerStore.getState().isCompiling;
    const orphanIds = collectOrphanNodeIds(nodes, dimensionMaps, results, isCompiling);

    let graphNodes = nodes;
    let graphEdges = edges;
    if (orphanIds.size > 0) {
      for (const oid of orphanIds) {
        const node = nodes.find((n) => n.id === oid);
        if (node) syncDomainForRemovedNode(node);
      }
      const applied = applyOrphanRemovalToGraph(nodes, edges, orphanIds);
      graphNodes = applied.nodes;
      graphEdges = applied.edges;
      useCanvasStore.setState({ nodes: graphNodes, edges: graphEdges });
    }

    // Drop dimension-map strategies with no hypothesis card (fixes stale counts after non–removeNode deletes)
    if (!isCompiling) {
      const maps = useCompilerStore.getState().dimensionMaps;
      const { nextMaps, changed } = pruneDimensionMapsToLinkedRefIds(graphNodes, maps);
      if (changed) useCompilerStore.setState({ dimensionMaps: nextMaps });
    }

    // Clean stale "generating" results left over from a previous session.
    // Only when not actively generating — isGenerating is NOT persisted,
    // so it defaults to false on page load (catches stale results) but
    // is true during active generation (prevents false "interrupted" errors).
    const isGenerating = useGenerationStore.getState().isGenerating;
    for (const id of staleGeneratingResultIds(results, isGenerating)) {
      useGenerationStore.getState().updateResult(id, {
        status: GENERATION_STATUS.ERROR,
        error: 'Generation interrupted by page reload',
      });
    }
  }, [dimensionMaps, results, nodes, edges]);
}
