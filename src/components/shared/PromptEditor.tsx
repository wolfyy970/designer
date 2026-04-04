import { usePromptStudio } from './prompt-editor/usePromptStudio';
import { PromptSidebar } from './prompt-editor/PromptSidebar';
import { PromptStudioPanel } from './prompt-editor/PromptStudioPanel';
import type { PromptKey } from '../../stores/prompt-store';
import { normalizeError } from '../../lib/error-utils';

export interface PromptEditorProps {
  initialPromptKey?: PromptKey;
}

export default function PromptEditor({ initialPromptKey }: PromptEditorProps) {
  const {
    rootRef,
    search,
    setSearch,
    filteredGroups,
    allPrompts,
    selectedKey,
    handleSelectKey,
    shortLabel,
    hasAnyOverrides,
    handleResetAll,
    handleExportAll,
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
  } = usePromptStudio(initialPromptKey);

  if (loadError) {
    const message = normalizeError(loadError);
    return (
      <div className="rounded-lg border border-error-border bg-error-surface p-4 text-sm text-fg-secondary">
        <p className="font-medium text-error">Prompt loading failed</p>
        <p className="mt-1">{message}</p>
        <p className="mt-2 text-nano text-fg-muted">
          Prompt bodies are served from Langfuse or built-in defaults. Run{' '}
          <code className="rounded bg-surface px-1 font-mono text-micro">pnpm db:seed</code> to bootstrap
          missing prompts.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="flex h-[var(--height-prompt-editor-pane)] min-h-[var(--min-height-prompt-editor)] outline-none"
    >
      <PromptSidebar
        search={search}
        onSearchChange={setSearch}
        filteredGroups={filteredGroups}
        allPrompts={allPrompts}
        selectedKey={selectedKey}
        onSelectKey={handleSelectKey}
        shortLabel={shortLabel}
        localOverrideKeys={localOverrideKeys}
        hasAnyOverrides={hasAnyOverrides}
        onResetAll={handleResetAll}
        onExportAll={handleExportAll}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="ds-callout-note mb-2 mr-3" role="note">
          <strong className="text-fg">Local experimentation only.</strong> Prompt edits here are saved to this
          browser and sent as per-request overrides. They do not change production prompts in Langfuse. Local edits
          may be cleared when the app updates or when you clear site data.
        </div>
        <PromptStudioPanel
          meta={meta}
          studioView={studioView}
          onStudioViewChange={setStudioView}
          dirty={dirty}
          onSave={saveNow}
          onDiscardEdits={handleDiscardEdits}
          onClearLocalOverride={handleClearLocalOverride}
          hasLocalOverride={hasLocalOverride}
          savedVersion={data?.version}
          variables={meta.variables}
          displayValue={displayValue}
          onDraftChange={setDraft}
          referenceText={referenceText}
          diffLines={diffLines}
          diagnostics={diagnostics}
          charCount={charCount}
          approxTokens={approxTokens}
          saveAck={saveAck}
        />
      </div>
    </div>
  );
}
