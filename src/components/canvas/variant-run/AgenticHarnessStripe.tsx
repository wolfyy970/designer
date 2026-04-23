import { StatusDot } from '@ds/components/ui/status-dot';
import type { StatusDotVariantProps } from '@ds/components/ui/status-dot-variants';
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

function phaseStatusDot(phase?: string): Pick<StatusDotVariantProps, 'tone' | 'animated'> {
  if (!phase) return { tone: 'neutral', animated: false };
  if (phase === 'complete') return { tone: 'success', animated: false };
  if (phase === 'building' || phase === 'evaluating' || phase === 'revising') {
    return { tone: 'accent', animated: false };
  }
  return { tone: 'neutral', animated: false };
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
  /** `strip`: bordered bar (run inspector). `inline`: centered status row for in-node generating shell. */
  layout = 'strip',
}: {
  phase?: string;
  evaluationStatus?: string;
  progressMessage?: string;
  layout?: 'strip' | 'inline';
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

  const shellClass =
    layout === 'inline'
      ? 'flex flex-col items-center gap-1.5'
      : 'shrink-0 border-b border-border-subtle bg-surface-nested/40 px-3 py-2';

  const subtitleClass =
    layout === 'inline'
      ? `${RF_INTERACTIVE} max-w-full text-center text-badge font-normal leading-snug text-fg-muted`
      : `${RF_INTERACTIVE} truncate text-badge font-normal leading-snug text-fg-muted`;

  return (
    <div className={shellClass}>
      {headline ? (
        <div
          className={
            layout === 'inline'
              ? 'flex items-center justify-center gap-2'
              : 'flex items-center gap-2'
          }
        >
          <StatusDot {...phaseStatusDot(phase)} size="md" aria-hidden />
          <span className="text-sm font-medium text-fg-secondary">{headline}</span>
        </div>
      ) : null}
      {subtitle ? (
        <div className={subtitleClass} title={subtitle}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}
