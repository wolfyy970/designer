import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/task-agent-execution.ts', () => ({
  executeTaskAgentStream: vi.fn(async () => ({ result: '  generated text  ', resultFile: 'result.txt', files: {} })),
}));

import app from '../../app.ts';
import { executeTaskAgentStream } from '../../services/task-agent-execution.ts';

const baseBody = {
  inputId: 'research-context' as const,
  designBrief: 'A design brief',
  providerId: 'openrouter',
  modelId: 'minimax/minimax-m2.5',
};

describe('POST /api/inputs/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid inputId', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, inputId: 'design-brief' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when designBrief empty', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, designBrief: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns SSE stream for valid request', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseBody),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(executeTaskAgentStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionType: 'inputs-gen',
        resultFile: 'result.txt',
        resultFileFallback: 'firstNonEmptyFile',
      }),
      expect.anything(),
    );
  });

  it('writes trimmed task_result payloads and one terminal done', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseBody),
    });
    const text = await res.text();
    expect(text).toContain('event: task_result');
    expect(text).toContain('"result":"generated text"');
    expect(text.match(/event: done/g)).toHaveLength(1);
  });

  it('inlines bundled inputs-gen guidance for the requested inputId', async () => {
    await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseBody),
    });
    const taskOptions = vi.mocked(executeTaskAgentStream).mock.calls.at(-1)?.[1];
    expect(taskOptions?.userPrompt).toContain('<input_generator_guidance>');
    expect(taskOptions?.userPrompt).not.toContain('use the `use_skill` tool');
  });

  it('surfaces task execution errors on the SSE stream', async () => {
    vi.mocked(executeTaskAgentStream).mockRejectedValueOnce(new Error('task failed'));
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseBody),
    });
    const text = await res.text();
    expect(text).toContain('event: error');
    expect(text).toContain('task failed');
    expect(text.match(/event: done/g)).toHaveLength(1);
    expect(text).not.toContain('"phase":"complete"');
  });
});
