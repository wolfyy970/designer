/**
 * Align canvas input nodes with spec content after library load / import.
 * Library entries only persist spec `sections`; the default graph has no optional input nodes
 * until we materialize them from non-empty facets (otherwise ghosts appear incorrectly).
 */
import type { InputGhostTargetType } from '../types/canvas-data';
import type { DesignSpec } from '../types/spec';
import { NODE_TYPE_TO_SECTION } from '../types/workspace-graph';
import { OPTIONAL_INPUT_SLOTS } from './canvas-layout';

/** Optional input slots whose corresponding spec facet has text or images. */
export function optionalInputSlotsWithSpecMaterial(spec: DesignSpec): InputGhostTargetType[] {
  const out: InputGhostTargetType[] = [];
  for (const slot of OPTIONAL_INPUT_SLOTS) {
    const sid = NODE_TYPE_TO_SECTION[slot];
    if (!sid) continue;
    const sec = spec.sections[sid];
    if (!sec) continue;
    if (sec.content.trim().length > 0 || sec.images.length > 0) {
      out.push(slot);
    }
  }
  return out;
}
