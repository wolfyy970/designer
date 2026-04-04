/**
 * Shared heuristics for pulling a JSON object substring from LLM text (optional ```json fence,
 * then first `{` through last `}`).
 */
type ExtractLlmJsonOptions = {
  /** When true, throw if no `{…}` slice is found after fence trim */
  requireObject?: boolean;
  /** Message when requireObject and no braces (default: generic) */
  emptyMessage?: string;
};

/**
 * @returns Inner JSON object slice, or the fence-trimmed / trimmed full string when
 * `requireObject` is false and no `{}` region exists (compiler may still lenient-parse).
 */
export function extractLlmJsonObjectSegment(raw: string, options?: ExtractLlmJsonOptions): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) return s.slice(start, end + 1);
  if (options?.requireObject) {
    throw new Error(options.emptyMessage ?? 'No JSON object in model output');
  }
  return s;
}
