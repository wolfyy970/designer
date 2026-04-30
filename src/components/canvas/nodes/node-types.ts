import InputNode from './InputNode';
import InputGhostNode from './InputGhostNode';
import IncubatorNode from './IncubatorNode';
import DesignSystemNode from './DesignSystemNode';
import HypothesisNode from './HypothesisNode';
import VariantNode from './VariantNode';
import ModelNode from './ModelNode';

export const nodeTypes = {
  inputGhost: InputGhostNode,
  designBrief: InputNode,
  researchContext: InputNode,
  objectivesMetrics: InputNode,
  designConstraints: InputNode,
  designSystem: DesignSystemNode,
  incubator: IncubatorNode,
  hypothesis: HypothesisNode,
  preview: VariantNode,
  model: ModelNode,
};
