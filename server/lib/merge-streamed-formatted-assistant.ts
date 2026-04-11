/** Prefer longer assistant body: streaming deltas vs final formatted snapshot. */
export function mergeStreamedAndFormattedAssistantResponse(streamed: string, formatted: string): string {
  const s = streamed.length;
  const f = formatted.length;
  if (s > f) return streamed;
  return formatted;
}
