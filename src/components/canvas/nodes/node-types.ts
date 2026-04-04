import SectionNode from './SectionNode';
import SectionGhostNode from './SectionGhostNode';
import CompilerNode from './CompilerNode';
import DesignSystemNode from './DesignSystemNode';
import HypothesisNode from './HypothesisNode';
import VariantNode from './VariantNode';
import ModelNode from './ModelNode';

export const nodeTypes = {
  sectionGhost: SectionGhostNode,
  designBrief: SectionNode,
  existingDesign: SectionNode,
  researchContext: SectionNode,
  objectivesMetrics: SectionNode,
  designConstraints: SectionNode,
  designSystem: DesignSystemNode,
  compiler: CompilerNode,
  hypothesis: HypothesisNode,
  preview: VariantNode,
  model: ModelNode,
};
