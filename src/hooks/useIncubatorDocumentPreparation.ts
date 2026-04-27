import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { extractDesignSystem, generateInternalContext } from '../api/client';
import { NODE_TYPES } from '../constants/canvas';
import {
  createInitialTaskStreamState,
  type TaskStreamState,
} from './task-stream-state';
import { createTaskStreamSession } from './task-stream-session';
import { useCanvasStore } from '../stores/canvas-store';
import { useSpecStore } from '../stores/spec-store';
import { useThinkingDefaultsStore } from '../stores/thinking-defaults-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import type { DesignSystemNodeData } from '../types/canvas-data';
import type { WorkspaceNode } from '../types/workspace-graph';
import { normalizeError } from '../lib/error-utils';
import {
  computeDesignMdSourceHash,
  designMdSourceHasInput,
  designSystemSourceFromNodeData,
  isDesignMdDocumentStale,
} from '../lib/design-md';
import {
  computeInternalContextSourceHash,
  isInternalContextDocumentStale,
} from '../lib/internal-context';
import {
  buildDesignMdDocument,
  buildFailedDesignMdDocument,
} from '../lib/design-md-document';

type TaskStreamStateSetter = Dispatch<SetStateAction<TaskStreamState>>;
type BooleanSetter = Dispatch<SetStateAction<boolean>>;
type NullableStringSetter = Dispatch<SetStateAction<string | null>>;

export interface UseIncubatorDocumentPreparationOptions {
  incubatorId: string;
  providerId?: string | null;
  modelId?: string | null;
  setTaskStreamState: TaskStreamStateSetter;
  setContextGenerating: BooleanSetter;
  setDesignMdGeneratingNodeId: NullableStringSetter;
}

export interface DesignSystemDocumentForPrompt {
  nodeId: string;
  title: string;
  content: string;
}

export function useIncubatorDocumentPreparation({
  incubatorId,
  providerId,
  modelId,
  setTaskStreamState,
  setContextGenerating,
  setDesignMdGeneratingNodeId,
}: UseIncubatorDocumentPreparationOptions): {
  refreshInternalContext: () => Promise<string>;
  refreshDesignMdDocument: (nodeId: string) => Promise<string>;
  ensureDesignSystemDocuments: () => Promise<DesignSystemDocumentForPrompt[]>;
} {
  const refreshInternalContext = useCallback(async (): Promise<string> => {
    if (!providerId || !modelId) throw new Error('Connect a Model node first');
    const currentSpec = useSpecStore.getState().spec;
    const sourceHash = computeInternalContextSourceHash(currentSpec);
    setContextGenerating(true);
    setTaskStreamState({ ...createInitialTaskStreamState(), status: 'streaming' });
    let session: ReturnType<typeof createTaskStreamSession> | undefined;
    try {
      const taskSession = createTaskStreamSession({
        sessionId: `internal-context-${incubatorId}-${Date.now()}`,
        correlationId: crypto.randomUUID(),
        onPatch: (patch) => setTaskStreamState((prev) => ({ ...prev, ...patch })),
      });
      session = taskSession;
      const thinkingOverride = useThinkingDefaultsStore.getState().overrides['internal-context'];
      const response = await generateInternalContext(
        {
          spec: currentSpec,
          sourceHash,
          providerId,
          modelId,
          thinking: thinkingOverride,
        },
        { agentic: taskSession.callbacks },
      );
      useSpecStore.getState().setInternalContextDocument({
        content: response.result,
        sourceHash,
        generatedAt: new Date().toISOString(),
        providerId,
        modelId,
      });
      return response.result;
    } catch (err) {
      const message = normalizeError(err, 'Internal context generation failed');
      const existing = useSpecStore.getState().spec.internalContextDocument;
      useSpecStore.getState().setInternalContextDocument({
        content: existing?.content ?? '',
        sourceHash,
        generatedAt: existing?.generatedAt ?? new Date().toISOString(),
        providerId,
        modelId,
        error: message,
      });
      throw err;
    } finally {
      void session?.finalize();
      setTaskStreamState(createInitialTaskStreamState('idle'));
      setContextGenerating(false);
    }
  }, [incubatorId, modelId, providerId, setContextGenerating, setTaskStreamState]);

  const refreshDesignMdDocument = useCallback(async (nodeId: string): Promise<string> => {
    if (!providerId || !modelId) throw new Error('Connect a Model node first');
    const currentNode = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    if (!currentNode || currentNode.type !== NODE_TYPES.DESIGN_SYSTEM) {
      throw new Error('Design System node is no longer available');
    }
    const data = (currentNode.data ?? {}) as DesignSystemNodeData;
    const source = designSystemSourceFromNodeData(data);
    if (!designMdSourceHasInput(source)) throw new Error('Design System node has no source content');
    const sourceHash = computeDesignMdSourceHash(source);
    setDesignMdGeneratingNodeId(nodeId);
    setTaskStreamState({ ...createInitialTaskStreamState(), status: 'streaming' });
    let session: ReturnType<typeof createTaskStreamSession> | undefined;
    try {
      const taskSession = createTaskStreamSession({
        sessionId: `design-md-${nodeId}-${Date.now()}`,
        correlationId: crypto.randomUUID(),
        onPatch: (patch) => setTaskStreamState((prev) => ({ ...prev, ...patch })),
      });
      session = taskSession;
      const thinkingOverride = useThinkingDefaultsStore.getState().overrides['design-system'];
      const response = await extractDesignSystem(
        {
          title: source.title,
          content: source.content,
          images: [...(source.images ?? [])],
          sourceHash,
          providerId,
          modelId,
          thinking: thinkingOverride,
        },
        { agentic: taskSession.callbacks },
      );
      const document = buildDesignMdDocument({
        content: response.result,
        sourceHash,
        providerId,
        modelId,
        lint: response.lint,
      });
      useCanvasStore.getState().updateNodeData(nodeId, { designMdDocument: document });
      return response.result;
    } catch (err) {
      const message = normalizeError(err, 'DESIGN.md generation failed');
      const existing = ((useCanvasStore.getState().nodes.find((n) => n.id === nodeId)?.data ?? {}) as DesignSystemNodeData).designMdDocument;
      useCanvasStore.getState().updateNodeData(nodeId, {
        designMdDocument: buildFailedDesignMdDocument({
          existing,
          sourceHash,
          providerId,
          modelId,
          error: message,
        }),
      });
      throw err;
    } finally {
      void session?.finalize();
      setTaskStreamState(createInitialTaskStreamState('idle'));
      setDesignMdGeneratingNodeId(null);
    }
  }, [modelId, providerId, setDesignMdGeneratingNodeId, setTaskStreamState]);

  const ensureDesignSystemDocuments = useCallback(async (): Promise<DesignSystemDocumentForPrompt[]> => {
    const out: DesignSystemDocumentForPrompt[] = [];
    const currentNodes = useCanvasStore.getState().nodes;
    const currentDomainWiring = useWorkspaceDomainStore.getState().incubatorWirings[incubatorId];
    const nodeById = new Map(currentNodes.map((n) => [n.id, n] as const));
    const scopedIds = currentDomainWiring?.designSystemNodeIds ?? [];
    const candidates: (WorkspaceNode | undefined)[] = scopedIds.length > 0
      ? scopedIds.map((nodeId) => nodeById.get(nodeId))
      : currentNodes.filter((node) =>
          node.type === NODE_TYPES.DESIGN_SYSTEM &&
          useCanvasStore.getState().edges.some((edge) => edge.source === node.id && edge.target === incubatorId),
        );
    for (const node of candidates) {
      if (!node || node.type !== NODE_TYPES.DESIGN_SYSTEM) continue;
      let data = (node.data ?? {}) as DesignSystemNodeData;
      const source = designSystemSourceFromNodeData(data);
      if (!designMdSourceHasInput(source)) continue;
      if (!data.designMdDocument?.content || data.designMdDocument.error || isDesignMdDocumentStale(source, data.designMdDocument)) {
        await refreshDesignMdDocument(node.id);
        data = ((useCanvasStore.getState().nodes.find((n) => n.id === node.id)?.data ?? {}) as DesignSystemNodeData);
      }
      const content = data.designMdDocument?.content?.trim();
      if (content) {
        out.push({ nodeId: node.id, title: data.title || 'Design System', content });
      }
    }
    return out;
  }, [incubatorId, refreshDesignMdDocument]);

  return {
    refreshInternalContext,
    refreshDesignMdDocument,
    ensureDesignSystemDocuments,
  };
}

export function needsInternalContextRefresh(): boolean {
  const currentSpec = useSpecStore.getState().spec;
  const currentDoc = currentSpec.internalContextDocument;
  return !currentDoc?.content || Boolean(currentDoc.error) || isInternalContextDocumentStale(currentSpec, currentDoc);
}
