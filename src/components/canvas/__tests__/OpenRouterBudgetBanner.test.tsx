/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenRouterBudgetBanner from '../OpenRouterBudgetBanner';

const mocks = vi.hoisted(() => ({
  budgetStatus: {
    data: {
      status: 'available',
      checkedAt: '2026-04-29T15:30:00.000Z',
      message: 'OpenRouter credits are available.',
    },
  },
  appConfig: { data: { lockdown: true } },
  hasOpenRouterNode: true,
}));

vi.mock('../../../hooks/useOpenRouterBudgetStatus', () => ({
  useOpenRouterBudgetStatus: () => mocks.budgetStatus,
}));

vi.mock('../../../hooks/useAppConfig', () => ({
  useAppConfig: () => mocks.appConfig,
}));

vi.mock('../../../stores/canvas-store', () => ({
  useCanvasStore: (selector: (state: { nodes: Array<{ data?: Record<string, unknown> }> }) => unknown) =>
    selector({
      nodes: mocks.hasOpenRouterNode ? [{ data: { providerId: 'openrouter' } }] : [],
    }),
}));

describe('OpenRouterBudgetBanner', () => {
  afterEach(() => {
    cleanup();
    mocks.budgetStatus = {
      data: {
        status: 'available',
        checkedAt: '2026-04-29T15:30:00.000Z',
        message: 'OpenRouter credits are available.',
      },
    };
    mocks.appConfig = { data: { lockdown: true } };
    mocks.hasOpenRouterNode = true;
  });

  it('is hidden when OpenRouter budget is available', () => {
    render(<OpenRouterBudgetBanner />);

    expect(screen.queryByText('Out of OpenRouter credits.')).toBeNull();
  });

  it('shows reset time when OpenRouter budget is exhausted', () => {
    mocks.budgetStatus = {
      data: {
        status: 'out_of_credits',
        checkedAt: '2026-04-29T15:30:00.000Z',
        message: 'OpenRouter credits are exhausted.',
        resetAt: '2026-04-30T00:00:00.000Z',
      },
    };

    render(<OpenRouterBudgetBanner />);

    expect(screen.getByText('Out of OpenRouter credits.')).not.toBeNull();
    expect(screen.getByText(/Runs using OpenRouter will fail until/).textContent).toContain('UTC');
  });

  it('does not warn non-OpenRouter canvases outside lockdown', () => {
    mocks.budgetStatus = {
      data: {
        status: 'out_of_credits',
        checkedAt: '2026-04-29T15:30:00.000Z',
        message: 'OpenRouter credits are exhausted.',
      },
    };
    mocks.appConfig = { data: { lockdown: false } };
    mocks.hasOpenRouterNode = false;

    render(<OpenRouterBudgetBanner />);

    expect(screen.queryByText('Out of OpenRouter credits.')).toBeNull();
  });
});
