import { describe, it, expect } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { isValidConnection } from '../../lib/canvas-connections';
import type { CanvasNodeType } from '../../types/workspace-graph';
import {
  EDGE_DOMAIN_RULES,
  HYDRATE_EDGE_RULES,
  INCREMENTAL_NEW_EDGE_RULES,
  INCREMENTAL_REMOVED_EDGE_RULES,
} from '../edge-domain-rules';

/** Representative (sourceType, targetType) per rule id — must satisfy `isValidConnection`. */
const DOMAIN_EDGE_EXAMPLES: Record<string, [CanvasNodeType, CanvasNodeType]> = {
  'model-hypothesis': [NODE_TYPES.MODEL, NODE_TYPES.HYPOTHESIS],
  'model-compiler': [NODE_TYPES.MODEL, NODE_TYPES.INCUBATOR],
  'compiler-hypothesis': [NODE_TYPES.INCUBATOR, NODE_TYPES.HYPOTHESIS],
  'section-compiler': [NODE_TYPES.DESIGN_BRIEF, NODE_TYPES.INCUBATOR],
  'variant-compiler': [NODE_TYPES.PREVIEW, NODE_TYPES.INCUBATOR],
  'designSystem-compiler': [NODE_TYPES.DESIGN_SYSTEM, NODE_TYPES.INCUBATOR],
  'designSystem-hypothesis': [NODE_TYPES.DESIGN_SYSTEM, NODE_TYPES.HYPOTHESIS],
};

function assertRuleAlignedWithCanvas(
  rules: readonly { id: string; match: (s: CanvasNodeType, t: CanvasNodeType) => boolean }[],
): void {
  for (const rule of rules) {
    const ex = DOMAIN_EDGE_EXAMPLES[rule.id];
    expect(ex, `missing example for rule ${rule.id}`).toBeDefined();
    const [s, t] = ex!;
    expect(rule.match(s, t)).toBe(true);
    expect(isValidConnection(s, t)).toBe(true);
  }
}

describe('edge-domain-rules', () => {
  it('incremental new-edge rules match VALID_CONNECTIONS topology', () => {
    assertRuleAlignedWithCanvas(INCREMENTAL_NEW_EDGE_RULES);
  });

  it('incremental removed-edge rules use valid connection pairs', () => {
    assertRuleAlignedWithCanvas(INCREMENTAL_REMOVED_EDGE_RULES);
  });

  it('hydrate edge rules use valid connection pairs', () => {
    assertRuleAlignedWithCanvas(HYDRATE_EDGE_RULES);
  });

  it('registry lists stay aligned (same rule ids for shared semantics)', () => {
    const incrementalIds = new Set(INCREMENTAL_NEW_EDGE_RULES.map((r) => r.id));
    const hydrateIds = new Set(HYDRATE_EDGE_RULES.map((r) => r.id));
    expect(hydrateIds).toEqual(incrementalIds);
  });

  it('derives all phase-specific registries from one rule registry', () => {
    expect(INCREMENTAL_NEW_EDGE_RULES).toEqual(
      EDGE_DOMAIN_RULES.filter((r) => r.onAdd).map((r) => ({
        id: r.id,
        match: r.match,
        apply: r.onAdd,
      })),
    );
    expect(INCREMENTAL_REMOVED_EDGE_RULES).toEqual(
      EDGE_DOMAIN_RULES.filter((r) => r.onRemove).map((r) => ({
        id: r.id,
        match: r.match,
        apply: r.onRemove,
      })),
    );
    expect(HYDRATE_EDGE_RULES).toEqual(
      EDGE_DOMAIN_RULES.filter((r) => r.onHydrate).map((r) => ({
        id: r.id,
        match: r.match,
        apply: r.onHydrate,
      })),
    );
  });
});
