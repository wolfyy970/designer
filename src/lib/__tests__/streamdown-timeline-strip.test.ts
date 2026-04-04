import { describe, it, expect } from 'vitest';
import { stripLeadingEmojiClusters } from '../streamdown-timeline-components';

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

  it('is a no-op when there is no leading emoji', () => {
    const { stripped, hadEmoji } = stripLeadingEmojiClusters('Plain heading');
    expect(hadEmoji).toBe(false);
    expect(stripped).toBe('Plain heading');
  });
});
