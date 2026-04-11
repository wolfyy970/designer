import { describe, it, expect } from 'vitest';
import { interpolate } from '../utils';

/** Same behavior as former `envNewlines` export — kept for regression coverage only. */
function envNewlines(value: string): string {
  return value.replace(/\\n/g, '\n');
}

describe('envNewlines', () => {
  it('converts literal \\n to real newlines', () => {
    expect(envNewlines('line1\\nline2')).toBe('line1\nline2');
  });

  it('handles multiple occurrences', () => {
    expect(envNewlines('a\\nb\\nc')).toBe('a\nb\nc');
  });

  it('returns unchanged string with no \\n', () => {
    expect(envNewlines('no newlines here')).toBe('no newlines here');
  });
});

describe('interpolate', () => {
  it('replaces single placeholder', () => {
    expect(interpolate('Hello {{NAME}}!', { NAME: 'World' })).toBe('Hello World!');
  });

  it('replaces multiple placeholders', () => {
    const result = interpolate('{{A}} and {{B}}', { A: 'one', B: 'two' });
    expect(result).toBe('one and two');
  });

  it('replaces repeated placeholders', () => {
    const result = interpolate('{{X}} then {{X}}', { X: 'val' });
    expect(result).toBe('val then val');
  });

  it('leaves unknown placeholders as-is', () => {
    expect(interpolate('{{KNOWN}} {{UNKNOWN}}', { KNOWN: 'yes' })).toBe(
      'yes {{UNKNOWN}}'
    );
  });

  it('handles empty vars object', () => {
    expect(interpolate('{{A}} {{B}}', {})).toBe('{{A}} {{B}}');
  });

  it('handles template with no placeholders', () => {
    expect(interpolate('no placeholders', { A: 'val' })).toBe('no placeholders');
  });
});
