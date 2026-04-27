import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { fetchAppConfig } from '../../api/client';
import { shouldBypassApiServerGate } from '../../lib/api-server-gate-utils';
import { normalizeError } from '../../lib/error-utils';

function FullScreenSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-8">
      <div className="flex flex-col items-center gap-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fg-faint border-t-fg" />
        <span className="font-logo text-nano font-medium tracking-wide text-fg-muted">AutoDesigner</span>
      </div>
    </div>
  );
}

function ApiServerBlocked({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-bg px-8 pt-[min(32vh,10rem)] sm:pt-[28vh]">
      <div className="flex w-full max-w-md flex-col gap-4 text-left font-sans">
        <span className="shrink-0 font-logo text-nano font-medium leading-none tracking-wide text-fg-muted">
          AutoDesigner
        </span>
        <p className="text-base font-medium leading-snug text-fg sm:text-lg">API server not reachable</p>
        <p className="text-sm leading-relaxed text-fg-secondary">
          {import.meta.env.VITE_DEV_API_PORT ? (
            <>
              The dev proxy forwards{' '}
              <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">/api</code> to Hono on port{' '}
              <span className="tabular-nums text-fg">{import.meta.env.VITE_DEV_API_PORT}</span>. In one terminal run{' '}
              <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">pnpm dev:all</code> (starts API
              then Vite), or run{' '}
              <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">pnpm dev:server</code> alongside{' '}
              <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">pnpm dev</code>.
            </>
          ) : (
            <>
              The app could not reach the API. If you are running locally, start the API with{' '}
              <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">pnpm dev:all</code> or{' '}
              <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">pnpm dev:server</code>.
            </>
          )}
        </p>
        {import.meta.env.DEV ? (
          <p className="text-xs leading-relaxed text-fg-muted">{message}</p>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-2 inline-flex w-fit items-center justify-center rounded-md border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-60"
        >
          {isRetrying ? 'Checking…' : 'Retry connection'}
        </button>
      </div>
    </div>
  );
}

/**
 * Blocks the canvas until GET /api/config succeeds so it never mounts against a dead proxy
 * (avoids noisy failed /api/* calls and confusing placeholder lockdown state).
 */
export function ApiServerGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const bypassApiCheck = shouldBypassApiServerGate(pathname, import.meta.env.DEV);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['app-config'],
    queryFn: ({ signal }) => fetchAppConfig(signal),
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: !bypassApiCheck,
    /** Hermetic tests: no backoff delay. */
    retry: import.meta.env.MODE === 'test' ? 0 : 2,
    retryDelay: (attemptIndex) => Math.min(1500 * 2 ** attemptIndex, 10_000),
    refetchOnWindowFocus: true,
  });

  if (bypassApiCheck) {
    return <>{children}</>;
  }

  if (isError && data === undefined) {
    return (
      <ApiServerBlocked
        message={normalizeError(error)}
        onRetry={() => {
          void refetch();
        }}
        isRetrying={isFetching}
      />
    );
  }

  if (isPending) {
    return <FullScreenSpinner />;
  }

  return <>{children}</>;
}
