import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractMessageText, fetchChatCompletion, fetchModelList, parseChatResponse } from '../provider-fetch';

// ── extractMessageText ───────────────────────────────────────────────

describe('extractMessageText', () => {
  it('extracts content from a standard completion response', () => {
    const data = {
      choices: [{ message: { content: 'Hello world' } }],
    };
    expect(extractMessageText(data)).toBe('Hello world');
  });

  it('returns empty string when choices is missing', () => {
    expect(extractMessageText({})).toBe('');
  });

  it('returns empty string when choices is empty', () => {
    expect(extractMessageText({ choices: [] })).toBe('');
  });

  it('returns empty string when content is missing', () => {
    const data = { choices: [{ message: {} }] };
    expect(extractMessageText(data)).toBe('');
  });

  it('returns empty string when message is missing', () => {
    const data = { choices: [{}] };
    expect(extractMessageText(data)).toBe('');
  });

  it('concatenates OpenAI-style array content parts', () => {
    const data = {
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: '{"dimensions":' },
              { type: 'text', text: '[]}' },
            ],
          },
        },
      ],
    };
    expect(extractMessageText(data)).toBe('{"dimensions":[]}');
  });

  it('includes reasoning-type parts when they carry text', () => {
    const data = {
      choices: [
        {
          message: {
            content: [{ type: 'reasoning', summary: 'Think…' }, { type: 'text', text: 'Hi' }],
          },
        },
      ],
    };
    expect(extractMessageText(data)).toBe('Think…Hi');
  });
});

// ── parseChatResponse ────────────────────────────────────────────────

describe('parseChatResponse', () => {
  it('extracts raw text and token usage', () => {
    const data = {
      choices: [{ message: { content: 'Design output' }, finish_reason: 'stop' }],
      usage: { completion_tokens: 42 },
    };
    const result = parseChatResponse(data);
    expect(result.raw).toBe('Design output');
    expect(result.metadata?.tokensUsed).toBe(42);
    expect(result.metadata?.completionTokens).toBe(42);
    expect(result.metadata?.truncated).toBe(false);
  });

  it('maps OpenRouter-style usage (prompt, details, cost)', () => {
    const data = {
      choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        prompt_tokens_details: { cached_tokens: 5 },
        completion_tokens_details: { reasoning_tokens: 7 },
        cost: 0.001234,
      },
    };
    const result = parseChatResponse(data);
    expect(result.metadata?.promptTokens).toBe(10);
    expect(result.metadata?.completionTokens).toBe(20);
    expect(result.metadata?.tokensUsed).toBe(20);
    expect(result.metadata?.totalTokens).toBe(30);
    expect(result.metadata?.cachedPromptTokens).toBe(5);
    expect(result.metadata?.reasoningTokens).toBe(7);
    expect(result.metadata?.costCredits).toBe(0.001234);
  });

  it('marks truncated when finish_reason is length', () => {
    const data = {
      choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }],
    };
    const result = parseChatResponse(data);
    expect(result.metadata?.truncated).toBe(true);
  });

  it('handles missing usage gracefully', () => {
    const data = {
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    };
    const result = parseChatResponse(data);
    expect(result.metadata).toBeUndefined();
  });

  it('returns empty raw for empty response', () => {
    const result = parseChatResponse({});
    expect(result.raw).toBe('');
  });
});

// ── fetchChatCompletion ──────────────────────────────────────────────

describe('fetchChatCompletion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    const mockData = { choices: [{ message: { content: 'result' } }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    }));

    const result = await fetchChatCompletion(
      'https://api.example.com',
      { model: 'test', messages: [] },
      {},
      'TestProvider',
    );
    expect(result).toEqual(mockData);
  });

  it('throws when a successful response is not a chat completion payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));

    await expect(
      fetchChatCompletion('https://api.example.com', {}, {}, 'TestProvider'),
    ).rejects.toThrow('TestProvider API returned an invalid chat completion response');
  });

  it('throws mapped error for known status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }));

    await expect(
      fetchChatCompletion('https://api.example.com', {}, { 401: 'Invalid API key.' }, 'TestProvider'),
    ).rejects.toThrow('Invalid API key.');
  });

  it('throws generic error for unmapped status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }));

    await expect(
      fetchChatCompletion('https://api.example.com', {}, {}, 'TestProvider'),
    ).rejects.toThrow('TestProvider API error (500): Internal Server Error');
  });

  it('merges extraHeaders into request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchChatCompletion(
      'https://api.example.com',
      {},
      {},
      'TestProvider',
      { Authorization: 'Bearer token123' },
    );

    const calledWith = mockFetch.mock.calls[0][1] as RequestInit;
    expect((calledWith.headers as Record<string, string>)['Authorization']).toBe('Bearer token123');
    expect((calledWith.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});

// ── fetchModelList ───────────────────────────────────────────────────

describe('fetchModelList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps and returns models on success', async () => {
    const mockModels = [{ id: 'gpt-4', name: 'GPT-4' }, { id: 'claude-3', name: 'Claude 3' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockModels }),
    }));

    const result = await fetchModelList(
      'https://api.example.com/models',
      (models) => models.map((m) => ({ id: m.id as string, name: m.name as string })),
    );

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('gpt-4');
  });

  it('returns empty array on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await fetchModelList('https://api.example.com/models', (m) => m as never[]);
    expect(result).toEqual([]);
  });

  it('returns empty array on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await fetchModelList('https://api.example.com/models', (m) => m as never[]);
    expect(result).toEqual([]);
  });

  it('passes extraHeaders to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchModelList(
      'https://api.example.com/models',
      () => [],
      { Authorization: 'Bearer tok' },
    );

    const calledWith = mockFetch.mock.calls[0][1] as RequestInit;
    expect((calledWith.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('handles missing data field gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));

    const result = await fetchModelList('https://api.example.com/models', () => []);
    expect(result).toEqual([]);
  });

  it('returns empty array when data is not a model array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'not-an-array' }),
    }));

    const mapFn = vi.fn();
    const result = await fetchModelList('https://api.example.com/models', mapFn);
    expect(result).toEqual([]);
    expect(mapFn).not.toHaveBeenCalled();
  });
});
