/**
 * Shared SSE framing: decode stream chunks, split lines, pair `event:` with following `data:`.
 * Callers own JSON parse and business logic (preserves prior try/catch behavior).
 * Return `false` from `onDataLine` to stop reading and cancel the reader (fatal wire error).
 */
export async function readSseEventStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDataLine: (eventName: string, dataLine: string) => void | Promise<void | false>,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  /** Must persist across TCP chunks so `data:` lines always pair with the preceding `event:` line. */
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const cont = await onDataLine(currentEvent, line.slice(6));
        if (cont === false) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return;
        }
      }
    }
  }
}
