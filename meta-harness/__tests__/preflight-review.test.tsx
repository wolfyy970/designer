import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { PreflightReview } from '../ui/PreflightReview.tsx';
import type { UnpromotedSession } from '../preflight-promotion-check.ts';

const fixtureSession = (): UnpromotedSession => ({
  sessionFolder: 'session-design-test',
  candidateId: 1,
  meanScore: 3.5,
  stalePrompts: [{ key: 'designer-agentic-system', liveBody: 'live\n', winnerBody: 'winner\n' }],
  staleSkills: [],
  reportPath: 'meta-harness/history/session-design-test/PROMOTION_REPORT.md',
  allFetchesFailed: false,
});

describe('PreflightReview', () => {
  it('renders header, item counter, and action bar', () => {
    const { lastFrame } = render(<PreflightReview session={fixtureSession()} onDone={vi.fn()} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Preflight promotion review');
    expect(frame).toContain('session-design-test');
    expect(frame).toContain('[1/1]');
    expect(frame).toContain('designer-agentic-system');
    expect(frame).toContain('Promote');
    expect(frame).toContain('Skip');
    expect(frame).toContain('Quit');
  });

  it('P triggers continue (promote)', async () => {
    const onDone = vi.fn();
    const { stdin, unmount } = render(<PreflightReview session={fixtureSession()} onDone={onDone} />);
    stdin.write('p');
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('continue'), { timeout: 3000 });
    unmount();
  });

  it('Enter triggers continue (promote)', async () => {
    const onDone = vi.fn();
    const { stdin, unmount } = render(<PreflightReview session={fixtureSession()} onDone={onDone} />);
    stdin.write('\r');
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('continue'), { timeout: 3000 });
    unmount();
  });

  it('S triggers stop (skip)', async () => {
    const onDone = vi.fn();
    const { stdin, unmount } = render(<PreflightReview session={fixtureSession()} onDone={onDone} />);
    stdin.write('s');
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('stop'), { timeout: 3000 });
    unmount();
  });

  it('Q triggers stop (quit)', async () => {
    const onDone = vi.fn();
    const { stdin, unmount } = render(<PreflightReview session={fixtureSession()} onDone={onDone} />);
    stdin.write('q');
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('stop'), { timeout: 3000 });
    unmount();
  });

  it('promoteOnly variant shows correct promote label', () => {
    const { lastFrame } = render(
      <PreflightReview session={fixtureSession()} promoteOnly onDone={vi.fn()} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('apply winner to repo + Langfuse sync');
  });
});
