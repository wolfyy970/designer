import type {
  CompileRequest,
  CompileResponse,
  GenerateRequest,
  GenerateSSEEvent,
  ModelsResponse,
  ProviderInfo,
  LlmLogEntry,
  DesignSystemExtractRequest,
  DesignSystemExtractResponse,
} from './types';
import { normalizeError } from '../lib/error-utils';

const API_BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json.error ?? text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  return response.json();
}

// ── Compile ─────────────────────────────────────────────────────────

export async function compile(req: CompileRequest): Promise<CompileResponse> {
  return post<CompileResponse>('/compile', req);
}

// ── Generate (SSE) ──────────────────────────────────────────────────

export interface GenerateStreamCallbacks {
  onProgress?: (status: string) => void;
  onActivity?: (entry: string) => void;
  onCode?: (code: string) => void;
  onError?: (error: string) => void;
  onFile?: (path: string, content: string) => void;
  onPlan?: (files: string[]) => void;
  onDone?: () => void;
}

export async function generate(
  req: GenerateRequest,
  callbacks: GenerateStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json.error ?? text;
    } catch {
      message = text;
    }
    throw new Error(normalizeError(message, 'Generation request failed'));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          const event: GenerateSSEEvent = { type: currentEvent, ...parsed } as GenerateSSEEvent;
          switch (event.type) {
            case 'progress':
              callbacks.onProgress?.(event.status);
              break;
            case 'activity':
              callbacks.onActivity?.(event.entry);
              break;
            case 'code':
              callbacks.onCode?.(event.code);
              break;
            case 'error':
              callbacks.onError?.(event.error);
              break;
            case 'file':
              callbacks.onFile?.(event.path, event.content);
              break;
            case 'plan':
              callbacks.onPlan?.(event.files);
              break;
            case 'done':
              callbacks.onDone?.();
              break;
          }
        } catch {
          // Skip malformed SSE data
        }
      }
    }
  }
}

// ── Models ──────────────────────────────────────────────────────────

export async function listModels(providerId: string): Promise<ModelsResponse> {
  const response = await fetch(`${API_BASE}/models/${providerId}`);
  if (!response.ok) return [];
  return response.json();
}

export async function listProviders(): Promise<ProviderInfo[]> {
  const response = await fetch(`${API_BASE}/models`);
  if (!response.ok) return [];
  return response.json();
}

// ── Logs ────────────────────────────────────────────────────────────

export async function getLogs(): Promise<LlmLogEntry[]> {
  const response = await fetch(`${API_BASE}/logs`);
  if (!response.ok) return [];
  return response.json();
}

export async function clearLogs(): Promise<void> {
  await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
}

// ── Design System ───────────────────────────────────────────────────

export async function extractDesignSystem(
  req: DesignSystemExtractRequest,
): Promise<DesignSystemExtractResponse> {
  return post<DesignSystemExtractResponse>('/design-system/extract', req);
}
