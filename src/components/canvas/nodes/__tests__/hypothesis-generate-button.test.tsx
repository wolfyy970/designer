/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { HypothesisGenerateButton } from '../HypothesisGenerateButton';

// Radix Slot is imported by the DS Button; stub to a passthrough.
vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

const basePropsIdle = {
  hint: null,
  isGenerating: false,
  canGenerate: true,
  serverAtCapacity: false,
  activeGenerationsCount: 0,
  maxConcurrentRuns: 5,
  onGenerate: () => {},
  onStop: () => {},
  generationProgress: null,
};

afterEach(() => cleanup());

describe('HypothesisGenerateButton — no streaming duplication', () => {
  it('idle: shows "Design" CTA and no streaming copy', () => {
    const { container } = render(<HypothesisGenerateButton {...basePropsIdle} />);
    expect(screen.queryByText('Design')).not.toBeNull();
    expect(container.textContent ?? '').not.toMatch(/Streaming/);
    expect(container.textContent ?? '').not.toMatch(/Stopping ends/);
  });

  it('generating: shows Designing… + short Stop button, no warning copy, no streaming row', () => {
    const { container } = render(
      <HypothesisGenerateButton
        {...basePropsIdle}
        isGenerating
        canGenerate={false}
      />,
    );
    expect(screen.queryByText(/Designing…/)).not.toBeNull();
    // Stop button uses the short label now.
    expect(screen.queryByText(/^Stop$/)).not.toBeNull();
    expect(screen.queryByText(/Stop generation/)).toBeNull();
    // Warning copy removed.
    expect(container.textContent ?? '').not.toMatch(/Stopping ends/);
    expect(container.textContent ?? '').not.toMatch(/partial output may remain/);
    // Streaming tool row stays removed.
    expect(container.textContent ?? '').not.toMatch(/Streaming/);
    expect(container.textContent ?? '').not.toMatch(/\bKB\)/);
  });

  it('server at capacity: shows busy count, not streaming copy', () => {
    const { container } = render(
      <HypothesisGenerateButton
        {...basePropsIdle}
        serverAtCapacity
        activeGenerationsCount={5}
      />,
    );
    expect(screen.queryByText(/Server busy/)).not.toBeNull();
    expect(container.textContent ?? '').not.toMatch(/Streaming/);
  });
});
