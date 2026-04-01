import { describe, it, expect } from 'vitest';
import { jsonrepair } from 'jsonrepair';

/**
 * Some chat models emit JavaScript-like objects (unquoted keys) inside otherwise JSON-looking output.
 * compileSpec falls back to jsonrepair before failing.
 */
describe('compiler LLM JSON repair', () => {
  it('repairs unquoted keys in dimension objects', () => {
    const broken = `{
  "dimensions": [
    { "name": "Primary Navigation Mode", "range": "A -> B", "isConstant": false },
    { name: "Information Density", "range": "Minimal -> Comprehensive", "isConstant": false }
  ],
  "variants": []
}`;
    const repaired = jsonrepair(broken);
    const parsed = JSON.parse(repaired) as {
      dimensions: { name: string; range: string; isConstant: boolean }[];
      variants: unknown[];
    };
    expect(parsed.dimensions).toHaveLength(2);
    expect(parsed.dimensions[1].name).toBe('Information Density');
    expect(parsed.variants).toEqual([]);
  });
});
