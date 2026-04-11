/**
 * Primary status line when there is no file plan (building phase heuristics).
 */
export function buildNoPlanBuildingLine(args: {
  isBuilding: boolean;
  progressMessage?: string;
  written: number;
  isActivelyThinking: boolean;
  isServerStallHeartbeat: boolean;
  activeToolLabel?: string;
  thinkingSec: number;
}): string {
  const {
    isBuilding,
    progressMessage,
    written,
    isActivelyThinking,
    isServerStallHeartbeat,
    activeToolLabel,
    thinkingSec,
  } = args;
  if (!isBuilding) return progressMessage || 'Generating…';
  if (isActivelyThinking && isServerStallHeartbeat) {
    return written > 0
      ? `${written} file(s) saved · model thinking (${thinkingSec}s)`
      : `Model thinking (${thinkingSec}s)…`;
  }
  if (progressMessage && progressMessage !== 'Generating…') return progressMessage;
  if (activeToolLabel) {
    return written > 0 ? `${written} file(s) · ${activeToolLabel}` : activeToolLabel;
  }
  if (written > 0) return `${written} design file(s) saved`;
  return 'Exploring & generating…';
}

/**
 * Top-line copy for {@link GeneratingFooter}: eval / revise / plan progress / no-plan building.
 */
export function buildGeneratingPrimaryLine(args: {
  isEvaluating: boolean;
  isRevising: boolean;
  hasPlan: boolean;
  written: number;
  total: number;
  evaluationStatus?: string;
  progressMessage?: string;
  noPlanBuildingLine: string;
}): string {
  const {
    isEvaluating,
    isRevising,
    hasPlan,
    written,
    total,
    evaluationStatus,
    progressMessage,
    noPlanBuildingLine,
  } = args;
  if (isEvaluating) return evaluationStatus || progressMessage || 'Running evaluators…';
  if (isRevising) return progressMessage || evaluationStatus || 'Applying feedback from evaluators…';
  if (hasPlan) return `${written} / ${total} files`;
  return noPlanBuildingLine;
}
