import { useEffect, useState } from 'react';
import { Spinner } from '@inkjs/ui';
import { Box, Text } from 'ink';
import { scoreColor, dimText } from './theme.ts';
import type { RunnerState } from './state.ts';

function DetailBuffer({ label, lines }: { label: string; lines: string[] }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow" bold>
        SSE detail{label ? ` · ${label}` : ''}
      </Text>
      {lines.length ? (
        lines.map((l, i) => (
          <Text key={i} color={dimText}>
            {l}
          </Text>
        ))
      ) : (
        <Text color={dimText}>Waiting for events… (d to hide)</Text>
      )}
    </Box>
  );
}

function statusGlyph(status: RunnerState['testRows'][0]['status'], isActive: boolean): string {
  if (isActive) return '›';
  switch (status) {
    case 'pending':
      return '○';
    case 'running':
      return '›';
    case 'done':
      return '✓';
    case 'unscored':
      return '⚠';
    case 'error':
      return '✗';
    case 'skipped':
      return '⊘';
    default:
      return '·';
  }
}

/** Ticking elapsed clock while a test row is running. */
function LiveRunningElapsed({ startedAtMs }: { startedAtMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAtMs]);
  const sec = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  return <Text color={dimText}>{sec}s</Text>;
}

export function TestCaseTable({ state }: { state: RunnerState }) {
  if (state.testRows.length === 0) {
    return (
      <Box>
        <Text color={dimText}>no test cases loaded</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold>Test cases</Text>
      {state.testRows.map((r) => {
        const active = state.activeTestName === r.name;
        const sc = scoreColor(r.score);
        const showLiveClock = r.status === 'running' && r.startedAtMs != null;
        return (
          <Box key={r.name} flexDirection="row" gap={1}>
            <Box width={3}>
              {r.status === 'running' && active ? (
                <Spinner />
              ) : (
                <Text color={active ? 'cyan' : dimText}>{statusGlyph(r.status, active)}</Text>
              )}
            </Box>
            <Box width={28}>
              <Text bold={active}>{r.name}</Text>
            </Box>
            <Box flexGrow={1} minWidth={24}>
              <Text color={dimText}>
                {`${r.liveLine || r.phase || ''}${
                  r.status === 'running' && r.lastHeartbeatSec != null
                    ? ` (hb ${r.lastHeartbeatSec}s)`
                    : ''
                }`}
              </Text>
            </Box>
            <Box width={8}>
              <Text color={sc}>
                {r.status === 'pending' ? '—' : r.score != null ? r.score.toFixed(2) : '—'}
              </Text>
            </Box>
            <Box width={14}>
              <Text color={dimText}>{r.stopReason ?? ''}</Text>
            </Box>
            <Box width={8}>
              {showLiveClock ? (
                <LiveRunningElapsed startedAtMs={r.startedAtMs!} />
              ) : (
                <Text color={dimText}>{r.elapsedLabel}</Text>
              )}
            </Box>
          </Box>
        );
      })}
      {state.showDetail ? (
        <DetailBuffer
          label={state.activeTestName ?? state.lastDetailTestName ?? ''}
          lines={
            state.testRows.find((x) => x.name === (state.activeTestName ?? state.lastDetailTestName))
              ?.detailLines ?? []
          }
        />
      ) : null}
    </Box>
  );
}
