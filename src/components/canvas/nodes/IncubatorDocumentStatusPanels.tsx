import { Eye, RefreshCw } from 'lucide-react';
import { Button } from '@ds/components/ui/button';
import { StatusPanel, type StatusPanelTone } from '@ds/components/ui/status-panel';
import { getDesignSystemNodeData } from '../../../lib/canvas-node-data';
import {
  designMdSourceHasInput,
  designSystemSourceFromNodeData,
  type DesignMdStatus,
  getDesignMdStatus,
} from '../../../lib/design-md';
import type { DesignSpec } from '../../../types/spec';
import type { WorkspaceNode } from '../../../types/workspace-graph';

function designMdStatusLabel(status: DesignMdStatus): string {
  if (status === 'missing') return 'needs generation';
  if (status === 'generating') return 'generating...';
  return status;
}

function documentStatusLabel(status: string): string | undefined {
  if (status === 'ready') return undefined;
  if (status === 'generating') return 'generating...';
  return status;
}

function designMdStatusTone(status: DesignMdStatus): StatusPanelTone {
  if (status === 'ready') return 'success';
  if (status === 'error') return 'error';
  if (status === 'generating') return 'accent';
  return 'warning';
}

interface IncubatorDocumentStatusPanelsProps {
  internalContextDoc: DesignSpec['internalContextDocument'];
  internalContextStatus: string;
  internalContextStatusLabel: string | undefined;
  internalContextStatusTone: StatusPanelTone;
  internalContextCanView: boolean;
  internalContextCanRefresh: boolean;
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
                aria-label="Refresh design specification"
                title="Refresh design specification"
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
        const source = ds ? designSystemSourceFromNodeData(ds) : {};
        const doc = ds?.designMdDocument;
        const hasSourceInput = designMdSourceHasInput(source);
        const dsStatus = getDesignMdStatus(source, designMdGeneratingNodeId === node.id, doc);
        const optional =
          !hasSourceInput && !doc?.content && dsStatus !== 'generating' && dsStatus !== 'error';
        const docHasContent = Boolean(doc?.content?.trim());
        const canRefreshDesignMd =
          canRunDocumentTask &&
          !optional &&
          hasSourceInput &&
          (dsStatus === 'missing' ||
            dsStatus === 'stale' ||
            dsStatus === 'error' ||
            dsStatus === 'generating');
        return (
          <StatusPanel
            key={node.id}
            title={`${ds?.title || 'Design System'} DESIGN.md`}
            status={optional ? 'optional' : documentStatusLabel(designMdStatusLabel(dsStatus))}
            tone={optional ? 'neutral' : designMdStatusTone(dsStatus)}
            animated={dsStatus === 'generating'}
            density="compact"
            actions={docHasContent || canRefreshDesignMd ? (
              <>
                {docHasContent ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="iconSm"
                    aria-label={`View ${ds?.title || 'Design System'} DESIGN.md`}
                    title={`View ${ds?.title || 'Design System'} DESIGN.md`}
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
                    aria-label={`Refresh ${ds?.title || 'Design System'} DESIGN.md`}
                    title={`Refresh ${ds?.title || 'Design System'} DESIGN.md`}
                    onClick={() => onRefreshDesignMdDocument(node.id)}
                  >
                    <RefreshCw size={11} aria-hidden />
                  </Button>
                ) : null}
              </>
            ) : undefined}
          >
            {doc?.error && dsStatus !== 'generating' ? (
              <span className="text-error">{doc.error}</span>
            ) : null}
          </StatusPanel>
        );
      })}
    </div>
  );
}
