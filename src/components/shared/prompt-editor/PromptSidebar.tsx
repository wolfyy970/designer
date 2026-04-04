import { RotateCcw, Download } from 'lucide-react';
import type { PromptKey } from '../../../stores/prompt-store';

interface Group {
  label: string;
  keys: PromptKey[];
}

interface PromptSidebarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filteredGroups: Group[];
  allPrompts: { key: string; isDefault: boolean }[] | undefined;
  selectedKey: PromptKey;
  onSelectKey: (key: PromptKey) => void;
  shortLabel: (key: PromptKey) => string;
  hasAnyOverrides: boolean;
  onResetAll: () => void;
  onExportAll: () => void;
}

export function PromptSidebar({
  search,
  onSearchChange,
  filteredGroups,
  allPrompts,
  selectedKey,
  onSelectKey,
  shortLabel: labelFor,
  hasAnyOverrides,
  onResetAll,
  onExportAll,
}: PromptSidebarProps) {
  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-border-subtle pr-3">
      <input
        type="search"
        placeholder="Search prompts…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="mb-2 rounded-md border border-border px-2 py-1.5 text-micro text-fg-secondary input-focus"
      />
      <div className="flex-1 space-y-3 overflow-y-auto">
        {filteredGroups.map((group) => (
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
                  type="button"
                  onClick={() => onSelectKey(key)}
                  className={`mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? 'bg-fg text-bg'
                      : 'text-fg-secondary hover:bg-surface'
                  }`}
                >
                  <span className="flex-1 truncate">{labelFor(key)}</span>
                  {modified && (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? 'bg-accent' : 'bg-accent-segment-idle'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-1 border-t border-border-subtle pt-2">
        {hasAnyOverrides && (
          <button
            type="button"
            onClick={onResetAll}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-nano text-fg-secondary hover:bg-surface"
          >
            <RotateCcw size={10} />
            Reset All
          </button>
        )}
        <button
          type="button"
          onClick={() => void onExportAll()}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-nano text-fg-secondary hover:bg-surface"
        >
          <Download size={10} />
          Export JSON
        </button>
      </div>
      <p className="mt-1 text-nano text-fg-faint">Alt+↑↓ switch prompt</p>
    </div>
  );
}
