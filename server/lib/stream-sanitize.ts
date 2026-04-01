/**
 * Remove provider-specific control markers from streamed model text.
 * Some models emit sequences like `<ctrl46>` in thinking or answer streams.
 */
export function stripProviderControlTokens(text: string): string {
  if (!text) return text;
  return text.replace(/<ctrl\d+>/gi, '');
}
