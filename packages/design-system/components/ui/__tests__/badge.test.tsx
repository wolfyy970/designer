import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Badge } from '../badge';

beforeEach(() => {
  cleanup();
});

describe('Badge', () => {
  it('forwards ref to the underlying span element', () => {
    let refEl: HTMLSpanElement | null = null;
    render(
      <Badge ref={(el) => { refEl = el; }}>Ref test</Badge>,
    );
    expect(refEl).toBe(screen.getByText('Ref test'));
  });

  it('renders pill warning with correct classes', () => {
    const { container } = render(<Badge shape="pill" tone="warning">Warn</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('rounded-full');
    expect(span.className).toContain('text-nano');
    expect(span.className).not.toContain('font-mono');
    expect(span.className).not.toContain('border-warning');
    expect(span.className).toContain('bg-warning-subtle');
    expect(span.className).toContain('text-warning');
  });

  it('renders pill success with correct classes', () => {
    const { container } = render(<Badge shape="pill" tone="success">OK</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).not.toContain('border-success');
    expect(span.className).toContain('bg-success-subtle');
    expect(span.className).toContain('text-success');
  });

  it('renders pill accent with correct classes', () => {
    const { container } = render(<Badge shape="pill" tone="accent">Info</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).not.toContain('border-accent');
    expect(span.className).toContain('bg-accent-subtle');
    expect(span.className).toContain('text-accent');
  });

  it('renders pill neutral with correct classes', () => {
    const { container } = render(<Badge shape="pill" tone="neutral">Tag</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).not.toContain('border-border');
    expect(span.className).toContain('bg-surface-meta-chip');
    expect(span.className).toContain('text-fg-muted');
  });

  it('renders tab warning with correct classes', () => {
    const { container } = render(<Badge shape="tab" tone="warning">Draft</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('rounded');
    expect(span.className).not.toContain('rounded-full');
    expect(span.className).toContain('bg-warning-subtle');
    expect(span.className).toContain('text-warning');
  });

  it('renders tab success with correct classes', () => {
    const { container } = render(<Badge shape="tab" tone="success">Best</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('bg-success-surface');
    expect(span.className).toContain('text-success');
  });

  it('renders tab accent with correct classes', () => {
    const { container } = render(<Badge shape="tab" tone="accent">New</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('bg-accent-surface');
    expect(span.className).toContain('text-accent');
  });

  it('renders tab neutral with correct classes', () => {
    const { container } = render(<Badge shape="tab" tone="neutral">Archived</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('bg-surface-meta-chip');
    expect(span.className).toContain('text-fg-muted');
  });

  it('merges additional className', () => {
    const { container } = render(<Badge className="custom-class">With extra</Badge>);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('custom-class');
  });
});
