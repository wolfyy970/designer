import { describe, it, expect } from 'vitest';
import { createElement, isValidElement } from 'react';
import {
  stripLeadingEmojiClusters,
  stripAllEmojiFrom,
  sanitizeEmojiInChildren,
  streamdownTimelineComponents,
} from '../streamdown-timeline-components';

// ── stripLeadingEmojiClusters (existing + regression) ────────────────────

describe('stripLeadingEmojiClusters', () => {
  it('removes a leading flag sequence', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('🇮🇹 Metrics Tracking');
    expect(hadEmoji).toBe(true);
    expect(stripped).toBe('Metrics Tracking');
  });

  it('removes accessibility and folder emoji', () => {
    expect(stripLeadingEmojiClusters('♿ WCAG notes').stripped).toBe('WCAG notes');
    expect(stripLeadingEmojiClusters('📁 Files Created').stripped).toBe('Files Created');
  });

  it('removes tool emoji with optional VS16 / ZWJ chains', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('🛠️ Tool use');
    expect(hadEmoji).toBe(true);
    expect(stripped).toBe('Tool use');
  });

  it('removes high voltage / lightning after malformed leading VS16 (LLM paste order)', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('\uFE0F\u26A1 Performance');
    expect(hadEmoji).toBe(true);
    expect(stripped).toBe('Performance');
  });

  it('removes pictograph after BOM and strips lightning with emoji presentation', () => {
    expect(stripLeadingEmojiClusters('\uFEFF\u26A1\uFE0F Quick fix').stripped).toBe('Quick fix');
  });

  it('is a no-op when there is no leading emoji', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('Plain heading');
    expect(hadEmoji).toBe(false);
    expect(stripped).toBe('Plain heading');
  });

  it('detects leading document emoji (📄)', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('📄 Document ready');
    expect(hadEmoji).toBe(true);
    expect(stripped).toBe('Document ready');
  });

  it('detects leading credit card emoji (💳)', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('💳 Payment options');
    expect(hadEmoji).toBe(true);
    expect(stripped).toBe('Payment options');
  });

  it('removes leading check mark dingbat (✓) not covered by Extended_Pictographic', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('\u2713 Verified');
    expect(hadEmoji).toBe(true);
    expect(stripped).toBe('Verified');
  });

  it('removes leading cross dingbats (✗ ✘)', () => {
    expect(stripLeadingEmojiClusters('\u2717 Failed').stripped).toBe('Failed');
    expect(stripLeadingEmojiClusters('\u2718 Nope').stripped).toBe('Nope');
  });

  it('detects leading white heavy check mark (✅) and numbered list text after digit prefix', () => {
    expect(stripLeadingEmojiClusters('\u2705 Automated flow').stripped).toBe('Automated flow');
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('1. \u2705 Hypothesis item');
    expect(hadEmoji).toBe(false);
    expect(stripped).toBe('1. \u2705 Hypothesis item');
    expect(stripAllEmojiFrom('1. \u2705 Hypothesis item')).toBe('1. Hypothesis item');
  });
});

// ── stripAllEmojiFrom ─────────────────────────────────────────────────────

describe('stripAllEmojiFrom', () => {
  it('removes inline emoji from a plain string', () => {
    expect(stripAllEmojiFrom('Add 💳 card')).toBe('Add card');
  });

  it('removes trailing emoji', () => {
    expect(stripAllEmojiFrom('Done 📄')).toBe('Done');
  });

  it('removes leading emoji', () => {
    expect(stripAllEmojiFrom('⚡ Performance')).toBe('Performance');
  });

  it('removes multiple emoji in one string', () => {
    expect(stripAllEmojiFrom('📄 Document ⚡ fast 💳')).toBe('Document fast');
  });

  it('is a no-op on plain text', () => {
    expect(stripAllEmojiFrom('No emoji here')).toBe('No emoji here');
  });

  it('collapses double spaces left by removal', () => {
    expect(stripAllEmojiFrom('hello  💳  world')).toBe('hello world');
  });

  it('handles VS16 variant selector after emoji', () => {
    expect(stripAllEmojiFrom('\u26A1\uFE0F Speed')).toBe('Speed');
  });

  it('handles malformed leading VS16 before emoji', () => {
    expect(stripAllEmojiFrom('\uFE0F\u26A1 Speed')).toBe('Speed');
  });

  it('removes supplemental check/cross dingbats inline', () => {
    expect(stripAllEmojiFrom('Done \u2713')).toBe('Done');
    expect(stripAllEmojiFrom('Bad \u2717 end')).toBe('Bad end');
    expect(stripAllEmojiFrom('No \u2718 way')).toBe('No way');
  });

  it('removes white heavy check mark (✅)', () => {
    expect(stripAllEmojiFrom('\u2705 Shipped')).toBe('Shipped');
  });
});

// ── sanitizeEmojiInChildren ───────────────────────────────────────────────

describe('sanitizeEmojiInChildren', () => {
  it('strips emoji from a plain string leaf', () => {
    expect(sanitizeEmojiInChildren('📄 Document')).toBe('Document');
  });

  it('is a no-op for null / undefined', () => {
    expect(sanitizeEmojiInChildren(null)).toBeNull();
    expect(sanitizeEmojiInChildren(undefined)).toBeUndefined();
  });

  it('is a no-op for numbers', () => {
    expect(sanitizeEmojiInChildren(42)).toBe(42);
  });

  it('strips emoji from all string elements in a mixed array', () => {
    const input = ['💳 ', 'Credit Card'];
    const result = sanitizeEmojiInChildren(input) as string[];
    expect(result[0]).toBe('');
    expect(result[1]).toBe('Credit Card');
  });

  it('strips emoji inside a React element children prop', () => {
    const strong = createElement('strong', null, '💳 Bold');
    const result = sanitizeEmojiInChildren(strong) as React.ReactElement;
    expect((result.props as { children: string }).children).toBe('Bold');
  });

  it('strips emoji from string in array alongside a React element', () => {
    // Simulates: ["💳 ", <strong>Credit Card</strong>, " Processing"]
    const strong = createElement('strong', null, 'Credit Card');
    const input = ['💳 ', strong, ' Processing'];
    const result = sanitizeEmojiInChildren(input) as unknown[];
    expect(result[0]).toBe('');
    expect(result[2]).toBe('Processing');
    // The strong element should be preserved (just cloned)
    expect((result[1] as React.ReactElement).type).toBe('strong');
  });

  it('handles nested emoji in deeply nested elements', () => {
    const inner = createElement('code', null, '⚡ fast');
    const em = createElement('em', null, inner);
    const result = sanitizeEmojiInChildren(em) as React.ReactElement;
    const emChildren = (result.props as { children: React.ReactElement }).children;
    const codeChildren = (emChildren.props as { children: string }).children;
    expect(codeChildren).toBe('fast');
  });
});

// ── streamdownTimelineComponents — pre / code overrides ───────────────────

describe('streamdownTimelineComponents code-fence overrides', () => {
  it('exports a pre override', () => {
    expect(typeof streamdownTimelineComponents.pre).toBe('function');
  });

  it('exports a code override', () => {
    expect(typeof streamdownTimelineComponents.code).toBe('function');
  });

  it('pre override returns a <pre> React element', () => {
    const PreComp = streamdownTimelineComponents.pre!;
    const el = PreComp({ children: 'hello' });
    expect(isValidElement(el)).toBe(true);
    expect((el as React.ReactElement).type).toBe('pre');
  });

  it('code override returns a <code> React element', () => {
    const CodeComp = streamdownTimelineComponents.code!;
    const el = CodeComp({ children: 'const x = 1' });
    expect(isValidElement(el)).toBe(true);
    expect((el as React.ReactElement).type).toBe('code');
  });

  it('code override forwards className when provided', () => {
    const CodeComp = streamdownTimelineComponents.code!;
    const el = CodeComp({ children: 'x', className: 'language-js' });
    const props = (el as React.ReactElement).props as { className: string };
    expect(props.className).toContain('language-js');
  });

  it('code override works without a className', () => {
    const CodeComp = streamdownTimelineComponents.code!;
    const el = CodeComp({ children: 'x' });
    expect(isValidElement(el)).toBe(true);
  });
});
