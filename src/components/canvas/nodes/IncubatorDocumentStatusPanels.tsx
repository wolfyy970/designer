import { Eye, RefreshCw } from 'lucide-react';
import { Button } from '@ds/components/ui/button';
import { StatusPanel, type StatusPanelTone } from '@ds/components/ui/status-panel';
import { getDesignSystemNodeData } from '../../../lib/canvas-node-data';
import {
  getDesignSystemEffectiveState,
  getDesignSystemDocumentUiState,
} from '../../../lib/design-md';
import type { DesignSpec } from '../../../types/spec';
import type { WorkspaceNode } from '../../../types/workspace-graph';

interface IncubatorDocumentStatusPanelsProps {
  internalContextDoc: DesignSpec['internalContextDocument'];
  internalContextStatus: string;
  internalContextStatusLabel: string | undefined;
  internalContextStatusTone: StatusPanelTone;
  internalContextCanView: boolean;
  internalContextCanRefresh: boolean;
  internalContextRefreshLabel?: string;
  contextGenerating: boolean;
  isCompiling: boolean;
  scopedDesignSystemNodes: WorkspaceNode[];
  canRunDocumentTask: boolean;
  designMdGeneratingNodeId: string | null;
  onViewInternalContext: () => void;
  onRefreshInternalContext: () => void;
  onViewDesignMdDocument: (nodeId: string) => void;
  onRefreshDesignMdDocument: (nodeId: string) => void;
}

export function IncubatorDocumentStatusPanels({
  internalContextDoc,
  internalContextStatus,
  internalContextStatusLabel,
  internalContextStatusTone,
  internalContextCanView,
  internalContextCanRefresh,
  internalContextRefreshLabel,
  contextGenerating,
  isCompiling,
  scopedDesignSystemNodes,
  canRunDocumentTask,
  designMdGeneratingNodeId,
  onViewInternalContext,
  onRefreshInternalContext,
  onViewDesignMdDocument,
  onRefreshDesignMdDocument,
}: IncubatorDocumentStatusPanelsProps) {
  return (
    <div className="space-y-1.5">
      <StatusPanel
        title="Design specification"
        status={internalContextStatusLabel}
        tone={internalContextStatusTone}
        animated={internalContextStatus === 'generating'}
        density="compact"
        actions={internalContextCanView || internalContextCanRefresh ? (
          <>
            {internalContextCanView ? (
              <Button
                type="button"
                variant="secondary"
                size="iconSm"
                aria-label="View design specification"
                title="View design specification"
                onClick={onViewInternalContext}
              >
                <Eye size={11} aria-hidden />
              </Button>
            ) : null}
            {internalContextCanRefresh ? (
              <Button
                type="button"
                variant="secondary"
                size="iconSm"
                disabled={isCompiling || contextGenerating}
                aria-label={internalContextRefreshLabel ?? 'Regenerate design specification'}
                title={internalContextRefreshLabel ?? 'Regenerate design specification'}
                onClick={onRefreshInternalContext}
              >
                <RefreshCw size={11} aria-hidden />
              </Button>
            ) : null}
          </>
        ) : undefined}
      >
        {internalContextDoc?.error && !contextGenerating ? (
          <span className="text-error">{internalContextDoc.error}</span>
        ) : null}
      </StatusPanel>

      {scopedDesignSystemNodes.length === 0 ? (
        <StatusPanel
          title="DESIGN.md"
          status="optional"
          tone="neutral"
          density="compact"
        />
      ) : scopedDesignSystemNodes.map((node) => {
        const ds = getDesignSystemNodeData(node);
        const doc = ds?.designMdDocument;
        const dsState = getDesignSystemEffectiveState(ds ?? {}, {
          generating: designMdGeneratingNodeId === node.id,
          document: doc,
        });
        const dsUiState = getDesignSystemDocumentUiState(ds ?? {}, {
          generating: designMdGeneratingNodeId === node.id,
          document: doc,
        });
        const dsStatus = dsState.designMdStatus;
        const docHasContent = dsUiState.canView;
        const canRefreshDesignMd =
          canRunDocumentTask &&
          dsUiState.canGenerate;
        return (
          <StatusPanel
            key={node.id}
            title="DESIGN.md"
            status={dsUiState.statusLabel}
            tone={dsUiState.tone}
            animated={dsStatus === 'generating'}
            density="compact"
            actions={docHasContent || canRefreshDesignMd ? (
              <>
                {docHasContent ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="iconSm"
                    aria-label="View DESIGN.md"
                    title="View DESIGN.md"
                    onClick={() => onViewDesignMdDocument(node.id)}
                  >
                    <Eye size={11} aria-hidden />
                  </Button>
                ) : null}
                {canRefreshDesignMd ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="iconSm"
                    disabled={isCompiling || contextGenerating || Boolean(designMdGeneratingNodeId)}
                    aria-label={dsUiState.actionLabel ?? 'Regenerate DESIGN.md'}
                    title={dsUiState.actionLabel ?? 'Regenerate DESIGN.md'}
                    onClick={() => onRefreshDesignMdDocument(node.id)}
                  >
                    <RefreshCw size={11} aria-hidden />
                  </Button>
                ) : null}
              </>
            ) : undefined}
          >
            {dsUiState.error && dsStatus !== 'generating' ? (
              <span className="text-error">{dsUiState.error}</span>
            ) : null}
          </StatusPanel>
        );
      })}
    </div>
  );
}
