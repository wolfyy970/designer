import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StatusDot } from '../status-dot';

beforeEach(() => {
  cleanup();
});

describe('StatusDot', () => {
  it('renders with default accent tone + sm size, not animated', () => {
    const { container } = render(<StatusDot />);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('bg-accent');
    expect(span.className).toContain('h-1.5');
    expect(span.className).toContain('w-1.5');
    expect(span.className).toContain('rounded-full');
    expect(span.className).toContain('shrink-0');
    expect(span.className).not.toContain('animate-pulse');
  });

  it.each(['accent', 'success', 'warning', 'info', 'neutral'] as const)(
    'applies tone=%s',
    (tone) => {
      const { container } = render(<StatusDot tone={tone} />);
      const cls = container.querySelector('span')!.className;
      if (tone === 'neutral') expect(cls).toContain('bg-fg-faint');
      else expect(cls).toContain(`bg-${tone}`);
    },
  );

  it('applies size=md', () => {
    const { container } = render(<StatusDot size="md" />);
    const cls = container.querySelector('span')!.className;
    expect(cls).toContain('h-2');
    expect(cls).toContain('w-2');
  });

  it('adds animate-pulse when animated', () => {
    const { container } = render(<StatusDot animated />);
    expect(container.querySelector('span')!.className).toContain('animate-pulse');
  });

  it('forwards className and aria props', () => {
    const { container } = render(
      <StatusDot className="custom-x" aria-hidden aria-label="live" />,
    );
    const span = container.querySelector('span')!;
    expect(span.className).toContain('custom-x');
    expect(span.getAttribute('aria-hidden')).toBe('true');
    expect(span.getAttribute('aria-label')).toBe('live');
  });

  it('forwards ref to the underlying span', () => {
    let refEl: HTMLSpanElement | null = null;
    render(<StatusDot ref={(el) => { refEl = el; }} />);
    expect(refEl).toBeInstanceOf(HTMLSpanElement);
  });
});
