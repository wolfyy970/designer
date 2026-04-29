import { a as apiJsonError } from "../[[...route]].js";
async function parseRequestJson(c, schema, options) {
  let raw;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: apiJsonError(c, 400, "Invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    if (process.env.NODE_ENV !== "production" && options?.devWarnLabel) {
      console.warn(options.devWarnLabel, "validation failed", details);
    }
    return { ok: false, response: apiJsonError(c, 400, "Invalid request", details) };
  }
  return { ok: true, data: parsed.data };
}
export {
  parseRequestJson as p
};
