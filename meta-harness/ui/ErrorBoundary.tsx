import { Box, Text } from 'ink';
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Catches render errors in the Ink TUI and shows a short recovery hint (prefer `--plain`).
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[meta-harness TUI]', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
          <Text color="red" bold>
            TUI crashed: {this.state.error.message}
          </Text>
          <Text dimColor>Re-run with --plain for line-oriented logs, or check the stack in the terminal.</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
