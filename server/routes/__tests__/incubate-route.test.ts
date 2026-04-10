import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../services/task-agent-execution.ts', () => ({
  executeTaskAgentStream: vi.fn(async () => {}),
}));

vi.mock('../../lib/prompt-resolution.ts', () => ({
  getPromptBody: vi.fn(async () => 'template body'),
}));

import app from '../../app.ts';

const validSection = {
  id: 'design-brief' as const,
  content: '',
  images: [] as [],
  lastModified: '',
};

const minimalIncubateBody = {
  spec: {
    id: 's1',
    title: 't',
    sections: {
      'design-brief': validSection,
    },
    version: 1,
    createdAt: '',
    lastModified: '',
  },
  providerId: 'lmstudio',
  modelId: 'local-llm',
};

function bodyWithSpec(overrides: Record<string, unknown> = {}) {
  return {
    ...minimalIncubateBody,
    ...overrides,
    spec: { ...minimalIncubateBody.spec, ...(overrides.spec as object) },
  };
}

describe('POST /api/incubate validation', () => {
  it('returns 400 when spec omits required DesignSpec fields', async () => {
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: { id: 's1' },
        providerId: 'openrouter',
        modelId: 'm',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when promptOptions.existingStrategies has invalid strategy shape', async () => {
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        bodyWithSpec({
          spec: {
            ...minimalIncubateBody.spec,
            sections: { 'design-brief': validSection },
          },
          promptOptions: {
            existingStrategies: [{ name: 'only-name' }],
          },
        }),
      ),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/incubate SSE wire', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns SSE stream for valid request', async () => {
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithSpec()),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  });
});
