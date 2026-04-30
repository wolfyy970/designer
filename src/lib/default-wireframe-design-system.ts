import wireframeDesignMd from '../assets/default-wireframe-design.md?raw';
import type { DesignSystemMarkdownSource } from '../types/design-system-source';

export const DEFAULT_WIREFRAME_DESIGN_SYSTEM_TITLE = 'Wireframe' as const;
export const DEFAULT_WIREFRAME_DESIGN_SYSTEM_MARKDOWN_SOURCE: DesignSystemMarkdownSource = {
  id: 'default-wireframe-design-md',
  filename: 'DESIGN.md',
  content: wireframeDesignMd,
  sizeBytes: wireframeDesignMd.length,
  createdAt: 'built-in',
};
