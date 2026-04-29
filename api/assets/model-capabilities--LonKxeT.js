const REASONING_PATTERNS = [
  /\bo[1-9]\b/i,
  /claude-3[-.]5/i,
  /claude-3[-.]7/i,
  /claude-4/i,
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /\bqwq\b/i,
  /qwen3/i,
  /-thinking\b/i
];
function supportsReasoningModel(id) {
  return REASONING_PATTERNS.some((re) => re.test(id));
}
export {
  supportsReasoningModel as s
};
