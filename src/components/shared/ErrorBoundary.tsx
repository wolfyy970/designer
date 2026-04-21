import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@ds/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, info);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface">
          <div className="max-w-md rounded-lg border border-error-border-soft bg-error-subtle p-6 text-center">
            <h2 className="mb-2 text-lg font-semibold text-error">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-fg-secondary">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
            <Button
              variant="primary"
              onClick={this.handleReload}
            >
              Reload
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
