import { jsonrepair } from 'jsonrepair';

/**
 * Parse a JSON string; on syntax failure, retry after `jsonrepair` (model output quirks).
 * Throws `Error` with message `Invalid JSON after repair attempt` if both steps fail.
 */
export function parseJsonLenient(jsonStr: string): unknown {
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr));
    } catch {
      throw new Error('Invalid JSON after repair attempt');
    }
  }
}
