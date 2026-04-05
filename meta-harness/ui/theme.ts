import type { TextProps } from 'ink';

export const dimText = 'gray';

/** Map rubric-style score (0–5-ish) to terminal color. */
export function scoreColor(score: number | null | undefined): TextProps['color'] {
  if (score == null || !Number.isFinite(score)) return dimText;
  if (score < 3) return 'red';
  if (score < 4) return 'yellow';
  return 'green';
}

export function formatMean(mean: number | null, noDataLabel = 'n/a'): string {
  if (mean == null || !Number.isFinite(mean)) return noDataLabel;
  return mean.toFixed(2);
}
