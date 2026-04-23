import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';

// Suppress React Slot portal warnings in test output
vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

beforeEach(() => {
  cleanup();
});

describe('Button', () => {
  it('forwards ref to the underlying button element', () => {
    let refEl: HTMLButtonElement | null = null;
    render(
      <Button ref={(el) => { refEl = el; }}>Click me</Button>,
    );
    expect(refEl).toBe(screen.getByRole('button'));
  });

  it('forwards aria props to the button element', () => {
    render(<Button aria-label="Submit form" aria-describedby="hint">Submit</Button>);
    const btn = screen.getByRole('button', { name: 'Submit form' });
    expect(btn.getAttribute('aria-label')).toBe('Submit form');
    expect(btn.getAttribute('aria-describedby')).toBe('hint');
  });

  it('renders primary variant with correct classes', () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('bg-accent');
    expect(btn.className).toContain('text-white');
  });

  it('renders secondary variant with border classes', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('border-border');
    expect(btn.className).toContain('bg-surface-raised');
  });

  it('renders destructive variant as secondary shape with error text', () => {
    const { container } = render(<Button variant="destructive">Delete</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('border-border');
    expect(btn.className).toContain('bg-surface-raised');
    expect(btn.className).toContain('text-error');
    expect(btn.className).toContain('hover:bg-error-subtle');
  });

  it('renders ghost variant', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('text-fg-secondary');
  });

  it('renders link variant with accent text', () => {
    const { container } = render(<Button variant="link">Link</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('text-accent');
    expect(btn.className).toContain('underline');
  });

  it('renders sm size', () => {
    const { container } = render(<Button size="sm">Small</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('h-7');
    expect(btn.className).toContain('px-2');
  });

  it('renders md size (default)', () => {
    const { container } = render(<Button>Default</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('h-8');
    expect(btn.className).toContain('px-3');
  });

  it('renders lg size', () => {
    const { container } = render(<Button size="lg">Large</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('h-9');
    expect(btn.className).toContain('px-4');
  });

  it('renders icon size', () => {
    const { container } = render(<Button size="icon">Icon</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('size-8');
  });

  it('renders iconSm size', () => {
    const { container } = render(<Button size="iconSm">IconSm</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('size-5');
    expect(btn.className).toContain('p-0.5');
  });

  it('applies disabled state and prevents interaction', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Cannot click</Button>);
    const btn = screen.getByRole('button', { name: 'Cannot click' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('merges additional className', () => {
    const { container } = render(<Button className="custom-class">With extra</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('custom-class');
  });
});
