/**
 * Shared code extraction from LLM responses.
 * Used by both OpenRouter and LM Studio generation providers.
 */

export function extractCode(text: string): string {
  // Try to extract from markdown code fences
  const htmlMatch = text.match(/```(?:html|htm)\s*\n([\s\S]*?)\n```/);
  if (htmlMatch) return htmlMatch[1].trim();

  const reactMatch = text.match(/```(?:jsx|tsx|react)\s*\n([\s\S]*?)\n```/);
  if (reactMatch) return reactMatch[1].trim();

  const genericMatch = text.match(/```\s*\n([\s\S]*?)\n```/);
  if (genericMatch) return genericMatch[1].trim();

  // Check if response is already raw HTML/code (no fence)
  const trimmed = text.trim();
  if (trimmed.match(/^<!doctype|^<html/i)) return trimmed;

  // Check if it starts with common React patterns
  if (trimmed.match(/^(export\s+default|function\s+App|const\s+App)/)) return trimmed;

  return text;
}

/**
 * Like {@link extractCode}, but when a markdown fence is open (no closing ``` yet),
 * returns the inner content so far so streaming previews can render partial HTML/JSX.
 */
export function extractCodeStreaming(text: string): string {
  const htmlMatch = text.match(/```(?:html|htm)\s*\n([\s\S]*?)\n```/);
  if (htmlMatch) return htmlMatch[1].trim();

  const reactMatch = text.match(/```(?:jsx|tsx|react)\s*\n([\s\S]*?)\n```/);
  if (reactMatch) return reactMatch[1].trim();

  const genericMatch = text.match(/```\s*\n([\s\S]*?)\n```/);
  if (genericMatch) return genericMatch[1].trim();

  const lastFence = text.lastIndexOf('```');
  if (lastFence !== -1) {
    const afterOpen = text.slice(lastFence + 3);
    const firstNl = afterOpen.indexOf('\n');
    if (firstNl !== -1) {
      const inner = afterOpen.slice(firstNl + 1);
      const closeIdx = inner.indexOf('\n```');
      if (closeIdx === -1) return inner.trimEnd();
    }
  }

  const trimmed = text.trim();
  if (trimmed.match(/^<!doctype|^<html/i)) return trimmed;
  if (trimmed.match(/^(export\s+default|function\s+App|const\s+App)/)) return trimmed;

  return text;
}
