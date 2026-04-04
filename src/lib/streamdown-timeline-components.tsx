/**
 * Streamdown overrides for the agent activity timeline: replace system emoji in
 * headings (and plain-text blocks) with Lucide icons that match the design system.
 */
import {
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
  FolderOpen,
  ListTree,
  Palette,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Components } from 'streamdown';

const headingIconCls = 'h-3.5 w-3.5 shrink-0 text-accent';
const blockIconCls = 'mt-0.5 h-3.5 w-3.5 shrink-0 text-accent';

/** Peel flag sequences, pictographic emoji, and ZWJ chains from the start of a string. */
export function stripLeadingEmojiClusters(input: string): { stripped: string; hadEmoji: boolean } {
  let s = input.trimStart();
  let hadEmoji = false;

  while (s.length > 0) {
    const ri = s.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u);
    if (ri) {
      s = s.slice(ri[0].length).trimStart();
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
      s = s.trimStart();
      continue;
    }

    break;
  }

  return { stripped: s.trimStart(), hadEmoji };
}

function pickTimelineIcon(headline: string): LucideIcon {
  const h = headline.toLowerCase();
  if (/(accessibility|wcag|a11y|aria|skip\s*link)/.test(h)) return Accessibility;
  if (/(file|created|folder|directory|tree\b|structure)/.test(h)) return FolderOpen;
  if (/(metric|track|funnel|analytics|progress|timer|chart)/.test(h)) return BarChart3;
  if (/(tool|todo|task|plan|milestone)/.test(h)) return Wrench;
  if (/(test|check|verify|complete|done|success)/.test(h)) return CheckCircle2;
  if (/(warn|error|fix|issue|bug)/.test(h)) return AlertCircle;
  if (/(design|ui|layout|style)/.test(h)) return Palette;
  return ListTree;
}

function childrenToPlainText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenToPlainText).join('');
  if (isValidElement(node) && node.props && typeof node.props === 'object' && 'children' in node.props) {
    return childrenToPlainText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function isPlainStringChildren(children: ReactNode): boolean {
  if (children == null || children === false) return true;
  if (typeof children === 'string' || typeof children === 'number') return true;
  if (Array.isArray(children)) {
    return children.every(
      (c) =>
        c == null ||
        typeof c === 'boolean' ||
        typeof c === 'string' ||
        typeof c === 'number',
    );
  }
  return false;
}

function plainChildrenToString(children: ReactNode): string {
  if (children == null || children === false || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map((c) => plainChildrenToString(c)).join('');
  return '';
}

function makeTimelineHeading(Level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  const TimelineHeading: ComponentType<
    HTMLAttributes<HTMLHeadingElement> & { node?: unknown }
  > = ({ children, ...rest }) => {
    const text = childrenToPlainText(children);
    const { stripped, hadEmoji } = stripLeadingEmojiClusters(text);
    if (!hadEmoji) {
      return <Level {...rest}>{children}</Level>;
    }
    const Icon = pickTimelineIcon(stripped);
    return (
      <Level {...rest}>
        <span className="inline-flex items-center gap-1.5">
          <Icon className={headingIconCls} strokeWidth={2} aria-hidden />
          <span>{stripped}</span>
        </span>
      </Level>
    );
  };
  TimelineHeading.displayName = `Timeline${Level}`;
  return TimelineHeading;
}

function emojiAwarePlainBlock(
  Tag: 'p' | 'li',
  { children, ...rest }: HTMLAttributes<HTMLElement> & { node?: unknown },
) {
  if (!isPlainStringChildren(children)) {
    return <Tag {...rest}>{children}</Tag>;
  }
  const text = plainChildrenToString(children);
  const { stripped, hadEmoji } = stripLeadingEmojiClusters(text);
  if (!hadEmoji) {
    return <Tag {...rest}>{children}</Tag>;
  }
  const Icon = pickTimelineIcon(stripped);
  return (
    <Tag {...rest}>
      <span className="inline-flex items-start gap-1.5">
        <Icon className={blockIconCls} strokeWidth={2} aria-hidden />
        <span>{stripped}</span>
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
};
