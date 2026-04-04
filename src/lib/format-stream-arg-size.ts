/** Human-readable size for streamed tool-call argument character counts. */
export function formatStreamArgSize(chars: number): string {
  if (chars < 1024) return `${chars} chars`;
  return `${(chars / 1024).toFixed(1)} KB`;
}
