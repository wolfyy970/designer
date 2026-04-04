/**
 * DOM metrics from Playwright page.evaluate — validated at the boundary.
 */
import { z } from 'zod';

const playwrightDomMetricsSchema = z.object({
  textLen: z.number(),
  bodyW: z.number(),
  bodyH: z.number(),
  brokenImages: z.number(),
});

export type PlaywrightDomMetrics = z.infer<typeof playwrightDomMetricsSchema>;

export const PLAYWRIGHT_EVAL_SCRIPT = `(() => {
  const body = document.body;
  const text = (body?.innerText ?? '').trim();
  const rect = body?.getBoundingClientRect();
  const imgs = Array.from(document.images);
  const broken = imgs.filter((i) => i.naturalWidth === 0 && i.naturalHeight === 0).length;
  return {
    textLen: text.length,
    bodyW: rect ? rect.width : 0,
    bodyH: rect ? rect.height : 0,
    brokenImages: broken,
  };
})()`;

export function parsePlaywrightDomMetrics(raw: unknown): PlaywrightDomMetrics {
  const r = playwrightDomMetricsSchema.safeParse(raw);
  if (r.success) return r.data;
  return { textLen: 0, bodyW: 0, bodyH: 0, brokenImages: 0 };
}

export function scoreVisibleTextLength(textLen: number): number {
  if (textLen >= 80) return 5;
  if (textLen >= 30) return 3;
  if (textLen >= 10) return 2;
  return 1;
}

export function scoreBodyLayout(bodyW: number, bodyH: number): number {
  if (bodyW > 100 && bodyH > 40) return 5;
  if (bodyW > 0 && bodyH > 0) return 3;
  return 1;
}
