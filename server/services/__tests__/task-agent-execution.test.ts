import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SSE_EVENT_NAMES } from '../../../src/constants/sse-events.ts';

const mocks = vi.hoisted(() => ({
  acquireAgenticSlotOrReject: vi.fn(),
  releaseAgenticSlot: vi.fn(),
  runDesignAgentSession: vi.fn(),
  buildAgenticSystemContext: vi.fn(),
  emitSkillsLoadedEvents: vi.fn(),
}));

vi.mock('../../lib/agentic-concurrency.ts', () => ({
  acquireAgenticSlotOrReject: mocks.acquireAgenticSlotOrReject,
  releaseAgenticSlot: mocks.releaseAgenticSlot,
}));

vi.mock('../agent-runtime.ts', () => ({
  runDesignAgentSession: mocks.runDesignAgentSession,
}));

vi.mock('../../lib/build-agentic-system-context.ts', () => ({
  buildAgenticSystemContext: mocks.buildAgenticSystemContext,
}));

vi.mock('../../lib/agentic-skills-emission.ts', () => ({
  emitSkillsLoadedEvents: mocks.emitSkillsLoadedEvents,
}));

import { executeTaskAgentStream, TaskAgentExecutionError } from '../task-agent-execution.ts';

describe('executeTaskAgentStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildAgenticSystemContext.mockResolvedValue({
      systemPrompt: 'sys',
      skillCatalog: [],
      loadedSkills: [],
      sandboxSeedFiles: {},
    });
    mocks.emitSkillsLoadedEvents.mockResolvedValue(undefined);
  });

  it('rejects without terminal SSE events when agentic slot is unavailable', async () => {
    mocks.acquireAgenticSlotOrReject.mockResolvedValue(false);

    const sse: { event: string; data: Record<string, unknown> }[] = [];
    const stream = {
      writeSSE: vi.fn(
        async (opts: { data: string; event: string; id: string }) => {
          sse.push({ event: opts.event, data: JSON.parse(opts.data) as Record<string, unknown> });
        },
      ),
    };

    await expect(executeTaskAgentStream(
      stream as never,
      {
        userPrompt: 'x',
        providerId: 'openrouter',
        modelId: 'm',
        sessionType: 'incubation',
      },
      { allocId: () => '0' },
    )).rejects.toThrow(TaskAgentExecutionError);

    expect(sse.some((e) => e.event === SSE_EVENT_NAMES.error)).toBe(false);
    expect(sse.some((e) => e.event === SSE_EVENT_NAMES.done)).toBe(false);
    expect(mocks.releaseAgenticSlot).not.toHaveBeenCalled();
  });

  it('rejects without terminal SSE events when the Pi session has no result', async () => {
    mocks.acquireAgenticSlotOrReject.mockResolvedValue(true);
    mocks.runDesignAgentSession.mockResolvedValue(null);

    const sse: { event: string; data: Record<string, unknown> }[] = [];
    const stream = {
      writeSSE: vi.fn(
        async (opts: { data: string; event: string; id: string }) => {
          sse.push({ event: opts.event, data: JSON.parse(opts.data) as Record<string, unknown> });
        },
      ),
    };

    await expect(executeTaskAgentStream(
      stream as never,
      {
        userPrompt: 'task',
        providerId: 'openrouter',
        modelId: 'm',
        sessionType: 'incubation',
        resultFile: 'result.json',
      },
      { allocId: () => '0' },
    )).rejects.toMatchObject({
      outcome: 'no_result',
      message: 'Agent session completed without result.',
    });

    expect(sse.some((e) => e.event === SSE_EVENT_NAMES.error)).toBe(false);
    expect(sse.some((e) => e.event === SSE_EVENT_NAMES.done)).toBe(false);
    expect(mocks.releaseAgenticSlot).toHaveBeenCalledOnce();
  });

  it('rejects without terminal SSE events when no non-empty result file exists', async () => {
    mocks.acquireAgenticSlotOrReject.mockResolvedValue(true);
    mocks.runDesignAgentSession.mockResolvedValue({
      files: { 'notes.txt': '   ' },
      todos: [],
      emittedFilePaths: ['notes.txt'],
    });

    const sse: { event: string; data: Record<string, unknown> }[] = [];
    const stream = {
      writeSSE: vi.fn(
        async (opts: { data: string; event: string; id: string }) => {
          sse.push({ event: opts.event, data: JSON.parse(opts.data) as Record<string, unknown> });
        },
      ),
    };

    await expect(executeTaskAgentStream(
      stream as never,
      {
        userPrompt: 'task',
        providerId: 'openrouter',
        modelId: 'm',
        sessionType: 'incubation',
        resultFile: 'result.json',
      },
      { allocId: () => '0' },
    )).rejects.toMatchObject({
      outcome: 'no_result',
      message: 'Agent did not write the expected result file (result.json).',
    });

    expect(sse.some((e) => e.event === SSE_EVENT_NAMES.error)).toBe(false);
    expect(sse.some((e) => e.event === SSE_EVENT_NAMES.done)).toBe(false);
    expect(mocks.releaseAgenticSlot).toHaveBeenCalledOnce();
  });

  it('falls back to the first non-empty file when the expected result file is missing', async () => {
    mocks.acquireAgenticSlotOrReject.mockResolvedValue(true);
    mocks.runDesignAgentSession.mockResolvedValue({
      files: { 'notes.txt': 'fallback result' },
      todos: [],
      emittedFilePaths: ['notes.txt'],
    });

    const out = await executeTaskAgentStream(
      { writeSSE: vi.fn(async () => {}) } as never,
      {
        userPrompt: 'task',
        providerId: 'openrouter',
        modelId: 'm',
        sessionType: 'inputs-gen',
        resultFile: 'result.txt',
        resultFileFallback: 'firstNonEmptyFile',
      },
      { allocId: () => '0' },
    );

    expect(out).toMatchObject({
      result: 'fallback result',
      resultFile: 'notes.txt',
    });
    expect(mocks.releaseAgenticSlot).toHaveBeenCalledOnce();
  });

  it('rejects missing expected result files when fallback is strict', async () => {
    mocks.acquireAgenticSlotOrReject.mockResolvedValue(true);
    mocks.runDesignAgentSession.mockResolvedValue({
      files: { 'notes.txt': 'fallback result' },
      todos: [],
      emittedFilePaths: ['notes.txt'],
    });

    await expect(executeTaskAgentStream(
      { writeSSE: vi.fn(async () => {}) } as never,
      {
        userPrompt: 'task',
        providerId: 'openrouter',
        modelId: 'm',
        sessionType: 'inputs-gen',
        resultFile: 'result.txt',
        resultFileFallback: 'strict',
      },
      { allocId: () => '0' },
    )).rejects.toMatchObject({
      outcome: 'no_result',
      message: 'Agent did not write the expected result file (result.txt).',
    });
    expect(mocks.releaseAgenticSlot).toHaveBeenCalledOnce();
  });

  it('runs Pi session and returns extracted result when result file exists', async () => {
    mocks.acquireAgenticSlotOrReject.mockResolvedValue(true);
    mocks.runDesignAgentSession.mockResolvedValue({
      files: { 'result.json': '{"ok":true}', 'other.txt': 'x' },
      todos: [],
      emittedFilePaths: ['result.json'],
    });

    const stream = {
      writeSSE: vi.fn(async () => {}),
    };

    const out = await executeTaskAgentStream(
      stream as never,
      {
        userPrompt: 'task',
        providerId: 'openrouter',
        modelId: 'm',
        sessionType: 'incubation',
        resultFile: 'result.json',
      },
      { allocId: () => '0' },
    );

    expect(out).toEqual({
      result: '{"ok":true}',
      resultFile: 'result.json',
      files: { 'result.json': '{"ok":true}', 'other.txt': 'x' },
    });
    expect(mocks.releaseAgenticSlot).toHaveBeenCalled();
    expect(stream.writeSSE).toHaveBeenCalled();
  });
});
