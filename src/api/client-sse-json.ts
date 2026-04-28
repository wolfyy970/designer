/** Parse hypothesis SSE JSON line; returns null if not a plain object (arrays/primitives rejected). */
export function parseHypothesisSseJson(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* dev warning in caller */
  }
  return null;
}

/** Remove server multiplex field before building typed SSE events. */
export function stripLaneIndex(data: Record<string, unknown>): {
  laneIndex?: number;
  rest: Record<string, unknown>;
} {
  const laneIndex = data.laneIndex;
  const rest = { ...data };
  delete rest.laneIndex;
  return {
    laneIndex: typeof laneIndex === 'number' ? laneIndex : undefined,
    rest,
  };
}
