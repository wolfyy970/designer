import { describe, expect, it } from 'vitest';
import { parseJsonLenient } from '../parse-json-lenient.ts';

describe('parseJsonLenient', () => {
  it('parses valid JSON', () => {
    expect(parseJsonLenient('{"a":1}')).toEqual({ a: 1 });
  });

  it('repairs then parses sloppy JSON from models', () => {
    const broken = '{"dimensions":[{"name":"A"}],"variants":[]}';
    expect(parseJsonLenient(broken)).toEqual({ dimensions: [{ name: 'A' }], variants: [] });
    const unquotedKey = '{ "x": [ { name: "y" } ] }';
    const out = parseJsonLenient(unquotedKey) as { x: { name: string }[] };
    expect(out.x[0].name).toBe('y');
  });

  it('throws a stable message when repair cannot fix', () => {
    expect(() => parseJsonLenient('not json {{{')).toThrow('Invalid JSON after repair attempt');
  });
});
