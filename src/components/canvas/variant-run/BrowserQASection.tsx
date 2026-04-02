import type { EvaluationRoundSnapshot } from '../../../types/evaluation';

export function BrowserQASection({ snapshot }: { snapshot?: EvaluationRoundSnapshot }) {
  const browserReport = snapshot?.browser;
  if (!browserReport) return null;

  const runtimeErr = browserReport.findings.filter((f) => f.summary === 'JS runtime error');
  const otherFindings = browserReport.findings.filter((f) => f.summary !== 'JS runtime error');
  const jsScore = browserReport.scores['js_runtime']?.score;
  const interactiveScore = browserReport.scores['interactive_elems']?.score;
  const hasHardFails = browserReport.hardFails.length > 0;

  const statusColor = hasHardFails || (jsScore !== undefined && jsScore <= 2)
    ? 'text-error'
    : runtimeErr.length > 0
      ? 'text-warning'
      : 'text-fg-faint';

  return (
    <div className="border-t border-border-subtle px-3 pt-1.5 pb-2 shrink-0">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[9px] font-medium uppercase tracking-wider ${statusColor}`}>
          Runtime QA
        </span>
        {jsScore !== undefined && (
          <span className="tabular-nums font-mono text-[10px] text-fg-faint ml-auto">
            JS {jsScore}/5 · CTA {interactiveScore ?? '?'}/5
          </span>
        )}
      </div>
      {browserReport.hardFails.length > 0 && (
        <div className="text-[10px] text-error mb-1">
          {browserReport.hardFails.map((hf) => hf.message.slice(0, 80)).join(' · ')}
        </div>
      )}
      {runtimeErr.length > 0 && (
        <ul className="list-disc pl-3 text-[10px] text-warning space-y-0.5 leading-snug mb-1">
          {runtimeErr.slice(0, 2).map((f, i) => (
            <li key={i} className="truncate" title={f.detail}>{f.detail.slice(0, 90)}</li>
          ))}
        </ul>
      )}
      {otherFindings.length > 0 && (
        <ul className="list-disc pl-3 text-[10px] text-fg-muted space-y-0.5 leading-snug">
          {otherFindings.slice(0, 2).map((f, i) => (
            <li key={i}>{f.summary}</li>
          ))}
        </ul>
      )}
      {browserReport.artifacts?.browserScreenshot?.base64 && (
        <img
          className="mt-1.5 w-full max-h-24 object-cover object-top rounded border border-border-subtle"
          alt="Headless browser capture"
          src={`data:${browserReport.artifacts.browserScreenshot.mediaType};base64,${browserReport.artifacts.browserScreenshot.base64}`}
        />
      )}
    </div>
  );
}
