import { describe, it, expect, vi, afterEach } from 'vitest';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { ErrorBoundary } from '../ErrorBoundary.tsx';

function Thrower({ fail }: { fail: boolean }) {
  if (fail) throw new Error('boom-ui');
  return <Text>ok</Text>;
}

describe('ErrorBoundary (meta-harness TUI)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders error message when child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { lastFrame } = render(
      <ErrorBoundary>
        <Thrower fail />
      </ErrorBoundary>,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('boom-ui');
    expect(frame.toLowerCase()).toContain('plain');
  });

  it('renders children when no error', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <Thrower fail={false} />
      </ErrorBoundary>,
    );
    expect(lastFrame()).toContain('ok');
  });
});
