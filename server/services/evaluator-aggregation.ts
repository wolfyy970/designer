/**
 * Deterministic merge of rubric worker reports into one aggregate revision brief.
 */
import {
  EVALUATOR_RUBRIC_IDS,
  type AggregatedEvaluationReport,
  type AggregatedHardFail,
  type EvalFinding,
  type EvaluatorRubricId,
  type EvaluatorWorkerReport,
} from '../../src/types/evaluation.ts';
import {
  REVISION_GATE_LOW_AVERAGE_THRESHOLD,
  computeWeightedOverallFromRubricMeans,
  meanRubricScores,
  resolveRubricWeights,
  tieredAnyCriticalNormalizedScores,
} from '../lib/evaluation-revision-gate.ts';

const SEVERITY_RANK: Record<EvalFinding['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Tie-break for prioritized fixes: design/strategy before implementation/browser at same severity. */
const FINDING_SOURCE_PRIORITY: Record<EvaluatorRubricId, number> = {
  design: 0,
  strategy: 1,
  implementation: 2,
  browser: 3,
};

type WorkerBundle = {
  design: EvaluatorWorkerReport;
  strategy: EvaluatorWorkerReport;
  implementation: EvaluatorWorkerReport;
  browser: EvaluatorWorkerReport;
};

/**
 * Deterministic merge of four rubric reports into one revision brief (no LLM).
 */
export function aggregateEvaluationReports(
  reports: WorkerBundle,
  rubricWeightOverride?: Partial<Record<EvaluatorRubricId, number>>,
): AggregatedEvaluationReport {
  const normalizedScores: Record<string, number> = {};
  const rubricMeans: Partial<Record<EvaluatorRubricId, number>> = {};

  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    rubricMeans[rubric] = meanRubricScores(reports[rubric].scores);
    for (const [criterion, { score }] of Object.entries(reports[rubric].scores)) {
      const key = `${rubric}_${criterion}`;
      normalizedScores[key] = score;
    }
  }

  const weights = resolveRubricWeights(rubricWeightOverride);
  const overallScore = computeWeightedOverallFromRubricMeans(rubricMeans, weights);

  const evaluatorTraces: Partial<Record<EvaluatorRubricId, string>> = {};
  for (const rubric of ['design', 'strategy', 'implementation'] as const) {
    const t = reports[rubric].rawTrace;
    if (t != null && t.length > 0) evaluatorTraces[rubric] = t;
  }

  const hardFails: AggregatedHardFail[] = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const hf of reports[rubric].hardFails) {
      hardFails.push({ ...hf, source: rubric });
    }
  }

  type FindingWithSource = EvalFinding & { source: EvaluatorRubricId };
  const allFindings: FindingWithSource[] = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const f of reports[rubric].findings) {
      allFindings.push({ ...f, source: rubric });
    }
  }
  allFindings.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return FINDING_SOURCE_PRIORITY[a.source] - FINDING_SOURCE_PRIORITY[b.source];
  });

  const seenSummaries = new Set<string>();
  const findingFixes: string[] = [];
  for (const f of allFindings) {
    if (seenSummaries.has(f.summary)) continue;
    seenSummaries.add(f.summary);
    findingFixes.push(`[${f.severity}] ${f.summary}: ${f.detail}`);
  }

  const hardFailFixes = hardFails.map((hf) => `[hard_fail:${hf.code}] ${hf.message}`);
  const prioritizedFixes = [...hardFailFixes, ...findingFixes];

  let revisionBrief = '## Prioritized remediation\n\n';
  if (prioritizedFixes.length === 0) {
    revisionBrief += '- No specific findings; review normalized scores for weak dimensions.\n';
  } else {
    for (const fix of prioritizedFixes) {
      revisionBrief += `- ${fix}\n`;
    }
  }

  return {
    overallScore,
    normalizedScores,
    hardFails,
    prioritizedFixes,
    shouldRevise: false,
    revisionBrief,
    evaluatorTraces: Object.keys(evaluatorTraces).length > 0 ? evaluatorTraces : undefined,
  };
}

interface IsEvalSatisfiedOptions {
  /** If set, treat as satisfied when overallScore >= this and there are zero hard fails, even if shouldRevise is still true. */
  minOverallScore?: number;
}

/**
 * Whether to stop the revision loop for this aggregate.
 *
 * - **No target score:** stop when `!shouldRevise` after {@link enforceRevisionGate}.
 * - **Target score set (Settings → Evaluator):** stop only when there are **no hard fails**
 *   and **overallScore >= minOverallScore**, even if the rubric model sets `shouldRevise: false`.
 *   This matches the product expectation that a minimum bar must be met before “success.”
 */
export function isEvalSatisfied(
  aggregate: AggregatedEvaluationReport,
  opts?: IsEvalSatisfiedOptions,
): boolean {
  if (aggregate.hardFails.length > 0) return false;

  const threshold = opts?.minOverallScore;
  if (threshold != null && Number.isFinite(threshold)) {
    return Number.isFinite(aggregate.overallScore) && aggregate.overallScore >= threshold;
  }

  return !aggregate.shouldRevise;
}

/** Apply rule-based shouldRevise if aggregate model omits or is lenient */
export function enforceRevisionGate(report: AggregatedEvaluationReport): AggregatedEvaluationReport {
  const anyCritical = tieredAnyCriticalNormalizedScores(report.normalizedScores);
  const hasHardFails = report.hardFails.length > 0;
  const weighted = Number.isFinite(report.overallScore) ? report.overallScore : 0;
  const lowAverage = weighted < REVISION_GATE_LOW_AVERAGE_THRESHOLD;
  const shouldRevise = report.shouldRevise || hasHardFails || anyCritical || lowAverage;
  return {
    ...report,
    shouldRevise,
    overallScore: weighted > 0 ? weighted : 0,
  };
}
