import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useGenerationStore } from './stores/generation-store';
import { garbageCollect, garbageCollectCanvasSnapshots } from './services/idb-storage';
import { getSavedCanvasIds } from './services/persistence';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { LogRocketRouteTracker } from './components/shared/LogRocketRouteTracker';
import { ViewportGate } from './components/shared/ViewportGate';
import { ApiServerGate } from './components/shared/ApiServerGate';
import { migrateModelNodeToSettings } from './lib/migrate-model-node-to-settings';
import { normalizeError } from './lib/error-utils';

const HomePage = lazy(() => import('./pages/HomePage'));
const CanvasPage = lazy(() => import('./pages/CanvasPage'));
const DesignTokensKitchenSink = import.meta.env.DEV
  ? lazy(() => import('./pages/DesignTokensKitchenSink'))
  : null;

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-fg-faint border-t-fg" />
    </div>
  );
}

function CanvasRoute() {
  return (
    <ViewportGate>
      <ApiServerGate>
        <ErrorBoundary>
          <CanvasPage />
        </ErrorBoundary>
      </ApiServerGate>
    </ViewportGate>
  );
}

export default function App() {
  useThemeEffect();

  // Run IndexedDB garbage collection after stores hydrate
  useEffect(() => {
    const timer = setTimeout(() => {
      const activeIds = new Set(
        useGenerationStore.getState().results.map((r) => r.id),
      );
      /**
       * Both sweeps are best-effort background work, but they must still handle
       * rejection. `runCanvasSnapshotTx` rejects on a blocked upgrade, an open
       * timeout, or a transaction error (the exact conditions the store was
       * hardened for), and there is no global `unhandledrejection` handler — so
       * an unhandled rejection here is invisible in the UI, gets collected by
       * session replay, and leaves no signal that GC never ran.
       */
      garbageCollect(activeIds)
        .then(({ codesRemoved, provenanceRemoved }) => {
          if (import.meta.env.DEV && (codesRemoved > 0 || provenanceRemoved > 0)) {
            console.log(
              `[gc] Removed ${codesRemoved} orphaned code(s), ${provenanceRemoved} provenance(s) from IndexedDB`,
            );
          }
        })
        .catch((err) => {
          console.warn('[gc] artifact sweep failed', normalizeError(err));
        });
      garbageCollectCanvasSnapshots(getSavedCanvasIds())
        .then((removed) => {
          if (import.meta.env.DEV && removed > 0) {
            console.log(`[gc] Removed ${removed} orphaned canvas snapshot(s) from IndexedDB`);
          }
        })
        .catch((err) => {
          console.warn('[gc] canvas snapshot sweep failed', normalizeError(err));
        });
    }, 3000); // Defer 3s to not compete with initial render
    return () => clearTimeout(timer);
  }, []);

  // One-shot Model-node → Settings migration. Defers a tick so persist
  // hydration completes before we read either store. The migration helper
  // owns its own error handling (storage write failures don't bubble).
  useEffect(() => {
    const timer = setTimeout(migrateModelNodeToSettings, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LogRocketRouteTracker />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/canvas" element={<CanvasRoute />} />
            {import.meta.env.DEV && DesignTokensKitchenSink ? (
              <Route path="/dev/design-tokens" element={<DesignTokensKitchenSink />} />
            ) : null}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
