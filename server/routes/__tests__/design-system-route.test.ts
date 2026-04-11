import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/task-agent-execution.ts', () => ({
  executeTaskAgentStream: vi.fn(async () => {}),
}));

import app from '../../app.ts';

const minimalBody = {
  images: [{ dataUrl: 'data:image/png;base64,AAAA' }],
  providerId: 'openrouter',
  modelId: 'minimax/minimax-m2.5',
};

describe('POST /api/design-system/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when providerId is empty', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...minimalBody, providerId: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when images is not an array', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...minimalBody, images: 'not-array' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns SSE stream for valid request', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalBody),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });
});
