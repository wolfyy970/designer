/**
 * Single NDJSON writer for observability (LLM + trace). Session rings call this; GET reads rings, not the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.ts';
import type { ObservabilityLine } from './observability-line.ts';

const TRUNC_SUFFIX = '\n…[truncated]';
const TRACE_LABEL_MAX = 4000;
const TRACE_TOOL_FIELD_MAX = 4000;

function truncBody(s: string, maxChars: number): string {
  if (maxChars <= 0 || s.length <= maxChars) return s;
  return s.slice(0, maxChars) + TRUNC_SUFFIX;
}

/** Deep clone line and truncate LLM bodies / trace label for file only. */
export function observabilityLineForFile(line: ObservabilityLine): ObservabilityLine {
  if (line.type === 'trace') {
    const ev = { ...(line.payload.event as Record<string, unknown>) };
    const lab = ev.label;
    if (typeof lab === 'string' && lab.length > TRACE_LABEL_MAX) {
      ev.label = lab.slice(0, TRACE_LABEL_MAX) + TRUNC_SUFFIX;
    }
    for (const key of ['detail', 'toolArgs', 'toolResult'] as const) {
      const v = ev[key];
      if (typeof v === 'string' && v.length > TRACE_TOOL_FIELD_MAX) {
        ev[key] = v.slice(0, TRACE_TOOL_FIELD_MAX) + TRUNC_SUFFIX;
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
  if (typeof p.systemPrompt === 'string') p.systemPrompt = truncBody(p.systemPrompt, max);
  if (typeof p.userPrompt === 'string') p.userPrompt = truncBody(p.userPrompt, max);
  if (typeof p.response === 'string') p.response = truncBody(p.response, max);
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
