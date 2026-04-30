export const DEFAULT_DESIGN_SYSTEM_SOURCE_MODE = 'wireframe' as const;
export const DESIGN_SYSTEM_SOURCE_MODES = ['wireframe', 'custom', 'none'] as const;
export type DesignSystemSourceMode = (typeof DESIGN_SYSTEM_SOURCE_MODES)[number];

export function isDesignSystemSourceMode(value: unknown): value is DesignSystemSourceMode {
  return typeof value === 'string' && (DESIGN_SYSTEM_SOURCE_MODES as readonly string[]).includes(value);
}
