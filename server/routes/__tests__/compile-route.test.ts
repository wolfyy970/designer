import { describe, it, expect, vi, afterEach } from 'vitest';
import { LOCKDOWN_MODEL_ID, LOCKDOWN_PROVIDER_ID } from '../../../src/lib/lockdown-model.ts';

const mocks = vi.hoisted(() => ({
  compileSpecStream: vi.fn(async () => ({
    id: 'd1',
    specId: 's1',
    dimensions: [],
    hypotheses: [],
    generatedAt: '2020-01-01T00:00:00.000Z',
    compilerModel: 'test-model',
  })),
}));

vi.mock('../../services/compiler.ts', () => ({
  compileSpecStream: mocks.compileSpecStream,
}));

import app from '../../app.ts';

const minimalCompileBody = {
  spec: {
    id: 's1',
    title: 't',
    sections: {
      'design-brief': {
        id: 'design-brief' as const,
        content: '',
        images: [],
        lastModified: '',
      },
    },
    version: 1,
    createdAt: '',
    lastModified: '',
  },
  providerId: 'lmstudio',
  modelId: 'local-llm',
};

const validSection = {
  id: 'design-brief' as const,
  content: '',
  images: [] as [],
  lastModified: '',
};

function bodyWithSpec(overrides: Record<string, unknown> = {}) {
  return {
    ...minimalCompileBody,
    ...overrides,
    spec: { ...minimalCompileBody.spec, ...(overrides.spec as object) },
  };
}

describe('POST /api/compile validation', () => {
  it('returns 400 when spec omits required DesignSpec fields', async () => {
    const res = await app.request('http://localhost/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: { id: 's1' },
        providerId: 'openrouter',
        modelId: 'm',
      }),
    });
    expect(res.status).toBe(400);
    expect(mocks.compileSpecStream).not.toHaveBeenCalled();
  });

  it('returns 400 when promptOptions.existingStrategies has invalid strategy shape', async () => {
    const res = await app.request('http://localhost/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        bodyWithSpec({
          spec: {
            ...minimalCompileBody.spec,
            sections: { 'design-brief': validSection },
          },
          promptOptions: {
            existingStrategies: [{ name: 'only-name' }],
          },
        }),
      ),
    });
    expect(res.status).toBe(400);
    expect(mocks.compileSpecStream).not.toHaveBeenCalled();
  });
});

describe('POST /api/compile SSE wire', () => {
  afterEach(() => {
    mocks.compileSpecStream.mockReset();
    mocks.compileSpecStream.mockImplementation(async () => ({
      id: 'd1',
      specId: 's1',
      dimensions: [],
      hypotheses: [],
      generatedAt: '2020-01-01T00:00:00.000Z',
      compilerModel: 'test-model',
    }));
  });

  it('emits compile_result and done after successful compileSpecStream', async () => {
    const prev = process.env.LOCKDOWN;
    process.env.LOCKDOWN = 'false';
    try {
      const res = await app.request('http://localhost/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyWithSpec()),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
      const text = await res.text();
      expect(text).toContain('event: progress');
      expect(text).toContain('event: compile_result');
      expect(text).toContain('"id":"d1"');
      expect(text).toContain('event: done');
      expect(text).not.toContain('event: error');
    } finally {
      if (prev === undefined) delete process.env.LOCKDOWN;
      else process.env.LOCKDOWN = prev;
    }
  });

  it('emits error then done when compileSpecStream throws', async () => {
    mocks.compileSpecStream.mockRejectedValueOnce(new Error('LLM boom'));
    const prev = process.env.LOCKDOWN;
    process.env.LOCKDOWN = 'false';
    try {
      const res = await app.request('http://localhost/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyWithSpec()),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('event: error');
      expect(text).toContain('LLM boom');
      expect(text).toContain('event: done');
    } finally {
      if (prev === undefined) delete process.env.LOCKDOWN;
      else process.env.LOCKDOWN = prev;
    }
  });
});

describe('POST /api/compile lockdown', () => {
  afterEach(() => {
    mocks.compileSpecStream.mockClear();
  });

  it('clamps provider and model when LOCKDOWN is unset', async () => {
    const prev = process.env.LOCKDOWN;
    delete process.env.LOCKDOWN;
    try {
      const res = await app.request('http://localhost/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimalCompileBody),
      });
      expect(res.status).toBe(200);
      await res.text(); // drain SSE so the stream handler runs compileSpecStream
      expect(mocks.compileSpecStream).toHaveBeenCalledTimes(1);
      const first = mocks.compileSpecStream.mock.calls[0] as unknown as [unknown, string, string];
      expect(first[1]).toBe(LOCKDOWN_MODEL_ID);
      expect(first[2]).toBe(LOCKDOWN_PROVIDER_ID);
    } finally {
      if (prev === undefined) delete process.env.LOCKDOWN;
      else process.env.LOCKDOWN = prev;
    }
  });

  it('passes through client provider and model when LOCKDOWN=false', async () => {
    const prev = process.env.LOCKDOWN;
    process.env.LOCKDOWN = 'false';
    try {
      const res = await app.request('http://localhost/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimalCompileBody),
      });
      expect(res.status).toBe(200);
      await res.text();
      const first = mocks.compileSpecStream.mock.calls[0] as unknown as [unknown, string, string];
      expect(first[1]).toBe('local-llm');
      expect(first[2]).toBe('lmstudio');
    } finally {
      if (prev === undefined) delete process.env.LOCKDOWN;
      else process.env.LOCKDOWN = prev;
    }
  });
});
