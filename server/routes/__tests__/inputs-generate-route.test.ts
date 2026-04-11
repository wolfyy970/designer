import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/task-agent-execution.ts', () => ({
  executeTaskAgentStream: vi.fn(async () => {}),
}));

import app from '../../app.ts';

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
  });
});
