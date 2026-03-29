import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, ChevronDown, AlertCircle, Eye, Brain } from 'lucide-react';
import { useProviderModels } from '../../hooks/useProviderModels';
import { useQueryClient } from '@tanstack/react-query';

interface ModelSelectorProps {
  label: string;
  providerId: string;
  selectedModelId: string;
  onChange: (modelId: string) => void;
}

export default function ModelSelector({
  label,
  providerId,
  selectedModelId,
  onChange,
}: ModelSelectorProps) {
  const { data: models, isLoading, isError } = useProviderModels(providerId);
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Auto-select first model when models load and nothing selected
  useEffect(() => {
    if (models && models.length > 0 && !selectedModelId) {
      onChange(models[0].id);
    }
  }, [models, selectedModelId, onChange]);

  // If selected model isn't in new list (provider changed), reset
  useEffect(() => {
    if (models && models.length > 0 && selectedModelId) {
      const found = models.some((m) => m.id === selectedModelId);
      if (!found) {
        onChange(models[0].id);
      }
    }
  }, [models, selectedModelId, onChange]);

  const filtered = useMemo(() => {
    if (!models) return [];
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
  }, [models, search]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('pointerdown', handleClick, true);
    return () => document.removeEventListener('pointerdown', handleClick, true);
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, isOpen]);

  const select = useCallback(
    (modelId: string) => {
      onChange(modelId);
      setIsOpen(false);
      setSearch('');
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[highlightIndex]) {
            select(filtered[highlightIndex].id);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSearch('');
          break;
      }
    },
    [isOpen, filtered, highlightIndex, select]
  );

  const selectedModel = models?.find((m) => m.id === selectedModelId);
  const displayValue = isOpen
    ? search
    : selectedModel?.name || selectedModelId || '';

  return (
    <div className="nodrag nowheel" ref={containerRef}>
      <label className="mb-1 block text-xs font-medium text-fg-secondary">
        {label}
      </label>
      <div className="relative">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
              setSearch('');
            }}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'Loading models...' : 'Search models...'}
            disabled={isLoading}
            className="w-full rounded-md border border-border bg-bg py-2 pl-2.5 pr-7 text-xs text-fg-secondary input-focus disabled:opacity-60"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-fg-muted">
            {!isOpen && selectedModel?.supportsVision && (
              <Eye size={10} className="text-info" />
            )}
            {!isOpen && selectedModel?.supportsReasoning && (
              <Brain size={10} className="text-accent" />
            )}
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ChevronDown size={12} />
            )}
          </span>
        </div>

        {isOpen && (
          <ul
            ref={listRef}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-bg py-1 shadow-lg"
          >
            {isError && (
              <li className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-error">
                <AlertCircle size={12} />
                Failed to load
                <button
                  onClick={() =>
                    queryClient.invalidateQueries({
                      queryKey: ['provider-models', providerId],
                    })
                  }
                  className="ml-auto text-info hover:underline"
                >
                  Retry
                </button>
              </li>
            )}
            {!isError && filtered.length === 0 && !isLoading && (
              <li className="px-2.5 py-2 text-xs text-fg-muted">
                No models found
              </li>
            )}
            {filtered.map((m, i) => (
              <li
                key={m.id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  select(m.id);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`cursor-pointer px-2.5 py-1.5 text-xs ${
                  i === highlightIndex
                    ? 'bg-accent/15 text-fg'
                    : 'text-fg-secondary'
                } ${m.id === selectedModelId ? 'font-medium' : ''}`}
              >
                <div className="flex items-center gap-1 truncate">
                  {m.name}
                  {m.supportsVision && (
                    <Eye size={10} className="shrink-0 text-info" />
                  )}
                  {m.supportsReasoning && (
                    <Brain size={10} className="shrink-0 text-accent" />
                  )}
                </div>
                {m.name !== m.id && (
                  <div className="truncate text-nano text-fg-muted">
                    {m.id}
                    {m.contextLength
                      ? ` · ${Math.round(m.contextLength / 1024)}k ctx`
                      : ''}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
