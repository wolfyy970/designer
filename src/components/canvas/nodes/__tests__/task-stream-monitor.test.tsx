/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import TaskStreamMonitor from '../TaskStreamMonitor';
import type { TaskStreamState } from '../../../../hooks/task-stream-state';

const base: TaskStreamState = { status: 'streaming' };

afterEach(() => cleanup());

describe('TaskStreamMonitor — status row', () => {
  it('hides the token chip when streamedModelChars is 0 / unset', () => {
    render(<TaskStreamMonitor state={{ ...base, streamedModelChars: 0 }} elapsed={3} />);
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it('renders "N tokens" with ↓ arrow under 1k with integer count', () => {
    // 1800 chars / 3.6 = 500 tokens
    const { container } = render(
      <TaskStreamMonitor state={{ ...base, streamedModelChars: 1800 }} elapsed={3} />,
    );
    expect(container.textContent).toContain('500 tokens');
    expect(container.textContent).toContain('↓');
  });

  it('renders "Nk tokens" above 1000 with integer formatting', () => {
    // 36_000 / 3.6 = 10_000 tokens → "10k"
    const { container } = render(
      <TaskStreamMonitor state={{ ...base, streamedModelChars: 36_000 }} elapsed={10} />,
    );
    expect(container.textContent).toContain('10k tokens');
  });

  it('renders "N.Nk tokens" for mid-thousand counts', () => {
    // 4200 / 3.6 ≈ 1167 tokens → "1.2k"
    const { container } = render(
      <TaskStreamMonitor state={{ ...base, streamedModelChars: 4200 }} elapsed={10} />,
    );
    expect(container.textContent).toContain('1.2k tokens');
  });

  it('renders elapsed seconds under one minute', () => {
    render(<TaskStreamMonitor state={base} elapsed={42} />);
    expect(screen.queryByText('42s')).not.toBeNull();
  });

  it('renders elapsed as "Nm Ns" at one minute or more', () => {
    render(<TaskStreamMonitor state={base} elapsed={87} />);
    expect(screen.queryByText('1m 27s')).not.toBeNull();
  });

  it('shows the ↓ arrow when no thinking turn is open', () => {
    const { container } = render(
      <TaskStreamMonitor state={{ ...base, streamedModelChars: 1800 }} elapsed={3} />,
    );
    expect(container.textContent).toContain('↓');
    expect(container.querySelector('[aria-label="thinking"]')).toBeNull();
    expect(container.textContent).toContain('tokens');
  });

  it('shows the Brain icon and keeps "tokens" label when a thinking turn is open', () => {
    const { container } = render(
      <TaskStreamMonitor
        state={{
          ...base,
          streamedModelChars: 1800,
          thinkingTurns: [{ turnId: 0, startedAt: Date.now(), text: 'reasoning…' }],
        }}
        elapsed={3}
      />,
    );
    expect(container.querySelector('[aria-label="thinking"]')).not.toBeNull();
    expect(container.textContent).not.toContain('↓');
    expect(container.textContent).toContain('tokens');
  });

  it('reverts to the ↓ arrow once every thinking turn has endedAt', () => {
    const { container } = render(
      <TaskStreamMonitor
        state={{
          ...base,
          streamedModelChars: 1800,
          thinkingTurns: [{ turnId: 0, startedAt: 1, endedAt: 2, text: 'done' }],
        }}
        elapsed={3}
      />,
    );
    expect(container.querySelector('[aria-label="thinking"]')).toBeNull();
    expect(container.textContent).toContain('↓');
  });

  it('falls back to the provided label when no progressMessage is set', () => {
    render(<TaskStreamMonitor state={base} fallbackLabel="Incubating…" />);
    expect(screen.queryByText('Incubating…')).not.toBeNull();
  });

  it('defaults the status label to "Agent working…" when no fallback provided', () => {
    render(<TaskStreamMonitor state={base} />);
    expect(screen.queryByText('Agent working…')).not.toBeNull();
  });

  it('uses progressMessage when present instead of the fallback label', () => {
    render(
      <TaskStreamMonitor
        state={{ ...base, progressMessage: 'Running evaluators…' }}
        fallbackLabel="Agent working…"
      />,
    );
    expect(screen.queryByText('Running evaluators…')).not.toBeNull();
    expect(screen.queryByText('Agent working…')).toBeNull();
  });
});

describe('TaskStreamMonitor — activity excerpt (single line)', () => {
  it('renders the latest activity line when present', () => {
    render(
      <TaskStreamMonitor
        state={{ ...base, activityLog: ["I'll analyze the design specification."] }}
        elapsed={3}
      />,
    );
    expect(screen.queryByText(/I'll analyze the design specification/)).not.toBeNull();
  });

  it('clamps long activity via line-clamp-1 and keeps full text in the title tooltip', () => {
    const long =
      'This is a very very very long line that would definitely overflow past the card width and should stay on one line clamped with ellipsis, title attr carries full text.';
    const { container } = render(
      <TaskStreamMonitor state={{ ...base, activityLog: [long] }} elapsed={3} />,
    );
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p!.className).toContain('line-clamp-1');
    expect(p!.getAttribute('title')).toBe(long);
  });

  it('renders nothing when activity is empty / missing', () => {
    const { container } = render(<TaskStreamMonitor state={base} elapsed={3} />);
    expect(container.querySelector('p')).toBeNull();
  });
});

describe('TaskStreamMonitor — suppressed noise', () => {
  const richState: TaskStreamState = {
    status: 'streaming',
    streamedModelChars: 1800,
    activityLog: ["I'll analyze the design spec."],
    liveSkills: [
      { key: 'a', name: 'A', description: 'x' },
      { key: 'b', name: 'B', description: 'y' },
    ],
    streamingToolName: 'write',
    streamingToolPath: '/home/user/project/result.txt',
    streamingToolChars: 500,
    activeToolName: 'read',
    plannedFileCount: 2,
    liveTodosCount: 1,
    lastWrittenFilePath: '/home/user/project/result.txt',
    codePreview: 'raw code tail…',
    agenticPhase: 'evaluating',
  };

  it('never shows the "File: <path>" line', () => {
    const { container } = render(<TaskStreamMonitor state={richState} elapsed={5} />);
    expect(container.textContent ?? '').not.toMatch(/\bFile:/);
  });

  it('never shows the skills / planned / open-tasks stat strip', () => {
    const { container } = render(<TaskStreamMonitor state={richState} elapsed={5} />);
    expect(container.textContent ?? '').not.toMatch(/skills? loaded/);
    expect(container.textContent ?? '').not.toMatch(/planned/);
    expect(container.textContent ?? '').not.toMatch(/open tasks/);
  });

  it('never shows tool-call streaming rows', () => {
    const { container } = render(<TaskStreamMonitor state={richState} elapsed={5} />);
    expect(container.textContent ?? '').not.toMatch(/Tool:/);
    expect(container.textContent ?? '').not.toMatch(/\bwrite\b/);
  });

  it('never shows the raw code preview', () => {
    const { container } = render(<TaskStreamMonitor state={richState} elapsed={5} />);
    expect(container.textContent ?? '').not.toMatch(/raw code tail/);
  });

  it('never shows the agentic phase tag', () => {
    const { container } = render(<TaskStreamMonitor state={richState} elapsed={5} />);
    expect(container.textContent ?? '').not.toMatch(/evaluating/i);
  });
});
