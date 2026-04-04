import { RF_INTERACTIVE } from '../../../constants/canvas';

/** User-facing step title — avoid raw enum + ALL CAPS (“REVISING” reads noisy next to “Revision round”). */
const PHASE_HEADLINE: Record<string, string> = {
  building: 'Building',
  evaluating: 'Running evaluators',
  revising: 'Applying evaluator feedback',
  complete: 'Finishing run',
};

function phaseHeadline(phase?: string): string | undefined {
  if (!phase) return undefined;
  return PHASE_HEADLINE[phase] ?? phase.charAt(0).toUpperCase() + phase.slice(1);
}

/** Matches legacy `onRevisionRound` updates — used only to recover round number for copy. */
function revisionRoundFromStatus(status?: string): number | undefined {
  const m = status?.match(/^Revision round (\d+)$/i);
  return m ? Number(m[1]) : undefined;
}

export function AgenticHarnessStripe({
  phase,
  evaluationStatus,
  progressMessage,
}: {
  phase?: string;
  evaluationStatus?: string;
  progressMessage?: string;
}) {
  const headline = phaseHeadline(phase);
  const revRound = phase === 'revising' ? revisionRoundFromStatus(evaluationStatus) : undefined;

  const subtitle =
    phase === 'revising'
      ? [revRound != null ? `Round ${revRound}` : null, progressMessage?.trim() || null]
          .filter(Boolean)
          .join(' · ') || evaluationStatus
      : evaluationStatus;

  if (!headline && !subtitle) return null;
  return (
    <div className="border-b border-border-subtle px-3 py-1.5 shrink-0 bg-surface-nested/80">
      {headline ? (
        <div className="text-micro font-semibold tracking-wide text-fg-secondary">{headline}</div>
      ) : null}
      {subtitle ? (
        <div
          className={`${RF_INTERACTIVE} text-badge font-normal leading-snug text-fg-muted truncate`}
          title={subtitle}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}
