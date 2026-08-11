const routeCleanups = new Set<() => void>();

export function registerRouteCleanup(cleanup: () => void): () => void {
  routeCleanups.add(cleanup);
  return () => routeCleanups.delete(cleanup);
}

export function cleanupRouteResources(): void {
  const pending = [...routeCleanups];
  routeCleanups.clear();
  pending.forEach((cleanup) => cleanup());
}
