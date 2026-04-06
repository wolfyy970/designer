import { lazy, Suspense, type ComponentProps } from 'react';
import { streamdownTimelineComponents } from '../../../lib/streamdown-timeline-components';

const Streamdown = lazy(() =>
  import('streamdown').then((m) => ({ default: m.Streamdown })),
);

type StreamdownProps = ComponentProps<(typeof import('streamdown'))['Streamdown']>;

/** Default Streamdown controls for variant timelines: hide table copy/download/fullscreen chrome. */
export function resolveStreamdownTimelineControls(
  controls: StreamdownProps['controls'],
): StreamdownProps['controls'] {
  return controls === undefined ? { table: false } : controls;
}

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
export function StreamdownTimeline({
  components,
  controls,
  ...rest
}: StreamdownProps) {
  return (
    <Suspense fallback={<StreamdownFallback />}>
      <Streamdown
        components={{ ...streamdownTimelineComponents, ...components }}
        controls={resolveStreamdownTimelineControls(controls)}
        {...rest}
      />
    </Suspense>
  );
}
