import { describe, expect, it, vi, beforeEach } from 'vitest';

const { getOpenRouterBudgetStatus } = vi.hoisted(() => ({
  getOpenRouterBudgetStatus: vi.fn(async () => ({
    status: 'available',
    checkedAt: '2026-04-29T15:30:00.000Z',
    message: 'OpenRouter credits are available.',
  })),
}));

vi.mock('../../services/openrouter-budget-status.ts', () => ({
  getOpenRouterBudgetStatus,
}));

import app from '../../app.ts';

describe('GET /api/provider-status/openrouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the parsed OpenRouter budget status', async () => {
    const res = await app.request('http://localhost/api/provider-status/openrouter');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'available',
      checkedAt: '2026-04-29T15:30:00.000Z',
    });
    expect(getOpenRouterBudgetStatus).toHaveBeenCalledOnce();
  });
});
