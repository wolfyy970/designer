/**
 * Shared SSE framing: decode stream chunks, split lines, pair `event:` with following `data:`.
 * Callers own JSON parse and business logic (preserves prior try/catch behavior).
 */
export async function readSseEventStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDataLine: (eventName: string, dataLine: string) => void | Promise<void>,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        await onDataLine(currentEvent, line.slice(6));
      }
    }
  }
}
