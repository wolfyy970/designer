import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useGenerationStore } from './stores/generation-store';
import { garbageCollect } from './services/idb-storage';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

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

export default function App() {
  useThemeEffect();

  // Run IndexedDB garbage collection after stores hydrate
  useEffect(() => {
    const timer = setTimeout(() => {
      const activeIds = new Set(
        useGenerationStore.getState().results.map((r) => r.id),
      );
      garbageCollect(activeIds).then(({ codesRemoved, provenanceRemoved }) => {
        if (import.meta.env.DEV && (codesRemoved > 0 || provenanceRemoved > 0)) {
          console.log(
            `[gc] Removed ${codesRemoved} orphaned code(s), ${provenanceRemoved} provenance(s) from IndexedDB`,
          );
        }
      });
    }, 3000); // Defer 3s to not compete with initial render
    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Canvas is the sole workspace */}
            <Route path="/canvas" element={<ErrorBoundary><CanvasPage /></ErrorBoundary>} />
            {import.meta.env.DEV && DesignTokensKitchenSink ? (
              <Route path="/dev/design-tokens" element={<DesignTokensKitchenSink />} />
            ) : null}
            <Route path="*" element={<Navigate to="/canvas" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
