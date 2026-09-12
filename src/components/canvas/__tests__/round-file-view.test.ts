import { describe, expect, it } from 'vitest';
import {
  resolveRoundFileView,
  shouldLoadRoundFiles,
  type RoundFileViewInput,
} from '../round-file-view';

/**
 * The panel's five render sites used to re-derive this decision from one
 * hand-written condition. These pin the precedence and, more importantly, the
 * three-way distinction the old `??` chain threw away: an older round whose
 * snapshot is still loading vs. one that has none vs. a round that resolved.
 */

const LIVE = { 'index.html': 'live' };
const ROUND_ONE = { 'index.html': 'round-1' };
const ROUND_TWO = { 'index.html': 'round-2' };

const rounds = [{ round: 1 }, { round: 2 }];

function input(over: Partial<RoundFileViewInput> = {}): RoundFileViewInput {
  return {
    currentFiles: LIVE,
    rounds,
    selectedRound: rounds[0],
    roundFilesFromIdb: undefined,
    isLoadingRoundFiles: false,
    isComplete: true,
    ...over,
  };
}

describe('resolveRoundFileView', () => {
  it('uses the live files when there is only one round', () => {
    const view = resolveRoundFileView(input({ rounds: [{ round: 1 }], selectedRound: { round: 1 } }));
    expect(view).toEqual({ kind: 'live', files: LIVE });
  });

  it('uses the live files when there is no result at all', () => {
    expect(resolveRoundFileView(input({ rounds: [], selectedRound: undefined }))).toEqual({
      kind: 'live',
      files: LIVE,
    });
  });

  it('uses the live files for the latest round, ignoring its inline snapshot', () => {
    // The latest round's snapshot IS the live run, so its own `files` is stale
    // by definition. This is the case that can silently show the wrong map.
    const view = resolveRoundFileView(
      input({ selectedRound: { round: 2, files: ROUND_TWO } }),
    );
    expect(view).toEqual({ kind: 'latest-round', files: LIVE });
  });

  it('prefers the IndexedDB snapshot over the round inline snapshot', () => {
    const view = resolveRoundFileView(
      input({ selectedRound: { round: 1, files: ROUND_ONE }, roundFilesFromIdb: ROUND_TWO }),
    );
    expect(view).toEqual({ kind: 'older-round', files: ROUND_TWO });
  });

  it('falls back to the round inline snapshot when IndexedDB has nothing', () => {
    const view = resolveRoundFileView(input({ selectedRound: { round: 1, files: ROUND_ONE } }));
    expect(view).toEqual({ kind: 'older-round', files: ROUND_ONE });
  });

  it('treats an empty IndexedDB snapshot as authoritative, not absent', () => {
    // `{}` is a real answer (the round genuinely had no files); falling through
    // to the inline snapshot here would resurrect stale content.
    const view = resolveRoundFileView(
      input({ selectedRound: { round: 1, files: ROUND_ONE }, roundFilesFromIdb: {} }),
    );
    expect(view).toEqual({ kind: 'older-round', files: {} });
  });

  it('reports loading while the read is in flight', () => {
    const view = resolveRoundFileView(input({ isLoadingRoundFiles: true }));
    expect(view.kind).toBe('loading');
    // The value keeps the original chain's `?? currentFiles` behaviour.
    expect(view.files).toBe(LIVE);
  });

  it('reports missing — not loading — once the read finished with nothing', () => {
    // The distinction the old bare value could not express. Both cases look
    // identical downstream, which is why a spinner was shown forever for a
    // round that could never produce files.
    const view = resolveRoundFileView(input({ isLoadingRoundFiles: false }));
    expect(view.kind).toBe('missing');
    expect(view.files).toBe(LIVE);
  });

  it('does not report loading for a run that is still generating', () => {
    // A generating run has no round snapshots to read, so a spinner would be
    // permanently wrong.
    const view = resolveRoundFileView(input({ isLoadingRoundFiles: true, isComplete: false }));
    expect(view.kind).toBe('missing');
  });

  it('is unaffected by which round is "last" when rounds share a number', () => {
    const view = resolveRoundFileView(
      input({ rounds: [{ round: 1 }, { round: 1 }], selectedRound: { round: 1 } }),
    );
    expect(view.kind).toBe('latest-round');
  });
});

describe('shouldLoadRoundFiles', () => {
  const base = {
    hasResultId: true,
    isComplete: true,
    roundCount: 2,
    selectedRound: { round: 1 },
    isLatestRound: false,
  };

  it('loads for an older round of a completed multi-round run', () => {
    expect(shouldLoadRoundFiles(base)).toBe(true);
  });

  it.each([
    ['no result id', { hasResultId: false }],
    ['run not complete', { isComplete: false }],
    ['no round selected', { selectedRound: undefined }],
    ['single round', { roundCount: 1 }],
    ['latest round selected', { isLatestRound: true }],
  ])('does not load when %s', (_label, over) => {
    expect(shouldLoadRoundFiles({ ...base, ...over })).toBe(false);
  });
});
