/**
 * Small shared helpers for meta-harness (no heavy dependencies).
 */

/** Normalize benchmark section values that may be a string or `{ content: string }`. */
export function normalizeFlexContent(val: unknown): string {
  if (typeof val === 'string') return val;
  if (
    val &&
    typeof val === 'object' &&
    'content' in val &&
    typeof (val as { content: unknown }).content === 'string'
  ) {
    return (val as { content: string }).content;
  }
  return '';
}
