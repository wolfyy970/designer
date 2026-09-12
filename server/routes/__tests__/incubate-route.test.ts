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

vi.mock('../../services/incubator-brainstorm.ts', () => ({
  runBrainstormPrelude: vi.fn(async ({ designBrief }: { designBrief: string }) => ({
    augmentedBrief: `${designBrief}\n\n<product_shape_candidates>\n## Stubbed direction\n</product_shape_candidates>`,
    curatedText: '## Stubbed direction',
  })),
}));

import app from '../../app.ts';
import { executeTaskAgentStream } from '../../services/task-agent-execution.ts';
import { runBrainstormPrelude } from '../../services/incubator-brainstorm.ts';

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

  it('accepts `promptOptions.brainstormFirst: false` (or absent) and proceeds without the prelude', async () => {
    // brainstormFirst absent — default path, no prelude module invoked. We
    // assert the route accepts the body shape; the unit-test fixture mocks
    // executeTaskAgentStream and never imports the prelude.
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        bodyWithSpec({
          promptOptions: { count: 5, brainstormFirst: false },
        }),
      ),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  });

  it('returns 400 when promptOptions.brainstormFirst is a non-boolean', async () => {
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        bodyWithSpec({
          promptOptions: { brainstormFirst: 'yes' as unknown as boolean },
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

  it('normalizes exploration axes and hypothesis positions before streaming the plan', async () => {
    vi.mocked(executeTaskAgentStream).mockResolvedValueOnce({
      result: JSON.stringify({
        dimensions: [
          { name: ' Information density ', range: ' sparse to dense ', isConstant: false },
          { name: 'information   density', range: 'duplicate', isConstant: false },
          { name: 'Trust posture', range: 'implicit to explicit', isConstant: false },
          { name: 'Brand', range: 'Acme', isConstant: true },
        ],
        hypotheses: [
          {
            name: 'Sparse Proof',
            hypothesis: 'Lead with sparse proof.',
            rationale: 'r',
            measurements: 'm',
            dimensionValues: {
              'information density': ' sparse ',
              output_format: 'react',
            },
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
    expect(text).toContain('"name":"Information density","range":"sparse to dense"');
    expect(text).not.toContain('duplicate');
    expect(text).not.toContain('output_format');
    expect(text).toContain('"Information density":"sparse"');
    expect(text).toContain('"Trust posture":"not specified"');
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

  it('does NOT invoke the brainstorm prelude when promptOptions.brainstormFirst is absent', async () => {
    vi.mocked(runBrainstormPrelude).mockClear();
    await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithSpec({ promptOptions: { count: 3 } })),
    });
    expect(runBrainstormPrelude).not.toHaveBeenCalled();
  });

  it('invokes the brainstorm prelude when promptOptions.brainstormFirst is true and continues to the incubator with the prelude-augmented brief', async () => {
    vi.mocked(runBrainstormPrelude).mockClear();
    vi.mocked(executeTaskAgentStream).mockClear();
    const briefContent = 'Design something open-ended.';
    await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        bodyWithSpec({
          spec: {
            ...minimalIncubateBody.spec,
            sections: {
              'design-brief': { ...validSection, content: briefContent },
            },
          },
          promptOptions: { count: 3, brainstormFirst: true },
        }),
      ),
    });

    // Prelude was invoked with the brief content.
    expect(runBrainstormPrelude).toHaveBeenCalledTimes(1);
    expect(runBrainstormPrelude).toHaveBeenCalledWith(
      expect.objectContaining({
        designBrief: briefContent,
        providerId: expect.any(String),
        modelId: expect.any(String),
      }),
    );

    // The route did not short-circuit — the main incubator stage ran
    // after the prelude completed, i.e. the augmented brief flowed
    // downstream as designed.
    expect(executeTaskAgentStream).toHaveBeenCalledTimes(1);
  });

  it('returns 500 with a clear error message when the brainstorm prelude throws', async () => {
    vi.mocked(runBrainstormPrelude).mockRejectedValueOnce(new Error('upstream stalled'));
    vi.mocked(executeTaskAgentStream).mockClear();
    const res = await app.request('http://localhost/api/incubate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        bodyWithSpec({
          spec: {
            ...minimalIncubateBody.spec,
            sections: {
              'design-brief': { ...validSection, content: 'Brief content.' },
            },
          },
          promptOptions: { count: 3, brainstormFirst: true },
        }),
      ),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Brainstorm prelude failed: upstream stalled'),
      }),
    );
    // The incubator stage must NOT run when the prelude failed.
    expect(executeTaskAgentStream).not.toHaveBeenCalled();
  });
});
