/** Heuristic text tone for tool result / detail lines in observability UI. */

export function runTraceDetailToneClass(detail: string): string {
  const low = detail.slice(0, 400).toLowerCase();
  if (
    low.includes('path not found') ||
    low.includes('failed with exit') ||
    (low.includes('rg:') && (low.includes('error') || low.includes('invalid'))) ||
    (low.includes('grep:') && low.includes('invalid'))
  ) {
    return 'text-error';
  }
  if (low.includes('no matches found')) {
    return 'text-warning';
  }
  if (low.includes('failed') || low.includes('invalid') || low.includes('error')) {
    return 'text-error';
  }
  return 'text-fg-muted';
}
