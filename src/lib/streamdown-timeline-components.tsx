/**
 * Streamdown overrides for the agent activity timeline: replace system emoji in
 * headings (and plain-text blocks) with Lucide icons that match the design system.
 */
import React, {
  createElement,
  cloneElement,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
  isValidElement,
} from 'react';
import {
  Accessibility,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  FileText,
  FolderOpen,
  ListTree,
  Palette,
  Shield,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Components } from 'streamdown';

const headingIconCls = 'h-3.5 w-3.5 shrink-0 text-accent';
const blockIconCls = 'mt-0.5 h-3.5 w-3.5 shrink-0 text-accent';

// ── Emoji stripping ────────────────────────────────────────────────────────

/** Leading BOM / VS16 / ZWSP / ZWJ from sloppy LLM output or paste — blocks `^\p{Extended_Pictographic}` if left in front of e.g. ⚡. */
function stripLeadingFormatNoise(s: string): string {
  let out = s.trimStart();
  let prev = '';
  while (out !== prev) {
    prev = out;
    out = out.replace(/^(?:\uFEFF|\u200B|\uFE0F|\u200D)+/u, '').trimStart();
  }
  return out;
}

/**
 * Matches a full emoji cluster anywhere in a string: optional leading format
 * noise + (regional-indicator pair | Extended_Pictographic base) + optional
 * VS16/keycap/ZWJ-chain continuations + optional trailing format noise.
 *
 * Used with the global flag to strip ALL emoji from a string.
 */
const EMOJI_CLUSTER_GLOBAL =
  /(?:[\uFEFF\u200B\u200D]|\uFE0F)*(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic})(?:(?:\uFE0F|\u20E3)?(?:\u200D(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic})(?:\uFE0F|\u20E3)?)*)(?:[\uFEFF\u200B\u200D]|\uFE0F)*/gu;

/**
 * Check / ballot-cross dingbats often used by LLMs; not Extended_Pictographic
 * in V8/ICU (unlike U+2705 etc.), so they need an explicit pass.
 */
const SUPPLEMENTAL_DINGBAT_GLOBAL = /[\u2713\u2717\u2718]\uFE0F?/gu;

/** Remove every emoji cluster (leading, inline, trailing) from a string. */
export function stripAllEmojiFrom(s: string): string {
  return s
    .replace(EMOJI_CLUSTER_GLOBAL, '')
    .replace(SUPPLEMENTAL_DINGBAT_GLOBAL, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Peel flag sequences, pictographic emoji, and ZWJ chains from the start of a string. */
export function stripLeadingEmojiClusters(input: string): { stripped: string; hadEmoji: boolean } {
  let s = stripLeadingFormatNoise(input);
  let hadEmoji = false;

  while (s.length > 0) {
    s = stripLeadingFormatNoise(s);
    const ri = s.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u);
    if (ri) {
      s = stripLeadingFormatNoise(s.slice(ri[0].length));
      hadEmoji = true;
      continue;
    }

    const pic = s.match(/^\p{Extended_Pictographic}/u);
    if (pic) {
      s = s.slice(pic[0].length);
      hadEmoji = true;
      if (s.startsWith('\uFE0F')) s = s.slice(1);
      if (s.startsWith('\u200D')) {
        s = s.slice(1);
        continue;
      }
      s = stripLeadingFormatNoise(s);
      continue;
    }

    const ding = s.match(/^[\u2713\u2717\u2718](?:\uFE0F)?/u);
    if (ding) {
      s = stripLeadingFormatNoise(s.slice(ding[0].length));
      hadEmoji = true;
      continue;
    }

    break;
  }

  return { stripped: stripLeadingFormatNoise(s), hadEmoji };
}

/**
 * Recursively walk a React children tree and strip all emoji from string leaf
 * nodes. React elements are cloned with their `children` prop sanitized — this
 * preserves bold/code/link formatting while purging emoji at any depth.
 *
 * This operates purely on the rendered React tree (display layer) and does not
 * touch the agent's generated files or raw markdown source.
 */
export function sanitizeEmojiInChildren(node: ReactNode): ReactNode {
  if (node == null || typeof node === 'boolean') return node;
  if (typeof node === 'string') return stripAllEmojiFrom(node);
  if (typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map(sanitizeEmojiInChildren);
  if (isValidElement(node)) {
    const p = node.props as { children?: ReactNode };
    if ('children' in p) {
      // Cast to a concrete prop type so cloneElement's overload resolves.
      const el = node as React.ReactElement<{ children?: ReactNode }>;
      return cloneElement(el, { children: sanitizeEmojiInChildren(p.children) });
    }
    return node;
  }
  return node;
}

// ── Icon selection ─────────────────────────────────────────────────────────

function pickTimelineIcon(headline: string): LucideIcon {
  const h = headline.toLowerCase();
  if (/(accessibility|wcag|a11y|aria|skip\s*link)/.test(h)) return Accessibility;
  if (/(document|page|pdf|sheet|report|invoice|contract)/.test(h)) return FileText;
  if (/(payment|card|credit|billing|transaction|price|cost|fee)/.test(h)) return CreditCard;
  if (/(security|auth|lock|protect|encrypt|safe)/.test(h)) return Shield;
  if (/(performance|speed|fast|optim|zap|bolt)/.test(h)) return Zap;
  if (/(feature|highlight|showcase)/.test(h)) return Sparkles;
  if (/(file|created|folder|directory|tree\b|structure)/.test(h)) return FolderOpen;
  if (/(metric|track|funnel|analytics|progress|timer|chart)/.test(h)) return BarChart3;
  if (/(tool|todo|task|plan|milestone)/.test(h)) return Wrench;
  if (/(test|check|verify|complete|done|success)/.test(h)) return CheckCircle2;
  if (/(warn|error|fix|issue|bug)/.test(h)) return AlertCircle;
  if (/(design|ui|layout|style)/.test(h)) return Palette;
  return ListTree;
}

// ── React component overrides ──────────────────────────────────────────────

function childrenToPlainText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenToPlainText).join('');
  if (isValidElement(node) && node.props && typeof node.props === 'object' && 'children' in node.props) {
    return childrenToPlainText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function makeTimelineHeading(Level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  const TimelineHeading: ComponentType<
    HTMLAttributes<HTMLHeadingElement> & { node?: unknown }
  > = ({ children, ...rest }) => {
    const text = childrenToPlainText(children);
    const { stripped, hadEmoji } = stripLeadingEmojiClusters(text);
    const sanitizedChildren = sanitizeEmojiInChildren(children);

    if (!hadEmoji) {
      // No leading emoji: still strip any inline emoji, keep formatting.
      return <Level {...rest}>{sanitizedChildren}</Level>;
    }
    return (
      <Level {...rest}>
        <span className="inline-flex items-center gap-1.5">
          {createElement(pickTimelineIcon(stripped), {
            className: headingIconCls,
            strokeWidth: 2,
            'aria-hidden': true,
          })}
          {/* Preserve inline bold/code formatting while emoji are removed. */}
          <span>{sanitizedChildren}</span>
        </span>
      </Level>
    );
  };
  TimelineHeading.displayName = `Timeline${Level}`;
  return TimelineHeading;
}

function emojiAwarePlainBlock(
  Tag: 'p' | 'li' | 'td' | 'th',
  { children, ...rest }: HTMLAttributes<HTMLElement> & { node?: unknown },
) {
  // Always sanitize — works for plain strings, mixed content (bold/code/links),
  // and non-leading emoji. Leading detection uses childrenToPlainText so it
  // traverses any React element children, not just flat strings.
  const text = childrenToPlainText(children);
  const { stripped, hadEmoji } = stripLeadingEmojiClusters(text);
  const sanitizedChildren = sanitizeEmojiInChildren(children);

  if (!hadEmoji) {
    // Non-leading emoji (inline/trailing) are still stripped by sanitizeEmojiInChildren.
    return <Tag {...rest}>{sanitizedChildren}</Tag>;
  }
  return (
    <Tag {...rest}>
      <span className="inline-flex items-start gap-1.5">
        {createElement(pickTimelineIcon(stripped), {
          className: blockIconCls,
          strokeWidth: 2,
          'aria-hidden': true,
        })}
        <span>{sanitizedChildren}</span>
      </span>
    </Tag>
  );
}

/** Pass into Streamdown `components` for canvas variant-run timelines only. */
export const streamdownTimelineComponents: Partial<Components> = {
  h1: makeTimelineHeading('h1'),
  h2: makeTimelineHeading('h2'),
  h3: makeTimelineHeading('h3'),
  h4: makeTimelineHeading('h4'),
  h5: makeTimelineHeading('h5'),
  h6: makeTimelineHeading('h6'),
  p: (props) => emojiAwarePlainBlock('p', props),
  li: (props) => emojiAwarePlainBlock('li', props),
  td: (props) => emojiAwarePlainBlock('td', props),
  th: (props) => emojiAwarePlainBlock('th', props),
};
