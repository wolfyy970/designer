/**
 * Shared SSE framing: decode stream chunks and dispatch complete SSE events.
 * Callers own JSON parse and business logic (preserves prior try/catch behavior).
 * Return `false` from `onDataLine` to stop reading and cancel the reader (fatal wire error).
 */
export async function readSseEventStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDataLine: (eventName: string, dataLine: string) => void | Promise<void | false>,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let dataLines: string[] = [];

  const dispatch = async (): Promise<void | false> => {
    if (dataLines.length === 0) return undefined;
    const data = dataLines.join('\n');
    dataLines = [];
    const cont = await onDataLine(currentEvent, data);
    if (cont === false) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return false;
    }
    currentEvent = '';
    return undefined;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.length > 0) {
        const line = buffer.replace(/\r$/, '');
        if (line === '') {
          if ((await dispatch()) === false) return;
        } else if (line.startsWith('event:')) {
          if ((await dispatch()) === false) return;
          currentEvent = line.slice(6).trimStart();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
      await dispatch();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmedLine = line.replace(/\r$/, '');
      if (trimmedLine === '') {
        if ((await dispatch()) === false) return;
      } else if (trimmedLine.startsWith(':')) {
        continue;
      } else if (trimmedLine.startsWith('event:')) {
        if ((await dispatch()) === false) return;
        currentEvent = trimmedLine.slice(6).trimStart();
      } else if (trimmedLine.startsWith('data:')) {
        dataLines.push(trimmedLine.slice(5).replace(/^ /, ''));
      }
    }
  }
}
