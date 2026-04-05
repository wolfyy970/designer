import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggedCallLLM: vi.fn(
    async (_messages: unknown, _model: string, _provider: string, _opts: unknown, _ctx: unknown) =>
      '  trimmed body  ',
  ),
  getPromptBody: vi.fn(async () => 'system from seed'),
}));

vi.mock('../../lib/llm-call-logger.ts', () => ({
  loggedCallLLM: mocks.loggedCallLLM,
}));

vi.mock('../../db/prompts.ts', () => ({
  getPromptBody: mocks.getPromptBody,
}));

import app from '../../app.ts';

const { loggedCallLLM, getPromptBody } = mocks;

const baseBody = {
  sectionId: 'research-context' as const,
  designBrief: 'A design brief',
  providerId: 'openrouter',
  modelId: 'minimax/minimax-m2.5',
};

describe('POST /api/section/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid sectionId', async () => {
    const res = await app.request('http://localhost/api/section/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, sectionId: 'design-brief' }),
    });
    expect(res.status).toBe(400);
    expect(loggedCallLLM).not.toHaveBeenCalled();
  });

  it('returns 400 when designBrief empty', async () => {
    const res = await app.request('http://localhost/api/section/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, designBrief: '' }),
    });
    expect(res.status).toBe(400);
    expect(loggedCallLLM).not.toHaveBeenCalled();
  });

  it('returns JSON result and resolves system prompt via getPromptBody', async () => {
    const res = await app.request('http://localhost/api/section/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseBody),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: string };
    expect(json.result).toBe('trimmed body');
    expect(getPromptBody).toHaveBeenCalledWith('section-gen-research-context');
    expect(loggedCallLLM).toHaveBeenCalledTimes(1);
    const call0 = loggedCallLLM.mock.calls[0];
    expect(call0).toBeDefined();
    const firstMsg = call0![0] as { role: string; content: string }[];
    expect(firstMsg[0]?.role).toBe('system');
    expect(firstMsg[0]?.content).toBe('system from seed');
    expect(firstMsg[1]?.role).toBe('user');
    expect(firstMsg[1]?.content).toContain('<target_section>research-context</target_section>');
  });

  it('uses prompt override when provided', async () => {
    const res = await app.request('http://localhost/api/section/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseBody,
        sectionId: 'objectives-metrics',
        promptOverrides: {
          'section-gen-objectives-metrics': 'override system',
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(getPromptBody).not.toHaveBeenCalled();
    expect(loggedCallLLM).toHaveBeenCalledTimes(1);
    const call0 = loggedCallLLM.mock.calls[0];
    expect(call0).toBeDefined();
    const firstMsg = call0![0] as { role: string; content: string }[];
    expect(firstMsg[0]?.content).toBe('override system');
  });
});
