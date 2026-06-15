/**
 * Simple semaphore to cap concurrent async calls (e.g. Gemini requests).
 * Without this, N fixtures → N simultaneous calls → 429 throttling.
 * Cached calls return immediately, so the cap only matters on cold-cache bursts.
 */
export function makeSemaphore(concurrency: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            if (queue.length > 0) queue.shift()!();
          });
      };
      if (running < concurrency) run();
      else queue.push(run);
    });
  };
}
