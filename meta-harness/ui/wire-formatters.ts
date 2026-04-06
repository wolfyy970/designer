/**
 * SSE / wire event one-line formatters for TUI and plain meta-harness output.
 */

/** Collapse whitespace and show the last `maxChars` graphemes worth of one-line text (FIFO-style tail for TUI). */
export function oneLinePreviewTail(text: string, maxChars: number): string {
  const collapsed = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `…${collapsed.slice(-maxChars)}`;
}

/** Bounded SSE detail line; avoids `JSON.stringify` of huge `code` payloads. */
export function wireDetailSnippet(event: string, payload: unknown): string {
  if (event === 'code') {
    const p = payload as { code?: string } | null;
    const raw = p?.code ?? '';
    const n = raw.length;
    if (n === 0) return '[code] 0 chars';
    return `[code] ${n} chars · ${oneLinePreviewTail(raw, 96)}`;
  }
  const json = JSON.stringify(payload);
  const cap = 120;
  return `[${event}] ${json.length > cap ? `${json.slice(0, cap - 1)}…` : json}`;
}

/** Pure formatter for TUI “live line” text; exported for unit tests. */
export function wirePayloadLine(event: string, payload: unknown): string {
  if (event === 'phase') {
    const p = payload as { phase?: string } | null;
    return `phase: ${p?.phase ?? '?'}`;
  }
  if (event === 'progress') {
    const p = payload as { status?: string } | null;
    return p?.status ? `progress: ${p.status}` : 'progress';
  }
  if (event === 'activity') {
    const p = payload as { entry?: string } | null;
    const e = p?.entry?.trim() ?? '';
    return e.length > 72 ? `activity: ${e.slice(0, 72)}…` : `activity: ${e || '…'}`;
  }
  if (event === 'thinking') {
    const p = payload as { delta?: string } | null;
    const d = p?.delta?.trim() ?? '';
    return d.length > 64 ? `thinking: ${d.slice(0, 64)}…` : `thinking: ${d || '…'}`;
  }
  if (event === 'streaming_tool') {
    const p = payload as {
      toolName?: string;
      streamedChars?: number;
      done?: boolean;
      toolPath?: string;
    } | null;
    const chars = p?.streamedChars ?? 0;
    const k = chars >= 1000 ? `${(chars / 1000).toFixed(1)}k` : String(chars);
    const path = p?.toolPath ? ` ${p.toolPath}` : '';
    return `tool ${p?.toolName ?? '?'}${path} (${k} chars${p?.done ? ', done' : ''})`;
  }
  if (event === 'code') {
    const p = payload as { code?: string } | null;
    const raw = p?.code ?? '';
    const n = raw.length;
    const countLabel = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
    const tail = n === 0 ? '' : ` · ${oneLinePreviewTail(raw, 40)}`;
    return `code: ${countLabel} chars${tail}`;
  }
  if (event === 'file') {
    const p = payload as { path?: string } | null;
    return `file: ${p?.path ?? '?'}`;
  }
  if (event === 'skills_loaded') {
    const p = payload as { skills?: unknown[] } | null;
    const n = Array.isArray(p?.skills) ? p.skills.length : 0;
    return `skills loaded: ${n}`;
  }
  if (event === 'skill_activated') {
    const p = payload as { name?: string; key?: string } | null;
    return `skill: ${p?.name ?? p?.key ?? '?'}`;
  }
  if (event === 'incubate_result') {
    const p = payload as { hypotheses?: unknown[] } | null;
    const n = Array.isArray(p?.hypotheses) ? p.hypotheses.length : 0;
    return `incubate done: ${n} hypotheses`;
  }
  if (event === 'meta_json_wait') {
    const p = payload as { elapsedSec?: number } | null;
    return `waiting for eval meta.json… ${p?.elapsedSec ?? '?'}s`;
  }
  if (event === 'evaluation_report') {
    const snap = payload as {
      round?: number;
      snapshot?: { aggregate?: { overallScore?: number; shouldRevise?: boolean } };
    } | null;
    const agg = snap?.snapshot?.aggregate;
    if (agg) {
      return `eval r${snap?.round ?? '?'}: score=${agg.overallScore?.toFixed(2) ?? '?'}${agg.shouldRevise ? ' → revising' : ''}`;
    }
    return 'evaluation_report';
  }
  if (event === 'revision_round') {
    const rr = payload as { round?: number } | null;
    return `revision r${rr?.round ?? '?'}…`;
  }
  return `${event}`;
}
