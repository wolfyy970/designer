/**
 * One resolver for "which file map does this run panel show?".
 *
 * **Why this exists.** The answer used to be a `??` chain that *returned a bare
 * value*, so a caller could not tell "there is genuinely nothing for this round"
 * from "the round's snapshot is still being read". Every consumer therefore
 * re-derived the distinction from the same three-term condition, written out at
 * five separate render sites:
 *
 *     rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb && !selectedRound?.files
 *
 * That condition is the shape behind the reported defect: when it held, the
 * panels rendered a loading state, and because nothing further was coming the
 * spinner never resolved and the run's real files stayed hidden. Duplicating the
 * predicate five times is also how the *copy written for exactly that state*
 * ended up unreachable.
 *
 * So the precedence lives here, once, and reports *which* case applied rather
 * than just the winner. Callers branch on `kind`.
 *
 * Precedence, unchanged from the original chain:
 *   1. use the live/stored files when there is nothing to choose between
 *      (no result, or only one round);
 *   2. use them for the latest round, whose snapshot is the live one;
 *   3. otherwise an older round: its IndexedDB snapshot outranks the inline
 *      snapshot captured with the round, which outranks the live files.
 */

export type RoundFileViewKind =
  /** Live or stored files — no round selection is in play. */
  | 'live'
  /** The latest round; its snapshot is the live run's own files. */
  | 'latest-round'
  /** An older round's own files, from IndexedDB or the inline snapshot. */
  | 'older-round'
  /** An older round whose snapshot is being read from IndexedDB. */
  | 'loading'
  /** An older round has no snapshot anywhere. */
  | 'missing';

export interface RoundFileViewInput {
  /** `files ?? result.liveFiles` — already resolved by the caller. */
  currentFiles: Record<string, string> | undefined;
  rounds: readonly { round: number; files?: Record<string, string> }[];
  selectedRound: { round: number; files?: Record<string, string> } | undefined;
  /** Snapshot read from IndexedDB for `selectedRound`; `undefined` until it lands. */
  roundFilesFromIdb: Record<string, string> | undefined;
  /** True while the IndexedDB read for `selectedRound` is in flight. */
  isLoadingRoundFiles: boolean;
  /** The run is complete; an in-flight run has no round snapshots to read. */
  isComplete: boolean;
}

export interface RoundFileView {
  kind: RoundFileViewKind;
  /**
   * Files to render. Matches the original `??` chain exactly, including its
   * final `?? currentFiles` — so introducing this resolver changed no rendered
   * bytes. `kind` is the new information: it says whether those files are the
   * *right* ones for the selection.
   */
  files: Record<string, string> | undefined;
}

export function resolveRoundFileView(input: RoundFileViewInput): RoundFileView {
  const { currentFiles, rounds, selectedRound, roundFilesFromIdb } = input;

  // No round selection in play: the live/stored map is the answer.
  if (rounds.length <= 1 || !selectedRound) {
    return { kind: 'live', files: currentFiles };
  }

  const lastRoundNum = rounds[rounds.length - 1]?.round;
  if (lastRoundNum != null && selectedRound.round === lastRoundNum) {
    return { kind: 'latest-round', files: currentFiles };
  }

  // An older round: its IndexedDB snapshot outranks the inline snapshot
  // captured with the round, which outranks the live files.
  if (roundFilesFromIdb !== undefined) {
    return { kind: 'older-round', files: roundFilesFromIdb };
  }
  if (selectedRound.files !== undefined) {
    return { kind: 'older-round', files: selectedRound.files };
  }

  // Nothing yet. Distinguish "still reading" from "never was captured", because
  // only the first can still resolve — and the spinner is only honest for that
  // one. The value stays `currentFiles` (unchanged behaviour); the caller now
  // *knows* which case it is and can label it.
  if (input.isLoadingRoundFiles && input.isComplete) {
    return { kind: 'loading', files: currentFiles };
  }
  return { kind: 'missing', files: currentFiles };
}

/**
 * Whether an IndexedDB read for the selected round should be in flight. Mirrors
 * the effect's own guard so the loading state and the effect agree by
 * construction rather than by two people reading the same five conditions.
 */
export function shouldLoadRoundFiles(input: {
  hasResultId: boolean;
  isComplete: boolean;
  roundCount: number;
  selectedRound: { round: number } | undefined;
  isLatestRound: boolean;
}): boolean {
  if (!input.hasResultId || !input.isComplete) return false;
  if (!input.selectedRound) return false;
  if (input.roundCount <= 1) return false;
  return !input.isLatestRound;
}
