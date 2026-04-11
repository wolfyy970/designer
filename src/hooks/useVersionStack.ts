import { useCallback, useMemo } from 'react';
import {
  useGenerationStore,
  getBestCompleteResult,
  getStack,
  getActiveResult,
  getScopedStack,
  getScopedActiveResult,
} from '../stores/generation-store';
import { GENERATION_STATUS } from '../constants/generation';
import type { GenerationResult } from '../types/provider';

/**
 * Shared version-stack navigation logic used by VariantNode and VariantPreviewOverlay.
 *
 * Subscribes to generation store, computes the completed stack, active result,
 * and provides goNewer / goOlder navigation callbacks.
 */
export function useVersionStack(
  strategyId: string | undefined,
  pinnedRunId: string | undefined,
) {
  const results = useGenerationStore((s) => s.results);
  const selectedVersions = useGenerationStore((s) => s.selectedVersions);
  const userBestOverrides = useGenerationStore((s) => s.userBestOverrides);
  const setSelectedVersion = useGenerationStore((s) => s.setSelectedVersion);
  const setUserBest = useGenerationStore((s) => s.setUserBest);

  const stack = useMemo(() => {
    if (!strategyId) return [] as GenerationResult[];
    const state = { results, selectedVersions, userBestOverrides };
    return pinnedRunId
      ? getScopedStack(state, strategyId, pinnedRunId)
      : getStack(state, strategyId);
  }, [results, selectedVersions, userBestOverrides, strategyId, pinnedRunId]);

  const activeResult = useMemo(() => {
    if (!strategyId) return undefined;
    const state = { results, selectedVersions, userBestOverrides };
    return pinnedRunId
      ? getScopedActiveResult(state, strategyId, pinnedRunId)
      : getActiveResult(state, strategyId);
  }, [results, selectedVersions, userBestOverrides, strategyId, pinnedRunId]);

  const versionKey =
    pinnedRunId && strategyId
      ? `${strategyId}:${pinnedRunId}`
      : strategyId;

  const completedStack = useMemo(
    () => stack.filter((r) => r.status === GENERATION_STATUS.COMPLETE),
    [stack],
  );
  const bestCompletedResult = useMemo(
    () =>
      strategyId
        ? getBestCompleteResult(completedStack, { strategyId, userBestOverrides })
        : getBestCompleteResult(completedStack),
    [completedStack, strategyId, userBestOverrides],
  );
  const isActiveBest = !!activeResult && activeResult.id === bestCompletedResult?.id;

  const stackIndex = completedStack.findIndex((r) => r.id === activeResult?.id);
  const stackTotal = completedStack.length;

  const goNewer = useCallback(() => {
    if (!versionKey || stackIndex <= 0) return;
    setSelectedVersion(versionKey, completedStack[stackIndex - 1].id);
  }, [versionKey, stackIndex, completedStack, setSelectedVersion]);

  const goOlder = useCallback(() => {
    if (!versionKey || stackIndex >= completedStack.length - 1) return;
    setSelectedVersion(versionKey, completedStack[stackIndex + 1].id);
  }, [versionKey, stackIndex, completedStack, setSelectedVersion]);

  return {
    results,
    stack,
    activeResult,
    completedStack,
    bestCompletedResult,
    isActiveBest,
    stackIndex,
    stackTotal,
    versionKey,
    goNewer,
    goOlder,
    setSelectedVersion,
    setUserBest,
    userBestOverrides,
  };
}
