/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewportGate } from '../ViewportGate';

function stubNarrowViewport(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
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

describe('ViewportGate', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the Designer desktop-only fallback with a home link on narrow viewports', () => {
    stubNarrowViewport(true);

    render(
      <MemoryRouter>
        <ViewportGate>
          <div data-testid="canvas">canvas</div>
        </ViewportGate>
      </MemoryRouter>,
    );

    expect(screen.getByText('Designer')).not.toBeNull();
    expect(screen.getByText('Desktop only.')).not.toBeNull();
    expect(screen.getByText(/The canvas needs a wider screen/)).not.toBeNull();
    expect(screen.getByText(/1024px/)).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
    expect(screen.queryByTestId('canvas')).toBeNull();
  });

  it('renders children on desktop viewports', () => {
    stubNarrowViewport(false);

    render(
      <MemoryRouter>
        <ViewportGate>
          <div data-testid="canvas">canvas</div>
        </ViewportGate>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('canvas')).not.toBeNull();
  });
});
