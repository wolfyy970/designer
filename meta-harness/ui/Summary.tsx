import { Box, Text } from 'ink';
import { dimText, formatMean } from './theme.ts';
import type { RunnerState } from './state.ts';

export function Summary({ state }: { state: RunnerState }) {
  if (!state.finished) return null;

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="double" paddingX={1} borderColor="green">
      <Text bold>Run complete</Text>
      <Text>
        Best{' '}
        {state.finalBestId >= 0
          ? `candidate-${state.finalBestId} mean=${state.finalBestMean >= 0 ? state.finalBestMean.toFixed(2) : 'n/a'}`
          : 'none (no scored candidate)'}
      </Text>
      <Text color={dimText}>history {state.historyRelPath}/</Text>
      {state.promotionReportRelPath ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            Promotion report (manual apply)
          </Text>
          <Text>{state.promotionReportRelPath}</Text>
          {state.promotionSummary ? (
            <Text color={dimText}>
              {(() => {
                const sk =
                  state.promotionSummary.skillsAdded.length +
                  state.promotionSummary.skillsModified.length +
                  state.promotionSummary.skillsDeleted.length;
                const tc = state.promotionSummary.testCasesAdded.length;
                return `${sk} skill file${sk === 1 ? '' : 's'} differ vs repo · ${tc} new test${tc === 1 ? '' : 's'}`;
              })()}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {state.summaryRows.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Iterations</Text>
          {state.summaryRows.map((r) => (
            <Text key={r.candidateId} color={r.candidateId === state.finalBestId ? 'green' : dimText}>
              candidate-{r.candidateId}: {formatMean(r.meanScore)}
              {r.candidateId === state.finalBestId ? '  ← best' : ''}
            </Text>
          ))}
        </Box>
      ) : null}
      {state.quitRequested ? <Text color="yellow">Stopped early (q)</Text> : null}
      {state.error ? <Text color="red">{state.error}</Text> : null}
    </Box>
  );
}
