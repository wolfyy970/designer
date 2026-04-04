/** First generation result id seen per strategy (multi-lane ordering). */
export function firstResultIdByVariantStrategy(
  results: ReadonlyArray<{ id: string; strategyId: string }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of results) {
    if (!m.has(r.strategyId)) m.set(r.strategyId, r.id);
  }
  return m;
}
