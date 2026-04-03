/** First generation result id seen per variant strategy (multi-lane ordering). */
export function firstResultIdByVariantStrategy(
  results: ReadonlyArray<{ id: string; variantStrategyId: string }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of results) {
    if (!m.has(r.variantStrategyId)) m.set(r.variantStrategyId, r.id);
  }
  return m;
}
