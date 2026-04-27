import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/task-agent-execution.ts', () => ({
  executeTaskAgentStream: vi.fn(async () => ({ result: '# Context\n', resultFile: 'result.md', files: {} })),
}));

import app from '../../app.ts';
import { executeTaskAgentStream } from '../../services/task-agent-execution.ts';

const validSection = {
  id: 'design-brief' as const,
  content: 'A design brief',
  images: [] as [],
  lastModified: '2026-01-01T00:00:00Z',
};

const baseBody = {
  spec: {
    id: 's1',
    title: 'Spec',
    sections: {
      'design-brief': validSection,
    },
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    lastModified: '2026-01-01T00:00:00Z',
  },
  sourceHash: 'fnv1a:abc',
  providerId: 'openrouter',
  modelId: 'minimax/minimax-m2.5',
};

describe('POST /api/internal-context/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when sourceHash is empty', async () => {
    const res = await app.request('http://localhost/api/internal-context/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, sourceHash: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns SSE stream for valid request and uses internal-context session type', async () => {
    const res = await app.request('http://localhost/api/internal-context/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseBody),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(executeTaskAgentStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionType: 'internal-context',
        resultFile: 'result.md',
      }),
      expect.anything(),
    );
  });
});
