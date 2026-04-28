import { normalizeError } from './error-utils';

export function cleanupPreviewSession(sessionId: string): void {
  void fetch(`/api/preview/sessions/${sessionId}`, { method: 'DELETE' }).catch((err) => {
    if (import.meta.env.DEV) {
      console.debug('[preview] session cleanup failed:', normalizeError(err));
    }
  });
}
