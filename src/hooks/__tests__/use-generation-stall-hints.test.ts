import { describe, it, expect } from 'vitest';
import {
  FILE_STALL_WARN_SEC,
  FIRST_FILE_WAIT_ELAPSED_SEC,
  STREAM_QUIET_WARN_SEC,
} from '../../lib/generation-liveness';
import { buildGeneratingPrimaryLine, buildNoPlanBuildingLine } from '../../lib/generating-footer-primary';
import { computeGenerationStallHints } from '../use-generation-stall-hints';

describe('computeGenerationStallHints', () => {
  const now = 1_000_000;

  it('flags stream-quiet warning in building phase when model is quiet long enough', () => {
    const lastActivity = now - (STREAM_QUIET_WARN_SEC + 1) * 1000;
    const h = computeGenerationStallHints({
      now,
      liveness: {
        agenticPhase: 'building',
        lastActivityAt: lastActivity,
        lastTraceAt: lastActivity,
      },
      written: 0,
      total: 3,
      hasPlan: true,
      elapsed: 0,
    });
    expect(h.showStreamQuietWarning).toBe(true);
    expect(h.modelQuietSec).toBeGreaterThanOrEqual(STREAM_QUIET_WARN_SEC);
  });

  it('suppresses stream-quiet warning while a tool call is streaming', () => {
    const lastActivity = now - (STREAM_QUIET_WARN_SEC + 1) * 1000;
    const h = computeGenerationStallHints({
      now,
      liveness: {
        agenticPhase: 'building',
        streamingToolName: 'write_file',
        lastActivityAt: lastActivity,
        lastTraceAt: lastActivity,
      },
      written: 0,
      total: 3,
      hasPlan: true,
      elapsed: 0,
    });
    expect(h.showStreamQuietWarning).toBe(false);
    expect(h.isStreamingToolArgs).toBe(true);
  });

  it('flags file stall when no new file for FILE_STALL_WARN_SEC', () => {
    const lastFile = now - (FILE_STALL_WARN_SEC + 1) * 1000;
    const h = computeGenerationStallHints({
      now,
      liveness: {
        agenticPhase: 'building',
        lastAgentFileAt: lastFile,
        lastActivityAt: now,
        lastTraceAt: now,
      },
      written: 0,
      total: 3,
      hasPlan: true,
      elapsed: 0,
    });
    expect(h.showFileStall).toBe(true);
    expect(h.fileStallSec).toBeGreaterThanOrEqual(FILE_STALL_WARN_SEC);
  });

  it('flags first-file wait when elapsed exceeds threshold and no files yet', () => {
    const h = computeGenerationStallHints({
      now,
      liveness: { agenticPhase: 'building' },
      written: 0,
      total: 0,
      hasPlan: false,
      elapsed: FIRST_FILE_WAIT_ELAPSED_SEC + 1,
    });
    expect(h.firstFileWait).toBe(true);
  });

  it('shows thinking duration in model activity when actively thinking past threshold', () => {
    const started = now - 5_000;
    const h = computeGenerationStallHints({
      now,
      liveness: {
        agenticPhase: 'building',
        activeThinkingStartedAt: started,
        lastActivityAt: now,
        lastTraceAt: now,
      },
      written: 0,
      total: 0,
      hasPlan: false,
      elapsed: 0,
    });
    expect(h.isActivelyThinking).toBe(true);
    expect(h.modelActivityDetail).toMatch(/Model reasoning \(5s\)/);
  });
});

describe('buildNoPlanBuildingLine', () => {
  it('prefers custom progress over generic generating', () => {
    expect(
      buildNoPlanBuildingLine({
        isBuilding: true,
        progressMessage: 'Custom',
        written: 0,
        isActivelyThinking: false,
        isServerStallHeartbeat: false,
        thinkingSec: 0,
      }),
    ).toBe('Custom');
  });
});

describe('buildGeneratingPrimaryLine', () => {
  it('shows eval status when evaluating', () => {
    expect(
      buildGeneratingPrimaryLine({
        isEvaluating: true,
        isRevising: false,
        hasPlan: true,
        written: 1,
        total: 3,
        evaluationStatus: 'Design rubric…',
        noPlanBuildingLine: 'x',
      }),
    ).toBe('Design rubric…');
  });

  it('shows plan progress when building with a plan', () => {
    expect(
      buildGeneratingPrimaryLine({
        isEvaluating: false,
        isRevising: false,
        hasPlan: true,
        written: 1,
        total: 3,
        noPlanBuildingLine: 'ignored',
      }),
    ).toBe('1 / 3 files');
  });
});
