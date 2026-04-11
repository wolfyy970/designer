import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { generateId } from '../../../src/lib/utils';

/**
 * Mirrors incubation JSON shapes used by the API (see `extract-llm-json` / incubate routes).
 * Extracted here to test parsing logic without requiring full server bootstrap.
 */
const HypothesisStrategySchema = z.object({
  name: z.string().default('Unnamed Hypothesis'),
  hypothesis: z.string().optional().default(''),
  primaryEmphasis: z.string().optional(),
  rationale: z.string().default(''),
  measurements: z.string().default(''),
  dimensionValues: z.record(z.string(), z.unknown()).optional().default(() => ({})),
}).transform((v) => ({
  id: generateId(),
  name: v.name,
  hypothesis: v.hypothesis || v.primaryEmphasis || '',
  rationale: v.rationale,
  measurements: v.measurements,
  dimensionValues: Object.fromEntries(
    Object.entries(v.dimensionValues ?? {}).map(([k, val]) => [k, String(val)])
  ),
}));

const LLMResponseSchema = z.object({
  dimensions: z.array(z.unknown()).default([]).transform((arr) =>
    arr.map((d) => z.object({
      name: z.string().default(''),
      range: z.string().default(''),
      isConstant: z.boolean().default(false),
    }).parse(typeof d === 'object' && d !== null ? d : {}))
  ),
  hypotheses: z.array(z.unknown()).optional(),
  variants: z.array(z.unknown()).optional(),
}).transform((obj) => ({
  dimensions: obj.dimensions,
  hypotheses: (obj.hypotheses ?? obj.variants ?? []).map(
    (v) => HypothesisStrategySchema.parse(typeof v === 'object' && v !== null ? v : {})
  ),
}));

describe('compiler LLM response backward-compatible parsing', () => {
  it('parses responses with "hypotheses" key (new format)', () => {
    const raw = {
      dimensions: [{ name: 'D1', range: 'A-B', isConstant: false }],
      hypotheses: [
        { name: 'H1', hypothesis: 'Bold colors', rationale: 'R1', measurements: 'M1' },
        { name: 'H2', hypothesis: 'Minimal layout', rationale: 'R2', measurements: 'M2' },
      ],
    };

    const result = LLMResponseSchema.parse(raw);
    expect(result.dimensions).toHaveLength(1);
    expect(result.hypotheses).toHaveLength(2);
    expect(result.hypotheses[0].name).toBe('H1');
    expect(result.hypotheses[0].hypothesis).toBe('Bold colors');
    expect(result.hypotheses[1].name).toBe('H2');
  });

  it('parses responses with "variants" key (legacy format)', () => {
    const raw = {
      dimensions: [],
      variants: [
        { name: 'V1', hypothesis: 'Legacy approach', rationale: 'R', measurements: '' },
      ],
    };

    const result = LLMResponseSchema.parse(raw);
    expect(result.hypotheses).toHaveLength(1);
    expect(result.hypotheses[0].name).toBe('V1');
    expect(result.hypotheses[0].hypothesis).toBe('Legacy approach');
  });

  it('prefers "hypotheses" over "variants" when both present', () => {
    const raw = {
      dimensions: [],
      hypotheses: [{ name: 'From-hypotheses', hypothesis: 'H' }],
      variants: [{ name: 'From-variants', hypothesis: 'V' }],
    };

    const result = LLMResponseSchema.parse(raw);
    expect(result.hypotheses).toHaveLength(1);
    expect(result.hypotheses[0].name).toBe('From-hypotheses');
  });

  it('handles responses with neither hypotheses nor variants', () => {
    const raw = { dimensions: [{ name: 'D1', range: 'X-Y' }] };
    const result = LLMResponseSchema.parse(raw);
    expect(result.hypotheses).toEqual([]);
    expect(result.dimensions).toHaveLength(1);
  });

  it('falls back primaryEmphasis to hypothesis field', () => {
    const raw = {
      dimensions: [],
      variants: [{ name: 'Old', primaryEmphasis: 'Emphasis text', rationale: 'R' }],
    };

    const result = LLMResponseSchema.parse(raw);
    expect(result.hypotheses[0].hypothesis).toBe('Emphasis text');
  });

  it('each parsed strategy has a generated id', () => {
    const raw = {
      hypotheses: [{ name: 'H1' }, { name: 'H2' }],
    };

    const result = LLMResponseSchema.parse(raw);
    expect(result.hypotheses[0].id).toBeTruthy();
    expect(result.hypotheses[1].id).toBeTruthy();
    expect(result.hypotheses[0].id).not.toBe(result.hypotheses[1].id);
  });

  it('applies defaults for missing optional fields', () => {
    const raw = { hypotheses: [{}] };
    const result = LLMResponseSchema.parse(raw);

    expect(result.hypotheses[0].name).toBe('Unnamed Hypothesis');
    expect(result.hypotheses[0].hypothesis).toBe('');
    expect(result.hypotheses[0].rationale).toBe('');
    expect(result.hypotheses[0].measurements).toBe('');
    expect(result.hypotheses[0].dimensionValues).toEqual({});
  });
});
