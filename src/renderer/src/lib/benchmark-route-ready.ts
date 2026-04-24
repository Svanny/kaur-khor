import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { markRouteReady, snapshotRendererMemory } from './benchmark';

export function useBenchmarkRouteReady(
  routeName: string,
  isReady: boolean,
  detail?: Record<string, unknown>,
) {
  const location = useLocation();
  const lastReadyRouteRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const route = `${location.pathname}${location.search}`;
    if (lastReadyRouteRef.current === route) {
      return;
    }

    lastReadyRouteRef.current = route;
    markRouteReady(routeName, {
      route,
      routeName,
      ...(detail ?? {}),
    });
    snapshotRendererMemory(`renderer.route.${routeName}.ready`, {
      route,
      routeName,
      ...(detail ?? {}),
    });
  }, [detail, isReady, location.pathname, location.search, routeName]);
}
