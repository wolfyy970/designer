/**
 * The "Eval round" selector shared by the Files and Design tabs.
 *
 * The markup was byte-identical in both tabs, which is how the two drifted into
 * computing their loading states separately. One component, one place to change.
 */
export function RoundSelector({
  rounds,
  selectedIndex,
  lastRoundNum,
  onSelectIndex,
}: {
  rounds: readonly { round: number }[];
  /** Index into `rounds`, clamped by the caller. */
  selectedIndex: number;
  /** Round number that should be labelled "(final)". */
  lastRoundNum: number | undefined;
  onSelectIndex: (index: number) => void;
}) {
  if (rounds.length <= 1) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
      <span className="text-badge font-medium uppercase tracking-wider text-fg-faint">
        Eval round
      </span>
      <select
        className="nodrag max-w-[var(--width-model-trigger)] rounded border border-border-subtle bg-surface px-2 py-0.5 text-nano text-fg"
        value={selectedIndex}
        onChange={(e) => onSelectIndex(Number(e.target.value))}
      >
        {rounds.map((r, i) => (
          <option key={r.round} value={i}>
            Round {r.round}
            {r.round === lastRoundNum ? ' (final)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
