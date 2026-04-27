/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RunTraceEvent } from '../../../../types/provider';
import { Timeline } from '../Timeline';

describe('Timeline Tool use header', () => {
  afterEach(() => {
    cleanup();
  });

  const trace: RunTraceEvent[] = [
    {
      id: 't1',
      at: '2025-01-01T10:00:00.000Z',
      kind: 'model_turn_start',
      label: 'Turn',
      turnId: 1,
    },
    {
      id: 't2',
      at: '2025-01-01T10:00:01.000Z',
      kind: 'model_first_token',
      label: 'First streamed model token received',
      status: 'success',
    },
  ];

  it('hides tool path label in the accordion header when expanded (avoids duplicating the streaming line below)', () => {
    render(
      <Timeline
        trace={trace}
        isStreaming
        streamingLiveness={{
          streamingToolName: 'write',
          streamingToolPath: '/',
          streamingToolChars: 1000,
        }}
      />,
    );

    const toolUseButton = screen.getByRole('button', { name: /Tool use/i });
    expect(toolUseButton.textContent).not.toMatch(/write/);

    // Expanded streaming row: <code>toolName</code> + " → /" + per-tool tokens,
    // no more "Streaming ..." prefix (we standardized on the token-indicator pattern).
    expect(screen.getByText('write')).toBeTruthy();
    // Container text includes the per-tool token estimate (e.g., " · 278 tok").
    expect(screen.getByRole('button', { name: /Tool use/i }).parentElement?.textContent ?? '').toMatch(/ tok/);
  });

  it('shows tool path in the header when the Tool use section is collapsed', () => {
    render(
      <Timeline
        trace={trace}
        isStreaming
        streamingLiveness={{
          streamingToolName: 'write',
          streamingToolPath: '/',
          streamingToolChars: 1000,
        }}
      />,
    );

    const toolUseButton = screen.getByRole('button', { name: /Tool use/i });
    fireEvent.click(toolUseButton);

    expect(toolUseButton.textContent).toMatch(/write/);
  });
});
