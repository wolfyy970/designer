import { describe, it, expect } from 'vitest';
import { agenticOrchestratorEventToSse } from '../agentic-sse-map.ts';
import { SSE_EVENT_NAMES } from '../../../src/constants/sse-events.ts';

describe('agenticOrchestratorEventToSse', () => {
  it('maps phase', () => {
    const out = agenticOrchestratorEventToSse({ type: 'phase', phase: 'evaluating' });
    expect(out.sseEvent).toBe(SSE_EVENT_NAMES.phase);
    expect(out.data).toEqual({ phase: 'evaluating' });
  });

  it('maps file with path and content', () => {
    const out = agenticOrchestratorEventToSse({
      type: 'file',
      path: 'index.html',
      content: '<html></html>',
    });
    expect(out.sseEvent).toBe(SSE_EVENT_NAMES.file);
    expect(out.data).toEqual({ path: 'index.html', content: '<html></html>' });
  });

  it('maps streaming_tool with optional toolPath omitted when undefined', () => {
    const out = agenticOrchestratorEventToSse({
      type: 'streaming_tool',
      toolName: 'write',
      streamedChars: 10,
      done: false,
    });
    expect(out.sseEvent).toBe(SSE_EVENT_NAMES.streaming_tool);
    expect(out.data).toEqual({
      toolName: 'write',
      streamedChars: 10,
      done: false,
    });
    expect('toolPath' in out.data).toBe(false);
  });

  it('maps streaming_tool with toolPath when set', () => {
    const out = agenticOrchestratorEventToSse({
      type: 'streaming_tool',
      toolName: 'read',
      streamedChars: 0,
      done: true,
      toolPath: 'src/a.ts',
    });
    expect(out.data).toMatchObject({ toolPath: 'src/a.ts' });
  });

  it('maps thinking with turnId', () => {
    const out = agenticOrchestratorEventToSse({
      type: 'thinking',
      payload: 'x',
      turnId: 2,
    });
    expect(out.sseEvent).toBe(SSE_EVENT_NAMES.thinking);
    expect(out.data).toEqual({ delta: 'x', turnId: 2 });
  });

  it('maps evaluation_worker_done', () => {
    const report = {
      rubric: 'design' as const,
      scores: { a: { score: 4, notes: 'n' } },
      findings: [],
      hardFails: [],
    };
    const out = agenticOrchestratorEventToSse({
      type: 'evaluation_worker_done',
      round: 1,
      rubric: 'design',
      report,
    });
    expect(out.sseEvent).toBe(SSE_EVENT_NAMES.evaluation_worker_done);
    expect(out.data).toEqual({ round: 1, rubric: 'design', report });
  });

  it('maps skills_loaded', () => {
    const out = agenticOrchestratorEventToSse({
      type: 'skills_loaded',
      skills: [{ key: 'k', name: 'n', description: 'd' }],
    });
    expect(out.sseEvent).toBe(SSE_EVENT_NAMES.skills_loaded);
    expect((out.data as { skills: unknown[] }).skills).toHaveLength(1);
  });

  it('maps error payload string', () => {
    const out = agenticOrchestratorEventToSse({ type: 'error', payload: 'boom' });
    expect(out.sseEvent).toBe(SSE_EVENT_NAMES.error);
    expect(out.data).toEqual({ error: 'boom' });
  });
});
