import { jsonrepair } from "jsonrepair";
function parseJsonLenient(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr));
    } catch {
      throw new Error("Invalid JSON after repair attempt");
    }
  }
}
function extractLlmJsonObjectSegment(raw, options) {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) return s.slice(start, end + 1);
  if (options?.requireObject) {
    throw new Error(options.emptyMessage ?? "No JSON object in model output");
  }
  return s;
}
export {
  extractLlmJsonObjectSegment as e,
  parseJsonLenient as p
};
