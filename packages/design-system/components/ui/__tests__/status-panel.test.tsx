import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusPanel } from '../status-panel';

afterEach(() => cleanup());

describe('StatusPanel', () => {
  it('renders title, status, actions, and children', () => {
    render(
      <StatusPanel
        title="Design specification"
        status="ready"
        tone="success"
        actions={<button type="button">Refresh</button>}
      >
        Updated just now
      </StatusPanel>,
    );

    expect(screen.getByText('Design specification')).toBeTruthy();
    expect(screen.getByText('ready')).toBeTruthy();
    expect(screen.getByText('Refresh')).toBeTruthy();
    expect(screen.getByText('Updated just now')).toBeTruthy();
  });

  it('uses the requested status tone', () => {
    const { container } = render(
      <StatusPanel title="Status" status="error" tone="error" />,
    );

    expect(container.querySelector('.bg-error')).toBeTruthy();
  });

  it('supports compact density for dense node chrome', () => {
    const { container } = render(
      <StatusPanel title="DESIGN.md" status="optional" density="compact" />,
    );

    expect(container.firstElementChild?.className).toContain('py-1.5');
    expect(container.firstElementChild?.className).toContain('min-h-8');
    expect(screen.getByText('DESIGN.md')).toBeTruthy();
  });

  it('can omit status text while keeping the compact row height and dot', () => {
    const { container } = render(
      <StatusPanel title="Design specification" tone="success" density="compact" />,
    );

    expect(container.firstElementChild?.className).toContain('min-h-8');
    expect(container.querySelector('.bg-success')).toBeTruthy();
    expect(container.textContent).toContain('Design specification');
  });
});
