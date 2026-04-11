import Gradient from 'ink-gradient';
import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import { HEADER_CLOCK_INTERVAL_MS } from '../constants.ts';
import { dimText } from './theme.ts';
import type { RunnerState } from './state.ts';

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const rM = m % 60;
  const rS = s % 60;
  if (h > 0) return `${h}h ${rM}m ${rS}s`;
  if (m > 0) return `${m}m ${rS}s`;
  return `${rS}s`;
}

export function Header({ state }: { state: RunnerState }) {
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClockMs(Date.now()), HEADER_CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  const elapsed = clockMs - state.runStartedAt;

  const modeLine = `[${state.harnessMode}]${state.quitRequested ? ' · stopping' : ''}`;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Box flexDirection="column" marginRight={1}>
          <Gradient name="vice">
            <Text bold>Auto Designer meta-harness</Text>
          </Gradient>
          <Text color="magenta">{modeLine}</Text>
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Text>
            <Text bold color={dimText}>
              run time{' '}
            </Text>
            <Text>{formatElapsed(elapsed)}</Text>
          </Text>
          <Text>
            <Text bold color={dimText}>
              candidate{' '}
            </Text>
            <Text>{state.candidateLabel || '…'}</Text>
          </Text>
          <Text>
            <Text bold color={dimText}>
              progress{' '}
            </Text>
            <Text color={dimText}>
              iter {state.currentIteration}/{state.iterationsTotal}
            </Text>
          </Text>
          <Text>
            <Text bold color={dimText}>
              status{' '}
            </Text>
            <Text color="yellow">{state.globalPhase}</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
