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
};

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

  return {
    mode,
    customSourceCount,
    hasCustomSourceInput,
    source,
    hasEffectiveSourceInput: true,
    designMdStatus: getDesignMdStatus(source, Boolean(options.generating), options.document),
  };
}
