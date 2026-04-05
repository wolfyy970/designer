import { describe, it, expect } from 'vitest';
import {
  serializePiToolArgsForTrace,
  serializePiToolResultForTrace,
} from '../pi-tool-trace.ts';

describe('pi-tool-trace', () => {
  it('serializes tool args as JSON', () => {
    expect(serializePiToolArgsForTrace({ pattern: 'foo', path: '/x' })).toBe(
      '{"pattern":"foo","path":"/x"}',
    );
  });

  it('truncates long args', () => {
    const long = { x: 'y'.repeat(5000) };
    const out = serializePiToolArgsForTrace(long, 80)!;
    expect(out.length).toBeLessThanOrEqual(80 + 20);
    expect(out).toContain('truncated');
  });

  it('extracts text from AgentToolResult', () => {
    const out = serializePiToolResultForTrace(
      {
        content: [{ type: 'text', text: 'hello world' }],
      },
      false,
    );
    expect(out).toBe('hello world');
  });

  it('formats error results', () => {
    const out = serializePiToolResultForTrace(new Error('boom'), true);
    expect(out).toBe('boom');
  });
});
