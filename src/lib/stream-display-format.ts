/**
 * Compact display formatters for streaming status chips.
 * Used by TaskStreamMonitor, GeneratingSkeleton, and GeneratingFooter.
 */
import { CHARS_PER_TOKEN } from './token-estimate';

/** `27s` under a minute; `1m 27s` at a minute or more. */
export function formatElapsedCompact(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** `432` or `1.2k`. Empty string when estimate is zero. */
export function formatTokEstimate(chars: number | undefined): string {
  if (!chars || chars < 1) return '';
  const toks = Math.round(chars / CHARS_PER_TOKEN);
  if (toks < 1000) return String(toks);
  const k = toks / 1000;
  return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)}k`;
}
