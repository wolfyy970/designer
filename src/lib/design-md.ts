import type { DesignSystemNodeData } from '../types/canvas-data';
import type { DesignMdDocument } from '../types/workspace-domain';
import {
  DEFAULT_DESIGN_SYSTEM_SOURCE_MODE,
  isDesignSystemSourceMode,
  type DesignSystemSourceMode,
} from '../types/design-system-mode';
import {
  DEFAULT_WIREFRAME_DESIGN_SYSTEM_MARKDOWN_SOURCE,
  DEFAULT_WIREFRAME_DESIGN_SYSTEM_TITLE,
} from './default-wireframe-design-system';
import {
  computeDesignMdSourceHash,
  designMdSourceHasInput,
  getDesignMdStatus,
  type DesignMdSource,
  type DesignMdStatus,
} from './design-md-core';
export {
  computeDesignMdSourceHash,
  designMdSourcePayload,
  formatDesignSystemSourceMarkdown,
  isDesignMdDocumentStale,
  designMdSourceHasInput,
  getDesignMdStatus,
  type DesignMdSource,
  type DesignMdStatus,
} from './design-md-core';

export type DesignSystemInactiveReason = 'none' | 'custom-empty';

export type DesignSystemEffectiveState = {
  mode: DesignSystemSourceMode;
  customSourceCount: number;
  hasCustomSourceInput: boolean;
  source: DesignMdSource;
  hasEffectiveSourceInput: boolean;
  inactiveReason?: DesignSystemInactiveReason;
  designMdStatus?: DesignMdStatus;
  activeDesignMdDocument?: DesignMdDocument;
};

export type DesignSystemDocumentStatus =
  | 'none'
  | 'optional'
  | 'ready-to-generate'
  | 'generating'
  | 'ready'
  | 'needs-update'
  | 'error';

export interface DesignSystemDocumentUiState {
  status: DesignSystemDocumentStatus;
  statusLabel?: string;
  tone: 'neutral' | 'success' | 'warning' | 'error' | 'accent';
  canView: boolean;
  canGenerate: boolean;
  actionLabel?: string;
  error?: string;
}

export function hasCustomDesignSystemInput(data: DesignSystemNodeData): boolean {
  return (
    Boolean(data.content?.trim()) ||
    Boolean(data.images?.length) ||
    Boolean(data.markdownSources?.some((asset) => asset.content.trim()))
  );
}

export function countCustomDesignSystemInputs(data: DesignSystemNodeData): number {
  return (
    (data.content?.trim() ? 1 : 0) +
    (data.images?.length ?? 0) +
    (data.markdownSources?.filter((asset) => asset.content.trim()).length ?? 0)
  );
}

export function getDesignSystemSourceMode(data: DesignSystemNodeData): DesignSystemSourceMode {
  if (isDesignSystemSourceMode(data.sourceMode)) return data.sourceMode;
  if (data.sourceMode === 'off') return 'none';
  return hasCustomDesignSystemInput(data) ? 'custom' : DEFAULT_DESIGN_SYSTEM_SOURCE_MODE;
}

export function designSystemSourceFromNodeData(data: DesignSystemNodeData): DesignMdSource {
  const mode = getDesignSystemSourceMode(data);
  if (mode === 'none') {
    return {
      mode,
      title: data.title || 'Design System',
      content: '',
      images: [],
      markdownSources: [],
    };
  }
  if (mode === 'wireframe') {
    return {
      mode,
      title: DEFAULT_WIREFRAME_DESIGN_SYSTEM_TITLE,
      content: '',
      images: [],
      markdownSources: [DEFAULT_WIREFRAME_DESIGN_SYSTEM_MARKDOWN_SOURCE],
    };
  }
  return {
    mode,
    title: data.title,
    content: data.content,
    images: data.images ?? [],
    markdownSources: data.markdownSources ?? [],
  };
}

export function defaultWireframeDesignMdDocument(): DesignMdDocument {
  const source = designSystemSourceFromNodeData({ sourceMode: 'wireframe' });
  return {
    content: DEFAULT_WIREFRAME_DESIGN_SYSTEM_MARKDOWN_SOURCE.content,
    sourceHash: computeDesignMdSourceHash(source),
    generatedAt: 'built-in',
    providerId: 'built-in',
    modelId: 'wireframe',
    lint: {
      errors: 0,
      warnings: 0,
      infos: 0,
    },
  };
}

export function activeDesignMdDocumentForDesignSystem(
  data: DesignSystemNodeData,
  document = data.designMdDocument,
): DesignMdDocument | undefined {
  return getDesignSystemSourceMode(data) === 'wireframe'
    ? defaultWireframeDesignMdDocument()
    : document;
}

export function getDesignSystemEffectiveState(
  data: DesignSystemNodeData,
  options: { generating?: boolean; document?: DesignMdDocument } = {},
): DesignSystemEffectiveState {
  const mode = getDesignSystemSourceMode(data);
  const source = designSystemSourceFromNodeData(data);
  const customSourceCount = countCustomDesignSystemInputs(data);
  const hasCustomSourceInput = customSourceCount > 0;
  const hasEffectiveSourceInput = designMdSourceHasInput(source);

  if (!hasEffectiveSourceInput) {
    return {
      mode,
      customSourceCount,
      hasCustomSourceInput,
      source,
      hasEffectiveSourceInput: false,
      inactiveReason: mode === 'none' ? 'none' : 'custom-empty',
    };
  }

  const activeDesignMdDocument = activeDesignMdDocumentForDesignSystem(data, options.document);
  return {
    mode,
    customSourceCount,
    hasCustomSourceInput,
    source,
    hasEffectiveSourceInput: true,
    activeDesignMdDocument,
    designMdStatus: getDesignMdStatus(
      source,
      Boolean(options.generating),
      activeDesignMdDocument,
    ),
  };
}

export function getDesignSystemDocumentUiState(
  data: DesignSystemNodeData,
  options: { generating?: boolean; document?: DesignMdDocument } = {},
): DesignSystemDocumentUiState {
  const state = getDesignSystemEffectiveState(data, options);

  if (!state.hasEffectiveSourceInput) {
    return {
      status: state.inactiveReason === 'none' ? 'none' : 'optional',
      statusLabel: state.inactiveReason === 'none' ? 'none' : 'optional',
      tone: 'neutral',
      canView: false,
      canGenerate: false,
    };
  }

  const canView = Boolean(state.activeDesignMdDocument?.content?.trim());
  switch (state.designMdStatus) {
    case 'ready':
      return {
        status: 'ready',
        tone: 'success',
        canView,
        canGenerate: false,
      };
    case 'generating':
      return {
        status: 'generating',
        statusLabel: 'generating...',
        tone: 'accent',
        canView,
        canGenerate: true,
        actionLabel: canView ? 'Regenerate DESIGN.md' : 'Generate DESIGN.md',
      };
    case 'error':
      return {
        status: 'error',
        statusLabel: 'error',
        tone: 'error',
        canView,
        canGenerate: true,
        actionLabel: 'Retry DESIGN.md',
        error: options.document?.error ?? data.designMdDocument?.error,
      };
    case 'stale':
      return {
        status: 'needs-update',
        statusLabel: 'needs update',
        tone: 'warning',
        canView,
        canGenerate: true,
        actionLabel: 'Regenerate DESIGN.md',
      };
    case 'missing':
    default:
      return {
        status: 'ready-to-generate',
        statusLabel: 'ready to generate',
        tone: 'warning',
        canView: false,
        canGenerate: true,
        actionLabel: 'Generate DESIGN.md',
      };
  }
}
