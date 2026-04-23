/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GeneratingFooter } from '../GeneratingFooter';

describe('GeneratingFooter', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows elapsed seconds under one minute', () => {
    render(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={42}
        liveness={{}}
      />,
    );
    expect(screen.getByText('42s')).toBeTruthy();
  });

  it('shows elapsed in "Nm Ns" format at one minute or more', () => {
    render(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={87}
        liveness={{}}
      />,
    );
    expect(screen.getByText('1m 27s')).toBeTruthy();
  });

  it('shows ↓ token chip when streamedModelChars is present', () => {
    const { container } = render(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={10}
        // 1800 chars / 3.6 = 500 tokens
        liveness={{ streamedModelChars: 1800 }}
      />,
    );
    expect(container.textContent).toContain('500 tokens');
    expect(container.textContent).toContain('↓');
  });

  it('omits the token chip when streamedModelChars is absent', () => {
    render(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={10}
        liveness={{}}
      />,
    );
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it('shows the ↓ arrow for output streaming and Brain icon when thinking is active', () => {
    const { container, rerender } = render(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={10}
        liveness={{ streamedModelChars: 1800 }}
      />,
    );
    expect(container.textContent).toContain('↓');
    expect(container.querySelector('[aria-label="thinking"]')).toBeNull();

    rerender(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={10}
        liveness={{ streamedModelChars: 1800, activeThinkingStartedAt: Date.now() }}
      />,
    );
    expect(container.querySelector('[aria-label="thinking"]')).not.toBeNull();
    expect(container.textContent).toContain('tokens');
  });

  it('does not show streaming-file KB rows', () => {
    render(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={5}
        liveness={{
          streamingToolName: 'write_file',
          streamingToolChars: 2048,
          streamingToolPath: '/src/index.html',
        }}
      />,
    );
    expect(screen.queryByText(/Streaming/)).toBeNull();
    expect(screen.queryByText(/KB/)).toBeNull();
  });
});
