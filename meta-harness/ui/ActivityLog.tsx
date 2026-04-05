import { Box, Text } from 'ink';
import type { ActivityItem } from './state.ts';
import { dimText } from './theme.ts';

/** Visible lines in the TUI (newest first); full history stays in `RunnerState.activityItems`. */
const RUN_LOG_VISIBLE_MAX = 5;

function formatLogTime(atMs: number): string {
  const d = new Date(atMs);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function ActivityLog({ items }: { items: ActivityItem[] }) {
  const tail = items.length > RUN_LOG_VISIBLE_MAX ? items.slice(-RUN_LOG_VISIBLE_MAX) : [...items];
  const visible = tail.reverse();
  const omitted = items.length - tail.length;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Box flexDirection="row" flexWrap="wrap">
        <Text bold>Run log</Text>
        <Text color={dimText}>
          {items.length === 0
            ? ''
            : omitted > 0
              ? ` · ${tail.length} newest of ${items.length}`
              : ` · ${items.length} line${items.length === 1 ? '' : 's'}`}
        </Text>
      </Box>
      <Text color={dimText}>(newest at top)</Text>
      {visible.length === 0 ? (
        <Text color={dimText}>No run events yet…</Text>
      ) : (
        visible.map((item) => (
          <Text key={item.id} color={dimText}>
            [{formatLogTime(item.atMs)}] {item.text}
          </Text>
        ))
      )}
    </Box>
  );
}
