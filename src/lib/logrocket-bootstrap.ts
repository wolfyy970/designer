import LogRocket from 'logrocket';
import setupLogRocketReact from 'logrocket-react';

/** Production default from LogRocket project settings (override with `VITE_LOGROCKET_APP_ID`). */
const LOGROCKET_APP_ID_DEFAULT = 'qbwhsc/designer-6dify';

let active = false;

function resolveAppId(): string {
  const fromEnv = (import.meta.env.VITE_LOGROCKET_APP_ID ?? '').trim();
  if (fromEnv) return fromEnv;
  if (import.meta.env.PROD) return LOGROCKET_APP_ID_DEFAULT;
  return '';
}

export function isLogRocketActive(): boolean {
  return active;
}

/** Call once on the client before rendering the app. No-op on server / without app id. */
export function initLogRocket(): void {
  if (typeof window === 'undefined' || active) return;

  const appId = resolveAppId();
  if (!appId) return;

  const release = (import.meta.env.VITE_APP_VERSION ?? '').trim() || undefined;

  LogRocket.init(appId, {
    mergeIframes: true,
    ...(release ? { release } : {}),
  });
  setupLogRocketReact();
  active = true;
}
