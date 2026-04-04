import type { ReferenceImage } from '../../src/types/spec.ts';
import type { ChatMessage, ContentPart } from '../../src/types/provider.ts';

function buildMultimodalContent(text: string, images: ReferenceImage[]): ContentPart[] {
  return [
    { type: 'text', text },
    ...images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: img.dataUrl },
    })),
  ];
}

/** When `images` is non-empty, merges vision parts into the first string `user` message (compile / design-system pattern). */
export function mergeReferenceImagesIntoMessages(
  messages: ChatMessage[],
  images: ReferenceImage[] | undefined,
): ChatMessage[] {
  if (!images || images.length === 0) return messages;
  return messages.map((msg) => {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      return { ...msg, content: buildMultimodalContent(msg.content, images) };
    }
    return msg;
  });
}
