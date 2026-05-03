import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../services/task-agent-execution.ts', () => ({
  executeTaskAgentStream: vi.fn(async () => ({
    result: JSON.stringify({
      dimensions: [{ name: 'Audience', range: 'novice to expert', isConstant: false }],
      hypotheses: [
        {
          name: 'Guided flow',
          hypothesis: 'A guided flow reduces uncertainty.',
          rationale: 'Users need clear next steps.',
          measurements: 'Task completion',
          dimensionValues: { Audience: 'novice' },
        },
      ],
    }),
    resultFile: 'result.json',
    files: {},
  })),
}));

vi.mock('../../lib/prompt-resolution.ts', () => ({
  getPromptBody: vi.fn(async () => 'template body'),
}));

import app from '../../app.ts';
import { executeTaskAgentStream } from '../../services/task-agent-execution.ts';

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

  it('writes parsed incubation plans as incubate_result payloads', async () => {
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithSpec()),
    });
    const text = await res.text();
    expect(text).toContain('event: incubate_result');
    expect(text).toContain('"specId":"s1"');
    expect(text).toContain('"hypothesis":"A guided flow reduces uncertainty."');
  });

  it('coerces array-shaped `measurements` into a joined string', async () => {
    vi.mocked(executeTaskAgentStream).mockResolvedValueOnce({
      result: JSON.stringify({
        dimensions: [{ name: 'Tone', range: 'playful to serious', isConstant: false }],
        hypotheses: [
          {
            name: 'Playful Lead',
            hypothesis: 'Lead with playfulness.',
            rationale: 'r',
            measurements: ['Time on page', 'Bounce rate', 'Pages per session'],
            dimensionValues: { Tone: 'playful' },
          },
        ],
      }),
      resultFile: 'result.json',
      files: {},
    });
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithSpec()),
    });
    const text = await res.text();
    expect(text).toContain('event: incubate_result');
    expect(text).toContain('Time on page; Bounce rate; Pages per session');
  });

  it('injects the bundled gen-hypotheses guidance into the agent user prompt', async () => {
    vi.mocked(executeTaskAgentStream).mockClear();
    await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithSpec()),
    });
    const taskOptions = vi.mocked(executeTaskAgentStream).mock.calls.at(-1)?.[1];
    expect(taskOptions?.userPrompt).toContain('<hypotheses_generator_guidance>');
    expect(taskOptions?.userPrompt).not.toContain('use the `use_skill` tool');
  });

  it('surfaces task execution errors on the SSE stream', async () => {
    vi.mocked(executeTaskAgentStream).mockRejectedValueOnce(new Error('incubate failed'));
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithSpec()),
    });
    const text = await res.text();
    expect(text).toContain('event: error');
    expect(text).toContain('incubate failed');
    expect(text).toContain('event: done');
  });
});
