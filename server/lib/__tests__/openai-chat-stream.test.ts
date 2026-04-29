import { describe, expect, it, vi, afterEach } from 'vitest';
import { OPENROUTER_CREDIT_EXHAUSTED_MESSAGE } from '../../../src/lib/openrouter-budget.ts';
import { streamOpenAICompatibleChat } from '../openai-chat-stream.ts';

function streamResponse(lines: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${lines.join('\n')}\n`));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

describe('streamOpenAICompatibleChat OpenRouter credit errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps pre-stream 402 errors to credit exhaustion copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: 402, message: 'Your account has insufficient credits.' } }),
        { status: 402 },
      ),
    ));

    await expect(
      streamOpenAICompatibleChat(
        'https://openrouter.ai/api/v1/chat/completions',
        {},
        { errorMap: {}, providerLabel: 'OpenRouter' },
        () => {},
      ),
    ).rejects.toThrow(OPENROUTER_CREDIT_EXHAUSTED_MESSAGE);
  });

  it('maps mid-stream error chunks to credit exhaustion copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      streamResponse([
        'data: {"error":{"code":402,"message":"Your account has insufficient credits."},"choices":[{"delta":{"content":""},"finish_reason":"error"}]}',
      ]),
    ));

    await expect(
      streamOpenAICompatibleChat(
        'https://openrouter.ai/api/v1/chat/completions',
        {},
        { errorMap: {}, providerLabel: 'OpenRouter' },
        () => {},
      ),
    ).rejects.toThrow(OPENROUTER_CREDIT_EXHAUSTED_MESSAGE);
  });
});
