import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOpenRouterChat,
  fetchOpenRouterChatJson,
  mergeHttpTimeoutSignal,
  parseOpenRouterChatResponse,
} from '../openrouter-client.ts';
import { OPENROUTER_HTTP_ERROR_BODY_MAX } from '../constants.ts';

describe('openrouter-client', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = origFetch;
  });

  it('mergeHttpTimeoutSignal returns undefined when timeout unset', () => {
    expect(mergeHttpTimeoutSignal(undefined, undefined)).toBeUndefined();
    const ac = new AbortController();
    expect(mergeHttpTimeoutSignal(ac.signal, undefined)).toBe(ac.signal);
  });

  it('mergeHttpTimeoutSignal skips timeout when non-positive', () => {
    const ac = new AbortController();
    expect(mergeHttpTimeoutSignal(ac.signal, 0)).toBe(ac.signal);
    expect(mergeHttpTimeoutSignal(ac.signal, -1)).toBe(ac.signal);
  });

  it('mergeHttpTimeoutSignal aborts when the caller signal aborts', () => {
    const ac = new AbortController();
    const merged = mergeHttpTimeoutSignal(ac.signal, 60_000);
    expect(merged).toBeDefined();
    expect(merged!.aborted).toBe(false);
    ac.abort();
    expect(merged!.aborted).toBe(true);
  });

  it('fetchOpenRouterChatJson throws on non-OK with truncated body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('x'.repeat(OPENROUTER_HTTP_ERROR_BODY_MAX + 100), { status: 502 }),
    );
    try {
      await fetchOpenRouterChatJson({
        apiKey: 'k',
        requestBody: { model: 'm', messages: [] },
      });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      const msg = (e as Error).message;
      expect(msg.startsWith('OpenRouter 502:')).toBe(true);
      expect(msg.length).toBeLessThanOrEqual('OpenRouter 502: '.length + OPENROUTER_HTTP_ERROR_BODY_MAX + 5);
    }
  });

  it('fetchOpenRouterChatJson throws when body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(
      fetchOpenRouterChatJson({
        apiKey: 'k',
        requestBody: { model: 'm', messages: [] },
      }),
    ).rejects.toThrow('not valid JSON');
  });

  it('fetchOpenRouterChatJson returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }),
    );
    const out = await fetchOpenRouterChatJson({
      apiKey: 'k',
      requestBody: { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(out).toEqual({ choices: [{ message: { content: '{}' } }] });
    expect(vi.mocked(fetch).mock.calls[0]![1]!.body).toContain('"model":"m"');
  });

  it('fetchOpenRouterChat parses and validates success body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }),
    );
    const out = await fetchOpenRouterChat({
      apiKey: 'k',
      requestBody: { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(out.choices[0]!.message.content).toBe('{}');
  });

  it('parseOpenRouterChatResponse accepts valid choices[0].message', () => {
    const data = { choices: [{ message: { content: 'hi', tool_calls: undefined } }] };
    expect(parseOpenRouterChatResponse(data).choices[0]!.message.content).toBe('hi');
  });

  it('parseOpenRouterChatResponse rejects empty choices', () => {
    expect(() => parseOpenRouterChatResponse({ choices: [] })).toThrow('invalid response shape');
  });

  it('parseOpenRouterChatResponse rejects malformed payloads', () => {
    expect(() => parseOpenRouterChatResponse(null)).toThrow('invalid response shape');
    expect(() => parseOpenRouterChatResponse({ choices: 'no' })).toThrow('invalid response shape');
  });

  it('fetchOpenRouterChatJson aborts when timeout fires before response', async () => {
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const s = init?.signal;
          if (s) {
            const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
            if (s.aborted) onAbort();
            else s.addEventListener('abort', onAbort);
          }
        }),
    );
    await expect(
      fetchOpenRouterChatJson({
        apiKey: 'k',
        requestBody: { model: 'm', messages: [] },
        timeoutMs: 15,
      }),
    ).rejects.toThrow(/Aborted|AbortError/);
  });
});
