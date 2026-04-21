import type { GenerationResult } from '../../../types/provider';
import { badgeColor } from '../../../lib/badge-colors';

interface VariantFooterProps {
  result: GenerationResult | undefined;
}

export default function VariantFooter({ result }: VariantFooterProps) {
  return (
    <div className="flex items-center gap-1.5 border-t border-border-subtle px-2.5 py-1 font-mono text-nano text-fg-muted">
      {result?.runNumber != null && (
        <span
          className={`rounded px-1 py-px font-bold leading-none ${badgeColor(result.runNumber).bg} ${badgeColor(result.runNumber).text}`}
        >
          v{result.runNumber}
        </span>
      )}
      {result?.metadata?.model && (
        <span className="truncate">{result.metadata.model}</span>
      )}
      {result?.metadata?.durationMs != null && (
        <>
          <span>&middot;</span>
          <span>{(result.metadata.durationMs / 1000).toFixed(1)}s</span>
        </>
      )}
      {result?.metadata?.tokensUsed != null && (
        <>
          <span>&middot;</span>
          <span>{result.metadata.tokensUsed.toLocaleString()} tok</span>
        </>
      )}
      {result?.metadata?.truncated && (
        <span className="text-warning">(truncated)</span>
      )}
    </div>
  );
}
