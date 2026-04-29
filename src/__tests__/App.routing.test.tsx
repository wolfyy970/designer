/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

vi.mock('../hooks/useThemeEffect', () => ({
  useThemeEffect: () => {},
}));

vi.mock('../services/idb-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/idb-storage')>();
  return {
    ...actual,
    garbageCollect: vi.fn(async () => ({ codesRemoved: 0, provenanceRemoved: 0, filesRemoved: 0 })),
  };
});

vi.mock('../pages/CanvasPage', () => ({
  default: () => <div data-testid="canvas-page">Canvas page</div>,
}));

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
  autoImprove: true,
};

const validProviderStatusJson = {
  status: 'available',
  checkedAt: '2026-04-29T15:30:00.000Z',
  message: 'OpenRouter credits are available.',
};

function installDesktopMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('App routing', () => {
  beforeEach(() => {
    installDesktopMatchMedia();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith('/provider-status/openrouter')
          ? validProviderStatusJson
          : validConfigJson;
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('renders the home page without checking API config', async () => {
    window.history.replaceState(null, '', '/');

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Designer' })).not.toBeNull();
    });
    expect(fetch).not.toHaveBeenCalledWith('/api/config', expect.any(Object));
  });

  it('keeps the API gate on the canvas route', async () => {
    window.history.replaceState(null, '', '/canvas');

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('canvas-page')).not.toBeNull();
    });
    expect(fetch).toHaveBeenCalledWith('/api/config', expect.any(Object));
  });
});
