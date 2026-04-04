/**
 * Align canvas section nodes with spec content after library load / import.
 * Library entries only persist spec sections; default graph has no optional section nodes
 * until we materialize them from non-empty sections (otherwise ghosts appear incorrectly).
 */
import type { SectionGhostTargetType } from '../types/canvas-data';
import type { DesignSpec } from '../types/spec';
import { NODE_TYPE_TO_SECTION } from '../types/workspace-graph';
import { OPTIONAL_SECTION_SLOTS } from './canvas-layout';

/** Optional section slots whose spec section has text or images. */
export function optionalSectionSlotsWithSpecMaterial(spec: DesignSpec): SectionGhostTargetType[] {
  const out: SectionGhostTargetType[] = [];
  for (const slot of OPTIONAL_SECTION_SLOTS) {
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
