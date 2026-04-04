import { describe, it, expect } from 'vitest';
import { isValidConnection, VALID_CONNECTIONS } from '../canvas-connections';

describe('isValidConnection', () => {
  it('allows section types to connect to compiler', () => {
    const sectionTypes = [
      'designBrief',
      'existingDesign',
      'researchContext',
      'objectivesMetrics',
      'designConstraints',
    ];
    for (const section of sectionTypes) {
      expect(isValidConnection(section, 'compiler')).toBe(true);
    }
  });

  it('allows designSystem to connect to hypothesis', () => {
    expect(isValidConnection('designSystem', 'hypothesis')).toBe(true);
  });

  it('allows compiler to connect to hypothesis', () => {
    expect(isValidConnection('compiler', 'hypothesis')).toBe(true);
  });

  it('allows hypothesis to connect to variant', () => {
    expect(isValidConnection('hypothesis', 'variant')).toBe(true);
  });

  it('allows variant to connect to compiler and existingDesign', () => {
    expect(isValidConnection('variant', 'compiler')).toBe(true);
    expect(isValidConnection('variant', 'existingDesign')).toBe(true);
  });

  it('rejects designSystem connecting to compiler', () => {
    expect(isValidConnection('designSystem', 'compiler')).toBe(false);
  });

  it('rejects reverse connections', () => {
    expect(isValidConnection('compiler', 'designBrief')).toBe(false);
    expect(isValidConnection('hypothesis', 'compiler')).toBe(false);
    expect(isValidConnection('variant', 'hypothesis')).toBe(false);
  });

  it('rejects self-connections', () => {
    expect(isValidConnection('compiler', 'compiler')).toBe(false);
    expect(isValidConnection('variant', 'variant')).toBe(false);
  });

  it('rejects unknown node types', () => {
    expect(isValidConnection('unknown', 'compiler')).toBe(false);
    expect(isValidConnection('designBrief', 'unknown')).toBe(false);
  });

  it('allows model to connect to compiler, hypothesis, and designSystem', () => {
    expect(isValidConnection('model', 'compiler')).toBe(true);
    expect(isValidConnection('model', 'hypothesis')).toBe(true);
    expect(isValidConnection('model', 'designSystem')).toBe(true);
  });

  it('rejects model connecting to sections or variants', () => {
    expect(isValidConnection('model', 'designBrief')).toBe(false);
    expect(isValidConnection('model', 'variant')).toBe(false);
  });

  it('rejects connections TO model nodes', () => {
    expect(isValidConnection('compiler', 'model')).toBe(false);
    expect(isValidConnection('hypothesis', 'model')).toBe(false);
    expect(isValidConnection('designBrief', 'model')).toBe(false);
  });

  it('covers all defined source types', () => {
    const definedSources = Object.keys(VALID_CONNECTIONS);
    expect(definedSources.length).toBeGreaterThanOrEqual(10);
  });
});
