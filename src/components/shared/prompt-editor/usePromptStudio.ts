import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PROMPT_META, type PromptKey } from '../../../stores/prompt-store';
import { lineDiff } from '../../../lib/prompt-diff';
import { PROMPT_KEYS } from '../../../lib/prompts/defaults';
import { validatePrompt, PROMPT_GROUPS, shortLabel } from './validate-prompt';
import { FEEDBACK_DISMISS_MS } from '../../../lib/constants';
import { usePromptOverridesStore } from '../../../stores/prompt-overrides-store';

const LOCAL_SAVE_ACK_MS = Math.max(FEEDBACK_DISMISS_MS * 2, 4000);

export function usePromptStudio(initialPromptKey?: PromptKey) {
  const [selectedKey, setSelectedKey] = useState<PromptKey>(
    initialPromptKey ?? 'hypotheses-generator-system',
  );
  const [search, setSearch] = useState('');
  const [studioView, setStudioView] = useState<'split' | 'unified'>('split');

  const rootRef = useRef<HTMLDivElement>(null);
  const saveAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const [saveAck, setSaveAck] = useState<{ label: string } | null>(null);

  const overrides = usePromptOverridesStore((s) => s.overrides);
  const setOverride = usePromptOverridesStore((s) => s.setOverride);
  const clearOverride = usePromptOverridesStore((s) => s.clearOverride);
  const clearAllOverrides = usePromptOverridesStore((s) => s.clearAll);

  useEffect(() => {
    if (initialPromptKey) setSelectedKey(initialPromptKey);
  }, [initialPromptKey]);

  const fetchJsonOrThrow = useCallback(async (url: string) => {
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
      throw new Error((json as { error?: string }).error ?? `Request failed for ${url}`);
    }
    return json;
  }, []);

  const { data, error: promptError } = useQuery({
    queryKey: ['prompt', selectedKey],
    queryFn: () => fetchJsonOrThrow(`/api/prompts/${selectedKey}`),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: allPrompts, error: promptsError } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => fetchJsonOrThrow('/api/prompts') as Promise<{ key: string; isDefault: boolean }[]>,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const savedBody = data?.body ?? '';
  const committedLocal = overrides[selectedKey];
  const effectiveCommitted = committedLocal ?? savedBody;

  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft !== null ? draft : effectiveCommitted;

  const dirty = displayValue !== effectiveCommitted;
  const hasLocalOverride = !!(committedLocal != null && committedLocal.trim().length > 0);

  const hasAnyOverrides = useMemo(
    () =>
      PROMPT_KEYS.some((k) => {
        const v = overrides[k];
        return v != null && v.trim().length > 0;
      }),
    [overrides],
  );

  const localOverrideKeys = useMemo(
    () =>
      PROMPT_KEYS.filter((k) => {
        const v = overrides[k];
        return v != null && v.trim().length > 0;
      }),
    [overrides],
  );

  const meta = PROMPT_META.find((m) => m.key === selectedKey)!;

  const referenceText = data?.baselineBody ?? '';

  const diffLines = useMemo(
    () => lineDiff(referenceText, displayValue),
    [referenceText, displayValue],
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PROMPT_GROUPS;
    return PROMPT_GROUPS.map((g) => ({
      ...g,
      keys: g.keys.filter(
        (k) =>
          k.toLowerCase().includes(q) || shortLabel(k).toLowerCase().includes(q),
      ),
    })).filter((g) => g.keys.length > 0);
  }, [search]);

  const flatFiltered: PromptKey[] = useMemo(
    () => filteredGroups.flatMap((g) => g.keys),
    [filteredGroups],
  );

  const handleSelectKey = useCallback((key: PromptKey) => {
    setSelectedKey(key);
    setDraft(null);
    setSaveAck(null);
    if (saveAckTimerRef.current) {
      clearTimeout(saveAckTimerRef.current);
      saveAckTimerRef.current = null;
    }
    setSearch('');
  }, []);

  const flashSaveAck = useCallback((label: string) => {
    if (saveAckTimerRef.current) clearTimeout(saveAckTimerRef.current);
    setSaveAck({ label });
    saveAckTimerRef.current = setTimeout(() => {
      saveAckTimerRef.current = null;
      setSaveAck(null);
    }, LOCAL_SAVE_ACK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (saveAckTimerRef.current) clearTimeout(saveAckTimerRef.current);
    };
  }, []);

  const saveNow = useCallback(() => {
    if (!dirty) return;
    setOverride(selectedKey, displayValue);
    setDraft(null);
    flashSaveAck(meta.label);
  }, [dirty, displayValue, setOverride, selectedKey, flashSaveAck, meta.label]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'ArrowDown' && e.altKey) {
          e.preventDefault();
          const i = flatFiltered.indexOf(selectedKey);
          const next = flatFiltered[Math.min(flatFiltered.length - 1, i + 1)];
          if (next) handleSelectKey(next);
        }
        if (e.key === 'ArrowUp' && e.altKey) {
          e.preventDefault();
          const i = flatFiltered.indexOf(selectedKey);
          const next = flatFiltered[Math.max(0, i - 1)];
          if (next) handleSelectKey(next);
        }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [flatFiltered, handleSelectKey, saveNow, selectedKey]);

  /** Revert in-editor edits to the last committed text (local override or server). */
  const handleDiscardEdits = () => setDraft(null);

  /** Remove local override for this prompt and show the server baseline. */
  const handleClearLocalOverride = () => {
    clearOverride(selectedKey);
    setDraft(null);
  };

  const handleResetAll = () => {
    clearAllOverrides();
    setDraft(null);
    void queryClient.invalidateQueries({ queryKey: ['prompts'] });
  };

  const handleExportAll = async () => {
    const rows = (await fetchJsonOrThrow('/api/prompts')) as {
      key: string;
      body: string;
      isDefault: boolean;
    }[];
    const snapshot = usePromptOverridesStore.getState().overrides;
    const merged = rows.map((r) => {
      const k = r.key as PromptKey;
      const local = snapshot[k];
      const hasLocal = local != null && local.trim().length > 0;
      return {
        key: r.key,
        body: hasLocal ? local! : r.body,
        serverBody: r.body,
        isDefault: r.isDefault,
        locallyOverridden: hasLocal,
      };
    });
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auto-designer-prompts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const diagnostics = useMemo(
    () => validatePrompt(selectedKey, displayValue),
    [selectedKey, displayValue],
  );

  const charCount = displayValue.length;
  const approxTokens = Math.round(charCount / 4);
  const loadError = promptError ?? promptsError;

  return {
    rootRef,
    search,
    setSearch,
    filteredGroups,
    allPrompts,
    selectedKey,
    handleSelectKey,
    hasAnyOverrides,
    handleResetAll,
    handleExportAll,
    shortLabel,
    studioView,
    setStudioView,
    dirty,
    saveNow,
    handleDiscardEdits,
    handleClearLocalOverride,
    hasLocalOverride,
    localOverrideKeys,
    meta,
    data,
    displayValue,
    setDraft,
    referenceText,
    diffLines,
    diagnostics,
    charCount,
    approxTokens,
    loadError,
    saveAck,
  };
}
