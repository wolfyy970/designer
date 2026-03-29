import type { EvaluationContextPayload } from '../../../src/types/evaluation.ts';

export interface SkillRow {
  key: string;
  name: string;
  description: string;
  nodeTypes: string;
}

/**
 * Deterministic skill selection: match `nodeTypes` tags against outputFormat / agentic default.
 * Tags are comma-separated on the Skill row (e.g. `html,agentic`, `*`, `react`).
 */
export function selectSkillsForContext(
  skills: SkillRow[],
  context?: EvaluationContextPayload,
): SkillRow[] {
  const format = (context?.outputFormat ?? '').trim().toLowerCase();
  return skills.filter((s) => skillMatchesNodeTypes(s.nodeTypes, format));
}

function skillMatchesNodeTypes(nodeTypesRaw: string, outputFormat: string): boolean {
  const tags = nodeTypesRaw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tags.length === 0) return false;
  if (tags.includes('*')) return true;
  if (tags.includes('agentic')) return true;
  if (outputFormat && tags.includes(outputFormat)) return true;
  return false;
}
