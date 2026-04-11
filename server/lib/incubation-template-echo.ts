/**
 * Detects when an incubation model echoes instructional placeholder text from an old
 * skill JSON example (e.g. fields starting with `string — …`) instead of real hypotheses.
 */

const TEMPLATE_ECHO_PREFIX = /^string\s*[—–-]\s*/i;

export function incubationLooksLikeTemplateEcho(plan: {
  dimensions: { name: string; range: string }[];
  hypotheses: { name: string; hypothesis: string; rationale: string }[];
}): boolean {
  for (const d of plan.dimensions) {
    if (TEMPLATE_ECHO_PREFIX.test(d.name.trim()) || TEMPLATE_ECHO_PREFIX.test(String(d.range).trim())) {
      return true;
    }
  }
  for (const h of plan.hypotheses) {
    if (
      TEMPLATE_ECHO_PREFIX.test(h.name.trim()) ||
      TEMPLATE_ECHO_PREFIX.test(h.hypothesis.trim()) ||
      TEMPLATE_ECHO_PREFIX.test(h.rationale.trim())
    ) {
      return true;
    }
  }
  return false;
}
