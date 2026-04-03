import { describe, it, expect } from 'vitest';
import { extractCode, extractCodeStreaming } from '../extract-code';

describe('extractCode', () => {
  it('extracts HTML from ```html fences', () => {
    const input = 'Here is the code:\n```html\n<div>Hello</div>\n```\nDone.';
    expect(extractCode(input)).toBe('<div>Hello</div>');
  });

  it('extracts JSX from ```jsx fences', () => {
    const input = '```jsx\nfunction App() { return <h1>Hi</h1>; }\n```';
    expect(extractCode(input)).toBe('function App() { return <h1>Hi</h1>; }');
  });

  it('extracts TSX from ```tsx fences', () => {
    const input = '```tsx\nconst App = () => <div />;\n```';
    expect(extractCode(input)).toBe('const App = () => <div />;');
  });

  it('extracts from generic ``` fences when no language specified', () => {
    const input = '```\n<p>Generic</p>\n```';
    expect(extractCode(input)).toBe('<p>Generic</p>');
  });

  it('prefers html fences over generic', () => {
    const input = '```html\n<div>HTML</div>\n```\n\n```\n<div>Generic</div>\n```';
    expect(extractCode(input)).toBe('<div>HTML</div>');
  });

  it('returns raw HTML when it starts with <!doctype', () => {
    const input = '<!DOCTYPE html>\n<html><body>Hello</body></html>';
    expect(extractCode(input)).toBe(input.trim());
  });

  it('returns raw HTML when it starts with <html (case insensitive)', () => {
    const input = '<HTML>\n<body>Hi</body>\n</HTML>';
    expect(extractCode(input)).toBe(input.trim());
  });

  it('returns raw code when it starts with function App', () => {
    const input = 'function App() { return <div>Hello</div>; }';
    expect(extractCode(input)).toBe(input);
  });

  it('returns raw code when it starts with export default', () => {
    const input = 'export default function App() { return null; }';
    expect(extractCode(input)).toBe(input);
  });

  it('returns raw code when it starts with const App', () => {
    const input = 'const App = () => <div />;';
    expect(extractCode(input)).toBe(input);
  });

  it('returns full text as fallback when no pattern matches', () => {
    const input = 'This is just some text with no code.';
    expect(extractCode(input)).toBe(input);
  });

  it('handles multiline code inside fences', () => {
    const code = '<div>\n  <h1>Title</h1>\n  <p>Paragraph</p>\n</div>';
    const input = `\`\`\`html\n${code}\n\`\`\``;
    expect(extractCode(input)).toBe(code);
  });
});

describe('extractCodeStreaming', () => {
  it('returns inner HTML for an unclosed ```html fence', () => {
    const input = 'Here:\n```html\n<div>partial';
    expect(extractCodeStreaming(input)).toBe('<div>partial');
  });

  it('matches extractCode when the fence is closed', () => {
    const input = '```html\n<div>x</div>\n```';
    expect(extractCodeStreaming(input)).toBe(extractCode(input));
  });

  it('returns growing raw HTML without fences', () => {
    expect(extractCodeStreaming('<html><bod')).toBe('<html><bod');
  });
});
