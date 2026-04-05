import { Box, Text } from 'ink';
import { dimText } from './theme.ts';
import type { RunnerState } from './state.ts';

export function StatusBar({ state }: { state: RunnerState }) {
  return (
    <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Text color={dimText}>
        mode {state.harnessMode} · q quit · d SSE detail ({state.showDetail ? 'on' : 'off'}) ·{' '}
        {state.cfgSummary.apiBaseUrl}
      </Text>
    </Box>
  );
}
