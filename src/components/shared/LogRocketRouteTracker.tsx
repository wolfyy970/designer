import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import LogRocket from 'logrocket';
import { isLogRocketActive } from '../../lib/logrocket-bootstrap';

/** Emits a custom event on client-side route changes when LogRocket is initialized. */
export function LogRocketRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!isLogRocketActive()) return;
    LogRocket.track('spa-navigation', {
      pathname: location.pathname,
      ...(location.search ? { search: location.search } : {}),
    });
  }, [location.pathname, location.search]);

  return null;
}
