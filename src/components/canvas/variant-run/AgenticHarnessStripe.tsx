export function AgenticHarnessStripe({
  phase,
  evaluationStatus,
}: {
  phase?: string;
  evaluationStatus?: string;
}) {
  if (!phase && !evaluationStatus) return null;
  return (
    <div className="border-b border-border-subtle px-3 py-1.5 shrink-0 bg-surface-nested/80">
      {phase ? (
        <div className="text-badge font-medium uppercase tracking-wider text-fg-faint">{phase}</div>
      ) : null}
      {evaluationStatus ? (
        <div className="text-nano text-fg-muted truncate nodrag nowheel" title={evaluationStatus}>
          {evaluationStatus}
        </div>
      ) : null}
    </div>
  );
}
