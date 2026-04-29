import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractDesignSystem,
  generateInputContent,
  generateInternalContext,
} from '../client-task-stream';
import { SSE_EVENT_NAMES } from '../../constants/sse-events';
import { LOST_STREAM_CONNECTION_MESSAGE } from '../client-sse-lifecycle';

function sseResponse(events: { name: string; data: Record<string, unknown> }[]): Response {
  const encoder = new TextEncoder();
  const chunk = events.map((e) => `event: ${e.name}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const modelFields = {
  providerId: 'openrouter',
  modelId: 'minimax/minimax-m2.5',
};

describe('task stream client contract validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects malformed design-system task_result lint payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            name: SSE_EVENT_NAMES.task_result,
            data: {
              result: '# DESIGN.md',
              lint: { errors: -1, warnings: 0, infos: 0 },
            },
          },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    await expect(
      extractDesignSystem({
        ...modelFields,
        content: 'Use crisp cards.',
      }),
    ).rejects.toThrow(/Invalid task result payload/);
  });

  it('rejects malformed inputs task_result payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.task_result, data: { result: 123 } },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    await expect(
      generateInputContent({
        ...modelFields,
        inputId: 'research-context',
        designBrief: 'Improve onboarding.',
      }),
    ).rejects.toThrow(/Invalid task result payload/);
  });

  it('rejects malformed internal-context task_result payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.task_result, data: { markdown: '# Context' } },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    await expect(
      generateInternalContext({
        ...modelFields,
        sourceHash: 'fnv1a:test',
        spec: {
          id: 'spec-1',
          title: 'Spec',
          sections: {},
          version: 1,
          createdAt: '',
          lastModified: '',
        },
      }),
    ).rejects.toThrow(/Invalid task result payload/);
  });

  it('maps fetch/network failure to the lost-connection message', async () => {
    const onError = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      generateInputContent(
        {
          ...modelFields,
          inputId: 'research-context',
          designBrief: 'Improve onboarding.',
        },
        { agentic: { onError } },
      ),
    ).rejects.toThrow(LOST_STREAM_CONNECTION_MESSAGE);

    expect(onError).toHaveBeenCalledWith(LOST_STREAM_CONNECTION_MESSAGE);
  });
});
