export function AgenticHarnessStripe({
  phase,
  evaluationStatus,
}: {
  phase?: string;
  evaluationStatus?: string;
}) {
  if (!phase && !evaluationStatus) return null;
  return (
    <div className="border-b border-border-subtle px-3 py-1.5 shrink-0 bg-surface-secondary/80">
      {phase ? (
        <div className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">{phase}</div>
      ) : null}
      {evaluationStatus ? (
        <div className="text-[10px] text-fg-muted truncate nodrag nowheel" title={evaluationStatus}>
          {evaluationStatus}
        </div>
      ) : null}
    </div>
  );
}
