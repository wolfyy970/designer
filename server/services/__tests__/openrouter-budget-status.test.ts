import { describe, expect, it, vi } from 'vitest';
import {
  getOpenRouterBudgetStatus,
  nextOpenRouterResetAt,
} from '../openrouter-budget-status.ts';

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('nextOpenRouterResetAt', () => {
  const now = new Date('2026-04-29T15:30:00.000Z');

  it('computes daily reset at next midnight UTC', () => {
    expect(nextOpenRouterResetAt('daily', now)).toBe('2026-04-30T00:00:00.000Z');
  });

  it('computes weekly reset at next Monday midnight UTC', () => {
    expect(nextOpenRouterResetAt('weekly', now)).toBe('2026-05-04T00:00:00.000Z');
  });

  it('computes monthly reset at first day of next month midnight UTC', () => {
    expect(nextOpenRouterResetAt('monthly', now)).toBe('2026-05-01T00:00:00.000Z');
  });
});

describe('getOpenRouterBudgetStatus', () => {
  const now = new Date('2026-04-29T15:30:00.000Z');

  it('returns available with reset information for a daily budget', async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        data: {
          limit: 100,
          limit_remaining: 25,
          limit_reset: 'daily',
          usage_daily: 75,
        },
      }),
    ) as unknown as typeof fetch;

    const status = await getOpenRouterBudgetStatus({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai',
      now,
      fetchImpl,
    });

    expect(status).toMatchObject({
      status: 'available',
      limit: 100,
      limitRemaining: 25,
      limitReset: 'daily',
      usageDaily: 75,
      resetAt: '2026-04-30T00:00:00.000Z',
    });
  });

  it('returns out_of_credits when the key has no remaining budget', async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        data: {
          limit: 100,
          limit_remaining: 0,
          limit_reset: 'daily',
          usage_daily: 100,
        },
      }),
    ) as unknown as typeof fetch;

    const status = await getOpenRouterBudgetStatus({ apiKey: 'sk-test', now, fetchImpl });

    expect(status.status).toBe('out_of_credits');
    expect(status.resetAt).toBe('2026-04-30T00:00:00.000Z');
  });

  it('treats unlimited keys as available without reset copy', async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        data: {
          limit: null,
          limit_remaining: null,
          limit_reset: null,
        },
      }),
    ) as unknown as typeof fetch;

    const status = await getOpenRouterBudgetStatus({ apiKey: 'sk-test', now, fetchImpl });

    expect(status.status).toBe('available');
    expect(status.limitRemaining).toBeNull();
    expect(status.resetAt).toBeUndefined();
  });

  it('returns not_configured without an API key', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const status = await getOpenRouterBudgetStatus({ apiKey: '', now, fetchImpl });

    expect(status.status).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns unknown when the OpenRouter check fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const status = await getOpenRouterBudgetStatus({ apiKey: 'sk-test', now, fetchImpl });

    expect(status.status).toBe('unknown');
  });
});
