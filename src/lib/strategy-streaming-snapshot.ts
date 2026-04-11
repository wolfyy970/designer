/** Field separator for stable Zustand selector strings (unlikely in tool names/paths). */
const F = '\u001f';

/**
 * Encodes the “best lane” streaming snapshot for hypothesis multi-model runs.
 * Paired with {@link decodeStrategyStreamingSnapshot} — no JSON.parse casts.
 */
export function encodeStrategyStreamingSnapshot(
  toolName: string,
  streamedChars: number,
  toolPath: string,
): string {
  return `${streamedChars}${F}${toolName}${F}${toolPath}`;
}

export interface StrategyStreamingSnapshot {
  name: string;
  chars: number;
  path: string;
}

export function decodeStrategyStreamingSnapshot(s: string): StrategyStreamingSnapshot | null {
  const parts = s.split(F);
  if (parts.length !== 3) return null;
  const chars = Number(parts[0]);
  const name = parts[1]!;
  const path = parts[2]!;
  if (!Number.isFinite(chars) || name.length === 0) return null;
  return { name, chars, path };
}
