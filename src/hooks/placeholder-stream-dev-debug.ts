/** Dev-only stream callback logging (parentheses prefix avoids Tailwind arbitrary-class scan). */
export function streamPlaceholderDevDebug(
  placeholderId: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return;
  console.debug(`(stream:${placeholderId.slice(0, 8)})`, message, data ?? '');
}
