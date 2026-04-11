/**
 * Shared math for the rubric partition slider (integer percentages summing to 100).
 */

export const DEFAULT_PARTITION_MIN_PCT = 1;

/** Largest fractional remainders get the extra units until sum is 100. */
export function floatWeightsToPercents(
  weights: Record<string, number>,
  orderedIds: readonly string[],
): Record<string, number> {
  const scaled = orderedIds.map((id) => weights[id] * 100);
  const floors = scaled.map((x) => Math.floor(x));
  const sum = floors.reduce((a, b) => a + b, 0);
  const rem = 100 - sum;
  const out = [...floors];
  const frac = scaled.map((x, i) => x - floors[i]!);
  const order = orderedIds.map((_, i) => i).sort((a, b) => frac[b]! - frac[a]!);
  for (let k = 0; k < rem; k++) out[order[k]!]!++;
  return Object.fromEntries(orderedIds.map((id, i) => [id, out[i]!]));
}

/** Divide by 100 for evaluator store; values sum to ~1 before store renormalizes. */
export function percentsToFloatWeights(
  percents: Record<string, number>,
  orderedIds: readonly string[],
): Record<string, number> {
  return Object.fromEntries(orderedIds.map((id) => [id, percents[id]! / 100]));
}

/**
 * Drag handle between segment `handleIndex` and `handleIndex + 1`.
 * Positive deltaPercent: left segment shrinks, right grows (handle moved right).
 */
export function moveHandleByPercentDelta(
  orderedIds: readonly string[],
  percents: Record<string, number>,
  handleIndex: number,
  deltaPercent: number,
  minPct: number,
): Record<string, number> | null {
  if (handleIndex < 0 || handleIndex >= orderedIds.length - 1) return null;
  const leftId = orderedIds[handleIndex]!;
  const rightId = orderedIds[handleIndex + 1]!;
  const pL = percents[leftId]!;
  const pR = percents[rightId]!;
  const total = pL + pR;
  const rounded = Math.round(deltaPercent);
  let newLeft = pL - rounded;
  newLeft = Math.max(minPct, Math.min(total - minPct, newLeft));
  const newRight = total - newLeft;
  return {
    ...percents,
    [leftId]: newLeft,
    [rightId]: newRight,
  };
}

export function nudgeHandle(
  orderedIds: readonly string[],
  percents: Record<string, number>,
  handleIndex: number,
  direction: 'left' | 'right',
  step: number,
  minPct: number,
): Record<string, number> | null {
  const delta = direction === 'right' ? step : -step;
  return moveHandleByPercentDelta(orderedIds, percents, handleIndex, delta, minPct);
}

function enforceMinPercentSum100(
  orderedIds: readonly string[],
  next: Record<string, number>,
  minPct: number,
): Record<string, number> | null {
  const out: Record<string, number> = { ...next };
  for (let pass = 0; pass < 32; pass++) {
    let broke = false;
    for (const id of orderedIds) {
      if (out[id]! < minPct) {
        const deficit = minPct - out[id]!;
        out[id] = minPct;
        const donors = [...orderedIds]
          .filter((x) => x !== id)
          .sort((a, b) => out[b]! - out[a]!);
        let d = deficit;
        for (const p of donors) {
          if (d <= 0) break;
          const can = out[p]! - minPct;
          const take = Math.min(d, can);
          out[p]! -= take;
          d -= take;
        }
        if (d > 0) return null;
        broke = true;
      }
    }
    if (!broke) break;
  }
  let sum = orderedIds.reduce((s, id) => s + out[id]!, 0);
  const diff = 100 - sum;
  if (diff === 0) {
    for (const id of orderedIds) {
      if (out[id]! < minPct) return null;
    }
    return out;
  }
  const sorted = [...orderedIds].sort((a, b) => out[b]! - out[a]!);
  if (diff > 0) {
    out[sorted[0]!]! += diff;
  } else {
    let need = -diff;
    for (const id of sorted) {
      const give = Math.min(need, out[id]! - minPct);
      if (give > 0) {
        out[id]! -= give;
        need -= give;
      }
      if (need === 0) break;
    }
    if (need > 0) return null;
  }
  sum = orderedIds.reduce((s, id) => s + out[id]!, 0);
  if (sum !== 100) return null;
  for (const id of orderedIds) {
    if (out[id]! < minPct) return null;
  }
  return out;
}

/**
 * Set one segment to `newPct`; redistribute the rest proportionally to current peers.
 */
export function setSegmentPercent(
  orderedIds: readonly string[],
  percents: Record<string, number>,
  segmentIndex: number,
  newPct: number,
  minPct: number,
): Record<string, number> | null {
  if (segmentIndex < 0 || segmentIndex >= orderedIds.length) return null;
  const n = orderedIds.length;
  const maxForOne = 100 - (n - 1) * minPct;
  const v = Math.max(minPct, Math.min(maxForOne, Math.round(newPct)));
  const targetId = orderedIds[segmentIndex]!;
  const others = orderedIds.filter((_, i) => i !== segmentIndex);
  const remaining = 100 - v;
  const oldOthersSum = others.reduce((s, id) => s + percents[id]!, 0);
  const next: Record<string, number> = { ...percents, [targetId]: v };

  if (oldOthersSum <= 0) {
    const base = Math.floor(remaining / others.length);
    const r = remaining - base * others.length;
    others.forEach((id, i) => {
      next[id] = base + (i < r ? 1 : 0);
    });
  } else {
    const raw = others.map((id) => (remaining * percents[id]!) / oldOthersSum);
    const fl = raw.map((x) => Math.floor(x));
    const s = fl.reduce((a, b) => a + b, 0);
    const rem = remaining - s;
    const frac = raw.map((x, i) => x - fl[i]!);
    const order = others.map((_, i) => i).sort((a, b) => frac[b]! - frac[a]!);
    const vals = [...fl];
    for (let k = 0; k < rem; k++) vals[order[k]!]!++;
    others.forEach((id, i) => {
      next[id] = vals[i]!;
    });
  }

  return enforceMinPercentSum100(orderedIds, next, minPct);
}
