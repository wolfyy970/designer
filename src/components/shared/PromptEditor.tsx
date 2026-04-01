import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { PROMPT_META, type PromptKey } from '../../stores/prompt-store';
import { PROMPT_DEFAULTS } from '../../lib/prompts/shared-defaults';

// ── Validation ──────────────────────────────────────────────────────

interface Diagnostic {
  level: 'info' | 'warning';
  message: string;
}

function validatePrompt(key: PromptKey, value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const meta = PROMPT_META.find((m) => m.key === key);

  // Template variable checks
  if (meta?.variables) {
    const missing = meta.variables.filter((v) => !value.includes(`{{${v}}}`));
    if (missing.length > 0) {
      diagnostics.push({
        level: 'warning',
        message: `Missing variables: ${missing.map((v) => `{{${v}}}`).join(', ')}. Data for these sections won't appear in the prompt.`,
      });
    }

    // Unknown variables that won't be interpolated
    const found = [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const unknown = found.filter((v) => !meta.variables!.includes(v));
    if (unknown.length > 0) {
      diagnostics.push({
        level: 'warning',
        message: `Unknown variables: ${unknown.map((v) => `{{${v}}}`).join(', ')}. These won't be replaced with data.`,
      });
    }
  }

  // Compiler system: must instruct JSON output
  if (key === 'compilerSystem' && !value.toLowerCase().includes('json')) {
    diagnostics.push({
      level: 'warning',
      message:
        'Should instruct the model to return JSON. The Incubator parses the response with JSON.parse().',
    });
  }

  // Gen system HTML: should mention HTML
  if (key === 'genSystemHtml' && !value.toLowerCase().includes('html')) {
    diagnostics.push({
      level: 'warning',
      message:
        'Should instruct the model to return HTML. Output is rendered in a sandboxed iframe.',
    });
  }

  return diagnostics;
}

// ── Sidebar grouping ────────────────────────────────────────────────

const GROUPS: { label: string; keys: PromptKey[] }[] = [
  { label: 'Incubator', keys: ['compilerSystem', 'compilerUser'] },
  { label: 'Designer', keys: ['variant', 'genSystemHtml', 'genSystemHtmlAgentic'] },
  { label: 'Design System', keys: ['designSystemExtract'] },
  {
    label: 'Evaluator',
    keys: ['evalDesignSystem', 'evalStrategySystem', 'evalImplementationSystem'],
  },
];

/** Strip the group prefix for sidebar labels */
function shortLabel(key: PromptKey): string {
  const meta = PROMPT_META.find((m) => m.key === key);
  if (!meta) return key;
  return meta.label.replace(/^(Incubator|Agent Designer|Legacy Designer|Designer|Design System)\s*—\s*/, '');
}

// ── Component ───────────────────────────────────────────────────────

export default function PromptEditor() {
  const [selectedKey, setSelectedKey] = useState<PromptKey>('compilerSystem');
  const queryClient = useQueryClient();
  const fetchJsonOrThrow = useCallback(async (url: string) => {
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
      throw new Error((json as { error?: string }).error ?? `Request failed for ${url}`);
    }
    return json;
  }, []);

  // Fetch current prompt from server
  const { data, error: promptError } = useQuery({
    queryKey: ['prompt', selectedKey],
    queryFn: () => fetchJsonOrThrow(`/api/prompts/${selectedKey}`),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all prompts to check for any overrides
  const { data: allPrompts, error: promptsError } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => fetchJsonOrThrow('/api/prompts') as Promise<{ key: string; isDefault: boolean }[]>,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (body: string) =>
      fetch(`/api/prompts/${selectedKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `Failed to save prompt ${selectedKey}`);
        return json;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt', selectedKey] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (key: PromptKey) =>
      fetch(`/api/prompts/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: PROMPT_DEFAULTS[key] }),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `Failed to reset prompt ${key}`);
        return json;
      }),
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: ['prompt', key] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });

  const currentValue = data?.body ?? '';
  const isModified = data?.isDefault === false;
  const hasAnyOverrides = allPrompts?.some((p) => p.isDefault === false) ?? false;

  const meta = PROMPT_META.find((m) => m.key === selectedKey)!;

  // Local draft state — saves on blur to avoid hammering the DB on every keystroke
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? currentValue;

  // Reset draft when switching keys
  const handleSelectKey = useCallback((key: PromptKey) => {
    setSelectedKey(key);
    setDraft(null);
  }, []);

  const handleChange = (value: string) => {
    setDraft(value);
  };

  const handleBlur = () => {
    if (draft !== null && draft !== currentValue) {
      mutation.mutate(draft);
    }
    setDraft(null);
  };

  const handleReset = () => {
    setDraft(null);
    resetMutation.mutate(selectedKey);
  };

  const handleResetAll = () => {
    const keys = (allPrompts ?? [])
      .filter((p) => !p.isDefault)
      .map((p) => p.key as PromptKey);
    for (const key of keys) {
      resetMutation.mutate(key);
    }
  };

  const diagnostics = useMemo(
    () => validatePrompt(selectedKey, displayValue),
    [selectedKey, displayValue]
  );

  const charCount = displayValue.length;
  const approxTokens = Math.round(charCount / 4);
  const loadError = promptError ?? promptsError;

  if (loadError) {
    const message = loadError instanceof Error ? loadError.message : String(loadError);
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-fg-secondary">
        <p className="font-medium text-fg">Prompt loading failed</p>
        <p className="mt-1">{message}</p>
        <p className="mt-2 text-fg-muted">
          Prompt bodies must exist in the database. Run <code>pnpm db:seed</code> if prompts are missing.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(80vh-7rem)]">
      {/* ── Sidebar ───────────────────────────────── */}
      <div className="flex w-40 shrink-0 flex-col border-r border-border-subtle pr-3">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 text-nano font-semibold uppercase tracking-wider text-fg-muted">
                {group.label}
              </p>
              {group.keys.map((key) => {
                const modified = allPrompts?.find((p) => p.key === key)?.isDefault === false;
                const active = key === selectedKey;
                return (
                  <button
                    key={key}
                    onClick={() => handleSelectKey(key)}
                    className={`mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? 'bg-fg text-bg'
                        : 'text-fg-secondary hover:bg-surface'
                    }`}
                  >
                    <span className="flex-1 truncate">{shortLabel(key)}</span>
                    {modified && (
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          active ? 'bg-amber-400' : 'bg-amber-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {hasAnyOverrides && (
          <button
            onClick={handleResetAll}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-nano text-fg-secondary hover:bg-surface"
          >
            <RotateCcw size={10} />
            Reset All
          </button>
        )}
      </div>

      {/* ── Editor ────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col pl-4">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-fg">{meta.label}</h3>
            <p className="mt-0.5 text-xs text-fg-secondary">{meta.description}</p>
          </div>
          {isModified && (
            <button
              onClick={handleReset}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-micro text-fg-secondary hover:bg-surface"
            >
              <RotateCcw size={10} />
              Reset
            </button>
          )}
        </div>

        {/* Template variables (color-coded: present=surface, missing=amber) */}
        {meta.variables && meta.variables.length > 0 && (
          <div className="mb-2 rounded-md bg-surface px-3 py-2">
            <p className="mb-1 text-nano font-medium uppercase tracking-wide text-fg-muted">
              Template Variables
            </p>
            <div className="flex flex-wrap gap-1">
              {meta.variables.map((v) => {
                const present = displayValue.includes(`{{${v}}}`);
                return (
                  <code
                    key={v}
                    className={`rounded px-1.5 py-0.5 text-micro ${
                      present
                        ? 'bg-surface-raised text-fg-secondary'
                        : 'bg-warning-subtle text-warning line-through'
                    }`}
                  >
                    {'{{'}
                    {v}
                    {'}}'}
                  </code>
                );
              })}
            </div>
          </div>
        )}

        {/* Textarea — fills remaining vertical space */}
        <textarea
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-md border border-border px-3 py-2 font-mono text-xs leading-relaxed text-fg-secondary input-focus"
        />

        {/* Diagnostics */}
        {diagnostics.length > 0 && (
          <div className="mt-2 space-y-1">
            {diagnostics.map((d, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 rounded bg-warning-subtle px-2 py-1 text-micro text-warning"
              >
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{d.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Stats bar */}
        <div className="mt-2 flex items-center gap-3 text-micro text-fg-muted">
          <span>{charCount.toLocaleString()} chars</span>
          <span>~{approxTokens.toLocaleString()} tokens</span>
          {isModified && (
            <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-nano font-medium text-warning">
              Modified
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
