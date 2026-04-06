import type { ComponentProps } from 'react';

type StreamdownProps = ComponentProps<(typeof import('streamdown'))['Streamdown']>;

/** Default Streamdown controls for variant timelines: hide table copy/download/fullscreen chrome. */
export function resolveStreamdownTimelineControls(
  controls: StreamdownProps['controls'],
): StreamdownProps['controls'] {
  return controls === undefined ? { table: false } : controls;
}
