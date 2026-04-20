/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiServerGate } from '../ApiServerGate';
import { API_SERVER_GATE_DESIGN_TOKENS_PATH } from '../../../lib/api-server-gate-utils';

const validConfigJson = {
  lockdown: false,
  agenticMaxRevisionRounds: 2,
  agenticMinOverallScore: 3,
  defaultRubricWeights: {
    design: 0.35,
    strategy: 0.3,
    implementation: 0.25,
    browser: 0.1,
  },
  maxConcurrentRuns: 5,
};

function renderGate(initialPath: string, ui: ReactNode, queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="*"
            element={<ApiServerGate>{ui}</ApiServerGate>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ApiServerGate', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows blocking UI when GET /api/config fails', async () => {
    renderGate('/canvas', <div data-testid="inside">workspace</div>);

    await waitFor(() => {
      expect(screen.queryByText('API server not reachable')).not.toBeNull();
    });

    expect(screen.queryByTestId('inside')).toBeNull();
  });

  it('renders children after config loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(validConfigJson), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    renderGate('/canvas', <div data-testid="inside">workspace</div>);

    await waitFor(() => {
      expect(screen.queryByTestId('inside')).not.toBeNull();
    });

    expect(screen.queryByText('API server not reachable')).toBeNull();
  });

  it('skips the API check for dev design tokens path', () => {
    renderGate(API_SERVER_GATE_DESIGN_TOKENS_PATH, <div data-testid="kitchen-sink">sink</div>);

    expect(screen.queryByTestId('kitchen-sink')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
