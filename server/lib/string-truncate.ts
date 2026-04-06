const DEFAULT_TRUNC_SUFFIX = '\n…[truncated]';

/** Truncate UTF-16 string to maxChars, appending suffix when clipped. */
export function truncateUtf16WithSuffix(
  s: string,
  maxChars: number,
  suffix: string = DEFAULT_TRUNC_SUFFIX,
): string {
  if (maxChars <= 0 || s.length <= maxChars) return s;
  return s.slice(0, maxChars) + suffix;
}
