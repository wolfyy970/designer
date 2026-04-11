/**
 * Single NDJSON writer for observability (LLM, trace, task_result, task_run). Session rings call this; GET reads rings, not the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.ts';
import type { ObservabilityLine } from './observability-line.ts';
import { TRACE_LABEL_MAX, TRACE_TOOL_FIELD_MAX } from './content-limits.ts';
import { truncateUtf16WithSuffix } from './string-truncate.ts';

/** Deep clone line and truncate LLM bodies / trace label for file only. */
function observabilityLineForFile(line: ObservabilityLine): ObservabilityLine {
  if (line.type === 'incubate_parsed') {
    const max = env.LLM_LOG_MAX_BODY_CHARS;
    if (max <= 0) return line;
    const p = { ...line.payload };
    if (typeof p.firstHypothesisText === 'string' && p.firstHypothesisText.length > max) {
      p.firstHypothesisText = truncateUtf16WithSuffix(p.firstHypothesisText, max);
    }
    return { ...line, payload: p };
  }
  if (line.type === 'task_result' || line.type === 'task_run') {
    const max = env.LLM_LOG_MAX_BODY_CHARS;
    if (max <= 0) return line;
    const p = { ...(line.payload as Record<string, unknown>) };
    for (const key of ['resultContent', 'userPrompt', 'error'] as const) {
      const v = p[key];
      if (typeof v === 'string' && v.length > max) {
        p[key] = truncateUtf16WithSuffix(v, max);
      }
    }
    return { ...line, payload: p };
  }
  if (line.type === 'trace') {
    const ev = { ...(line.payload.event as Record<string, unknown>) };
    const lab = ev.label;
    if (typeof lab === 'string' && lab.length > TRACE_LABEL_MAX) {
      ev.label = truncateUtf16WithSuffix(lab, TRACE_LABEL_MAX);
    }
    for (const key of ['detail', 'toolArgs', 'toolResult'] as const) {
      const v = ev[key];
      if (typeof v === 'string' && v.length > TRACE_TOOL_FIELD_MAX) {
        ev[key] = truncateUtf16WithSuffix(v, TRACE_TOOL_FIELD_MAX);
      }
    }
    return {
      ...line,
      payload: { ...line.payload, event: ev },
    };
  }
  const max = env.LLM_LOG_MAX_BODY_CHARS;
  if (max <= 0) return line;
  const p = { ...(line.payload as Record<string, unknown>) };
  if (typeof p.systemPrompt === 'string') p.systemPrompt = truncateUtf16WithSuffix(p.systemPrompt, max);
  if (typeof p.userPrompt === 'string') p.userPrompt = truncateUtf16WithSuffix(p.userPrompt, max);
  if (typeof p.response === 'string') p.response = truncateUtf16WithSuffix(p.response, max);
  return { ...line, payload: p };
}

function resolveFilePath(): string | null {
  if (process.env.VITEST === 'true') return null;
  const dir = env.OBSERVABILITY_LOG_BASE_DIR;
  if (!dir) return null;
  if (env.LLM_LOG_FILE_MODE === 'single') {
    return path.join(dir, 'observability.ndjson');
  }
  const date = new Date().toISOString().slice(0, 10);
  return path.join(dir, `observability-${date}.ndjson`);
}

const ensuredDirs = new Set<string>();

/** Append one JSON line; never throws. */
export function writeObservabilityLine(line: ObservabilityLine): void {
  const filePath = resolveFilePath();
  if (!filePath) return;
  const dir = path.dirname(filePath);
  try {
    if (!ensuredDirs.has(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      ensuredDirs.add(dir);
    }
    const out = observabilityLineForFile(line);
    fs.appendFileSync(filePath, `${JSON.stringify(out)}\n`, 'utf8');
  } catch (err) {
    console.error('[observability-sink] append failed', err);
  }
}
