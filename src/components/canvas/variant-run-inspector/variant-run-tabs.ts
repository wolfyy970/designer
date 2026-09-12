/**
 * Tab identity for the run inspector.
 *
 * Kept out of `VariantRunHeader.tsx` so that file exports only components —
 * the `react-refresh/only-export-components` rule requires it, and mixing the
 * two silently breaks Fast Refresh for the header.
 */
export type VariantRunTabId = 'monitor' | 'files' | 'design' | 'evaluation';

export const VARIANT_RUN_TAB_DEFS: { id: VariantRunTabId; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'files', label: 'Files' },
  { id: 'design', label: 'Design' },
  { id: 'evaluation', label: 'Evaluation' },
];
