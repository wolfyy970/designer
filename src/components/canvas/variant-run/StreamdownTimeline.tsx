import { lazy, Suspense, type ComponentProps } from 'react';
import { streamdownTimelineComponents } from '../../../lib/streamdown-timeline-components';

const Streamdown = lazy(() =>
  import('streamdown').then((m) => ({ default: m.Streamdown })),
);

type StreamdownProps = ComponentProps<(typeof import('streamdown'))['Streamdown']>;

function StreamdownFallback() {
  return (
    <div className="rounded bg-surface-nested/30 px-2 py-1.5 font-mono text-badge text-fg-faint">
      Loading markdown…
    </div>
  );
}

/**
 * Streamdown + Mermaid are heavy (~800k min). Load only when the variant activity
 * timeline renders so the main canvas bundle stays smaller.
 */
export function StreamdownTimeline({ components, ...rest }: StreamdownProps) {
  return (
    <Suspense fallback={<StreamdownFallback />}>
      <Streamdown
        components={{ ...streamdownTimelineComponents, ...components }}
        {...rest}
      />
    </Suspense>
  );
}
