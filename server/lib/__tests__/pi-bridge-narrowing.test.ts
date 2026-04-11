import { describe, it, expect } from 'vitest';
import {
  extractToolPathFromAssistantPartial,
  parseCompactionDetails,
  parsePiToolCallEnd,
  parseToolCallFromAssistantSlice,
  parseUnknownArgsRecord,
  toolMetaFromPartialNarrowed,
  toolPathFromNarrowedToolCall,
} from '../pi-bridge-narrowing.ts';

describe('parseToolCallFromAssistantSlice', () => {
  it('returns tool name and path from a toolCall slice', () => {
    const slice = {
      type: 'toolCall',
      name: 'write_file',
      arguments: { path: '/src/a.html', content: 'x' },
    };
    expect(parseToolCallFromAssistantSlice(slice)).toEqual({
      toolName: 'write_file',
      toolPath: '/src/a.html',
    });
  });

  it('returns default tool name for non-toolCall', () => {
    expect(parseToolCallFromAssistantSlice({ type: 'text', text: 'hi' })).toEqual({
      toolName: 'tool',
    });
  });

  it('handles null and primitives', () => {
    expect(parseToolCallFromAssistantSlice(null)).toEqual({ toolName: 'tool' });
    expect(parseToolCallFromAssistantSlice('x')).toEqual({ toolName: 'tool' });
  });
});

describe('parsePiToolCallEnd', () => {
  it('narrows tool call object', () => {
    expect(parsePiToolCallEnd({ name: 'bash', arguments: { command: 'ls' } })).toEqual({
      name: 'bash',
      arguments: { command: 'ls' },
    });
  });

  it('returns null for invalid', () => {
    expect(parsePiToolCallEnd(null)).toBeNull();
    expect(parsePiToolCallEnd([])).toBeNull();
  });
});

describe('toolPathFromNarrowedToolCall', () => {
  it('delegates to path extraction', () => {
    expect(
      toolPathFromNarrowedToolCall({
        name: 'write_file',
        arguments: { path: '/p' },
      }),
    ).toBe('/p');
  });
});

describe('parseUnknownArgsRecord', () => {
  it('accepts plain objects', () => {
    expect(parseUnknownArgsRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('rejects arrays and primitives', () => {
    expect(parseUnknownArgsRecord([])).toBeUndefined();
    expect(parseUnknownArgsRecord('x')).toBeUndefined();
  });
});

describe('parseCompactionDetails', () => {
  it('parses string file arrays', () => {
    expect(
      parseCompactionDetails({ readFiles: ['a'], modifiedFiles: ['b'] }),
    ).toEqual({ readFiles: ['a'], modifiedFiles: ['b'] });
  });

  it('rejects non-string arrays', () => {
    expect(parseCompactionDetails({ readFiles: [1, 2] })).toBeUndefined();
  });
});

describe('toolMetaFromPartialNarrowed', () => {
  it('reads slice by index', () => {
    const partial = {
      content: [
        { type: 'text', text: 'x' },
        { type: 'toolCall', name: 'grep', arguments: { pattern: 'foo', path: '/x' } },
      ],
    };
    expect(toolMetaFromPartialNarrowed(partial as never, 1)).toMatchObject({
      toolName: 'grep',
    });
  });
});

describe('extractToolPathFromAssistantPartial', () => {
  it('returns only path from slice', () => {
    const partial = {
      content: [{ type: 'toolCall', name: 'write_file', arguments: { path: '/out.html' } }],
    };
    expect(extractToolPathFromAssistantPartial(partial as never, 0)).toBe('/out.html');
  });
});
