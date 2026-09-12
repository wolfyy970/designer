/**
 * Public write-ups of the Designer experiment, and when it ran.
 *
 * **Why the date is here and not just prose.** This page describes a body of
 * work that was executed in a bounded window, not an ongoing product claim. The
 * difference matters to a reader deciding how to weigh it: without the date,
 * work from a fixed period reads as the current state of the art of whoever
 * built it. Stating it plainly is cheaper than being misread.
 *
 * Provenance: the repository's only commit activity in the window is
 * 2026-06-04 .. 2026-06-14, so "June 2026" is the experiment period rather than
 * an arbitrary label.
 */

export interface ExperimentWriteUp {
  /** Stable key for React lists. */
  id: string;
  /** Short label, e.g. "Part 1". */
  label: string;
  /** One-line description of what that part covers. */
  blurb: string;
  href: string;
}

/** When the experiment was run. Shown prominently so the work is not misdated. */
export const EXPERIMENT_PERIOD_LABEL = 'June 2026';

const SUBSTACK_QUERY = '?r=mxsut';

export const EXPERIMENT_WRITE_UPS: readonly ExperimentWriteUp[] = [
  {
    id: 'part-1',
    label: 'Part 1',
    blurb: 'The premise, the harness, and what the first runs produced.',
    href: `https://kcwolfy.substack.com/p/the-designer-experiment-part-1${SUBSTACK_QUERY}`,
  },
  {
    id: 'part-2',
    label: 'Part 2',
    blurb: 'What the second round changed, and what it showed.',
    href: `https://kcwolfy.substack.com/p/the-designer-experiment-part-two${SUBSTACK_QUERY}`,
  },
];
