/**
 * Rule-based thresholds for {@link enforceRevisionGate} (agentic revision loop).
 * Centralized so product tuning and tests reference one place.
 */

/** Normalized per-criterion scores at or below this value trigger revision (critical band). */
export const REVISION_GATE_CRITICAL_SCORE_MAX = 2;

/** Mean normalized score below this triggers revision when the aggregate model is lenient. */
export const REVISION_GATE_LOW_AVERAGE_THRESHOLD = 3.5;
