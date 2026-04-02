/**
 * Line-oriented diff for Prompt Studio (no external deps).
 * Builds a shortest edit script via LCS DP on line arrays.
 */
export type DiffLineType = 'same' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  /** Line content without trailing newline delimiter used for joining */
  text: string;
}

export function lineDiff(left: string, right: string): DiffLine[] {
  const a = left === '' ? [] : left.split(/\r?\n/);
  const b = right === '' ? [] : right.split(/\r?\n/);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = m;
  let j = n;
  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ type: 'same', text: a[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      stack.push({ type: 'add', text: b[j - 1]! });
      j--;
    } else if (i > 0) {
      stack.push({ type: 'remove', text: a[i - 1]! });
      i--;
    }
  }
  while (stack.length) out.push(stack.pop()!);
  return out;
}
