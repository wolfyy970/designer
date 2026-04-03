import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PROMPT_META, type PromptKey } from '../../../stores/prompt-store';
import { lineDiff } from '../../../lib/prompt-diff';
import { fetchPromptHistory, fetchPromptVersionBody } from '../../../api/client';
import { PROMPT_GROUPS, shortLabel, validatePrompt } from './validate-prompt';
import { FEEDBACK_DISMISS_MS } from '../../../lib/constants';

const PROMPT_SAVE_ACK_MS = Math.max(FEEDBACK_DISMISS_MS * 2, 4000);

type PutPromptResponse = {
  version: number;
  key?: string;
  baselineBody?: string;
};

export function usePromptStudio(initialPromptKey?: PromptKey) {
  const [selectedKey, setSelectedKey] = useState<PromptKey>(initialPromptKey ?? 'compilerSystem');
  const [search, setSearch] = useState('');
  const [compareKind, setCompareKind] = useState<'default' | 'version'>('default');
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [studioView, setStudioView] = useState<'split' | 'unified'>('split');

  const rootRef = useRef<HTMLDivElement>(null);
  const saveAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const [saveAck, setSaveAck] = useState<{ version: number; label: string } | null>(null);

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

  const { data: history = [] } = useQuery({
    queryKey: ['prompt-history', selectedKey],
    queryFn: () => fetchPromptHistory(selectedKey),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (compareKind !== 'version') return;
    if (compareVersion != null) return;
    const first = history[0]?.version;
    if (first != null) setCompareVersion(first);
  }, [compareKind, compareVersion, history]);

  const versionQuery = useQuery({
    queryKey: ['prompt-version', selectedKey, compareVersion],
    queryFn: () => fetchPromptVersionBody(selectedKey, compareVersion!),
    enabled: compareKind === 'version' && compareVersion != null,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: (body: string) =>
      fetch(`/api/prompts/${selectedKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }).then(async (r) => {
        const json = (await r.json()) as PutPromptResponse & { error?: string };
        if (!r.ok) throw new Error(json.error ?? `Failed to save prompt ${selectedKey}`);
        return json;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt', selectedKey] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['prompt-history', selectedKey] });
      queryClient.invalidateQueries({ queryKey: ['prompt-version', selectedKey] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (key: PromptKey) =>
      fetch(`/api/prompts/${key}/revert-baseline`, { method: 'POST' }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `Failed to reset prompt ${key}`);
        return json;
      }),
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: ['prompt', key] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['prompt-history', key] });
      queryClient.invalidateQueries({ queryKey: ['prompt-version', key] });
    },
  });

  const savedBody = data?.body ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft !== null ? draft : savedBody;

  const dirty = draft !== null && draft !== savedBody;
  const isModified = data?.isDefault === false;
  const hasAnyOverrides = allPrompts?.some((p) => !p.isDefault) ?? false;
  const meta = PROMPT_META.find((m) => m.key === selectedKey)!;

  const referenceText = useMemo(() => {
    if (compareKind === 'default') return data?.baselineBody ?? '';
    if (compareVersion == null) return '';
    return versionQuery.data?.body ?? '';
  }, [compareKind, compareVersion, data?.baselineBody, versionQuery.data?.body]);

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
    setCompareKind('default');
    setCompareVersion(null);
    setSearch('');
  }, []);

  const flashSaveAck = useCallback((version: number, label: string) => {
    if (saveAckTimerRef.current) clearTimeout(saveAckTimerRef.current);
    setSaveAck({ version, label });
    saveAckTimerRef.current = setTimeout(() => {
      saveAckTimerRef.current = null;
      setSaveAck(null);
    }, PROMPT_SAVE_ACK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (saveAckTimerRef.current) clearTimeout(saveAckTimerRef.current);
    };
  }, []);

  const saveNow = useCallback(() => {
    if (!dirty) return;
    const label = meta.label;
    mutation.mutate(displayValue, {
      onSuccess: (json) => {
        setDraft(null);
        flashSaveAck(json.version, label);
      },
    });
  }, [dirty, displayValue, mutation, flashSaveAck, meta.label]);

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

  const handleDiscard = () => setDraft(null);

  const handleCompareKindChange = useCallback((v: 'default' | 'version') => {
    setCompareKind(v);
    if (v === 'default') setCompareVersion(null);
  }, []);

  const handleReset = () => {
    setDraft(null);
    resetMutation.mutate(selectedKey);
  };

  const handleResetAll = () => {
    const keys = (allPrompts ?? []).filter((p) => !p.isDefault).map((p) => p.key as PromptKey);
    for (const key of keys) resetMutation.mutate(key);
  };

  const handleExportAll = async () => {
    const rows = (await fetchJsonOrThrow('/api/prompts')) as {
      key: string;
      body: string;
      isDefault: boolean;
    }[];
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
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
    handleDiscard,
    handleReset,
    mutation,
    resetMutation,
    isModified,
    meta,
    compareKind,
    handleCompareKindChange,
    compareVersion,
    setCompareVersion,
    history,
    versionQuery,
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
