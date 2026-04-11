/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GeneratingFooter } from '../GeneratingFooter';

describe('GeneratingFooter', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows streaming KB line when compact is true and a tool argument is streaming', () => {
    render(
      <GeneratingFooter
        plan={undefined}
        written={0}
        elapsed={0}
        compact
        liveness={{
          streamingToolName: 'write_file',
          streamingToolChars: 2048,
          streamingToolPath: '/src/index.html',
        }}
      />,
    );

    expect(screen.getByText(/Streaming/)).toBeTruthy();
    expect(screen.getByText('write_file')).toBeTruthy();
    expect(screen.getByText(/2\.0 KB/)).toBeTruthy();
  });
});
