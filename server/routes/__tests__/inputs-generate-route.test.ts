import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggedCallLLM: vi.fn(async (...args: unknown[]) => {
    void args;
    return '  trimmed body  ';
  }),
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
  inputId: 'research-context' as const,
  designBrief: 'A design brief',
  providerId: 'openrouter',
  modelId: 'minimax/minimax-m2.5',
};

describe('POST /api/inputs/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid inputId', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, inputId: 'design-brief' }),
    });
    expect(res.status).toBe(400);
    expect(loggedCallLLM).not.toHaveBeenCalled();
  });

  it('returns 400 when designBrief empty', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, designBrief: '' }),
    });
    expect(res.status).toBe(400);
    expect(loggedCallLLM).not.toHaveBeenCalled();
  });

  it('returns JSON result and resolves system prompt via getPromptBody', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseBody),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: string };
    expect(json.result).toBe('trimmed body');
    expect(getPromptBody).toHaveBeenCalledWith('inputs-gen-research-context');
    expect(loggedCallLLM).toHaveBeenCalledTimes(1);
    const call0 = loggedCallLLM.mock.calls[0];
    expect(call0).toBeDefined();
    const firstMsg = call0![0] as { role: string; content: string }[];
    expect(firstMsg[0]?.role).toBe('system');
    expect(firstMsg[0]?.content).toBe('system from seed');
    expect(firstMsg[1]?.role).toBe('user');
    expect(firstMsg[1]?.content).toContain('<target_input>research-context</target_input>');
  });

  it('uses prompt override when provided', async () => {
    const res = await app.request('http://localhost/api/inputs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseBody,
        inputId: 'objectives-metrics',
        promptOverrides: {
          'inputs-gen-objectives-metrics': 'override system',
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
