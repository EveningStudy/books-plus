export interface TurnOperation {
  animate: boolean;
  interrupted: boolean;
  cancelled: boolean;
  onInterrupt?: () => void;
}

// Keep renderer moves in order. A fresh key finishes the current animation,
// while a burst skips animations so it cannot build up seconds of visual delay.
export function createTurnQueue(
  move: (direction: number, operation: TurnOperation) => Promise<void>,
) {
  const pending: {
    direction: number;
    animate: boolean;
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];
  let running = false;
  let current: TurnOperation | null = null;
  let settled = Promise.resolve();
  let lastInput = -Infinity;

  const interrupt = () => {
    if (!current) return;
    current.interrupted = true;
    current.onInterrupt?.();
  };
  const drain = () => {
    if (running) return;
    running = true;
    settled = (async () => {
      try {
        while (pending.length) {
          const request = pending.shift()!;
          const operation: TurnOperation = {
            animate: request.animate,
            interrupted: false,
            cancelled: false,
          };
          current = operation;
          try {
            await move(request.direction, operation);
            request.resolve();
          } catch (error) {
            request.reject(error);
          } finally {
            current = null;
          }
        }
      } finally {
        running = false;
      }
    })();
  };

  return {
    turn(direction: number) {
      const now = performance.now();
      const animate = !running && now - lastInput >= 180;
      lastInput = now;
      interrupt();
      const result = new Promise<void>((resolve, reject) => {
        pending.push({ direction, animate, resolve, reject });
      });
      drain();
      return result;
    },
    cancel() {
      pending.splice(0).forEach((request) => request.resolve());
      lastInput = -Infinity;
      if (current) current.cancelled = true;
      interrupt();
      // Explicit seeks wait for an in-flight renderer move before navigating.
      return settled;
    },
  };
}
