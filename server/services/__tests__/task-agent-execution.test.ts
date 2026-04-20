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

vi.mock('../pi-agent-service.ts', () => ({
  runDesignAgentSession: mocks.runDesignAgentSession,
}));

vi.mock('../../lib/build-agentic-system-context.ts', () => ({
  buildAgenticSystemContext: mocks.buildAgenticSystemContext,
}));

vi.mock('../../lib/agentic-skills-emission.ts', () => ({
  emitSkillsLoadedEvents: mocks.emitSkillsLoadedEvents,
}));

import { executeTaskAgentStream } from '../task-agent-execution.ts';

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

  it('writes error + done and returns null when agentic slot is unavailable', async () => {
    mocks.acquireAgenticSlotOrReject.mockResolvedValue(false);

    const sse: { event: string; data: Record<string, unknown> }[] = [];
    const stream = {
      writeSSE: vi.fn(
        async (opts: { data: string; event: string; id: string }) => {
          sse.push({ event: opts.event, data: JSON.parse(opts.data) as Record<string, unknown> });
        },
      ),
    };

    const out = await executeTaskAgentStream(
      stream as never,
      {
        userPrompt: 'x',
        providerId: 'openrouter',
        modelId: 'm',
        sessionType: 'incubation',
      },
      { allocId: () => '0' },
    );

    expect(out).toBeNull();
    const errEv = sse.find((e) => e.event === SSE_EVENT_NAMES.error);
    expect(errEv?.data.error).toMatch(/Too many agentic runs/);
    expect(sse.some((e) => e.event === SSE_EVENT_NAMES.done)).toBe(true);
    expect(mocks.releaseAgenticSlot).not.toHaveBeenCalled();
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
