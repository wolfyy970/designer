let generation = 0;
const controllers = new Set<AbortController>();

export function currentCanvasSessionGeneration(): number {
  return generation;
}

export function isCurrentCanvasSession(sessionGeneration: number): boolean {
  return generation === sessionGeneration;
}

export function createCanvasOperationController(): {
  generation: number;
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  controllers.add(controller);
  return {
    generation,
    signal: controller.signal,
    dispose: () => controllers.delete(controller),
  };
}

export function abortCanvasOperationsForReplacement(): void {
  generation += 1;
  for (const controller of controllers) {
    controller.abort();
  }
  controllers.clear();
}
