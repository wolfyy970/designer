import { usePromptStudio } from './prompt-editor/usePromptStudio';
import { PromptSidebar } from './prompt-editor/PromptSidebar';
import { PromptStudioPanel } from './prompt-editor/PromptStudioPanel';
import type { PromptKey } from '../../stores/prompt-store';

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
    handleDiscard,
    handleReset,
    mutation,
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
  } = usePromptStudio(initialPromptKey);

  if (loadError) {
    const message = loadError instanceof Error ? loadError.message : String(loadError);
    return (
      <div className="rounded-lg border border-warning-border bg-warning-subtle p-4 text-sm text-fg-secondary">
        <p className="font-medium text-fg">Prompt loading failed</p>
        <p className="mt-1">{message}</p>
        <p className="mt-2 text-fg-muted">
          Prompt bodies must exist in Langfuse. Run <code>pnpm db:seed</code> to bootstrap missing prompts (safe with Prompt Studio edits).
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} tabIndex={-1} className="flex h-[var(--height-prompt-editor-pane)] min-h-[var(--min-height-prompt-editor)] outline-none">
      <PromptSidebar
        search={search}
        onSearchChange={setSearch}
        filteredGroups={filteredGroups}
        allPrompts={allPrompts}
        selectedKey={selectedKey}
        onSelectKey={handleSelectKey}
        shortLabel={shortLabel}
        hasAnyOverrides={hasAnyOverrides}
        onResetAll={handleResetAll}
        onExportAll={handleExportAll}
      />
      <PromptStudioPanel
        meta={meta}
        studioView={studioView}
        onStudioViewChange={setStudioView}
        dirty={dirty}
        onSave={saveNow}
        onDiscard={handleDiscard}
        onResetToDefault={handleReset}
        saveMutation={mutation}
        isModified={isModified}
        compareKind={compareKind}
        onCompareKindChange={handleCompareKindChange}
        savedVersion={data?.version}
        variables={meta.variables}
        displayValue={displayValue}
        onDraftChange={setDraft}
        referenceText={referenceText}
        compareKindVersion={compareKind === 'version'}
        compareVersion={compareVersion}
        onCompareVersionChange={setCompareVersion}
        history={history}
        versionLoading={versionQuery.isLoading}
        diffLines={diffLines}
        diagnostics={diagnostics}
        charCount={charCount}
        approxTokens={approxTokens}
        saveAck={saveAck}
      />
    </div>
  );
}
