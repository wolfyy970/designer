import { Badge } from '@inkjs/ui';
import { Box, Text } from 'ink';
import { dimText, formatMean } from './theme.ts';
import type { RunnerState } from './state.ts';

export function Scoreboard({ state }: { state: RunnerState }) {
  const total = state.testRows.length;
  const meanLabel = formatMean(state.runningMean);
  const bestLabel =
    state.bestMeanScore >= 0 ? state.bestMeanScore.toFixed(2) : formatMean(state.bestMeanScore, 'n/a');

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1}>
      <Text bold>Scoreboard</Text>
      <Box flexDirection="row" gap={1}>
        <Text>
          this candidate mean <Text bold>{meanLabel}</Text>
        </Text>
        <Text color={dimText}>
          ({state.completedTests}/{total} scored)
        </Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Text>
          best overall{' '}
          <Text bold>
            {state.bestCandidateId >= 0 ? `candidate-${state.bestCandidateId}` : 'none yet'}
          </Text>{' '}
          ({bestLabel})
        </Text>
        {state.newBestThisIteration ? <Badge color="green">new best</Badge> : null}
      </Box>
      {state.changelogRelPath ? (
        <Text color={dimText}>changelog {state.changelogRelPath}</Text>
      ) : null}
    </Box>
  );
}
