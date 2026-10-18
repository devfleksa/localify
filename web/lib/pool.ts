// Runs fn over items with at most n in flight; results keep the input order.
export async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// Runs fn only after every earlier call with the same queue + key has settled (one at a time per key);
// other keys run in parallel. A failed call doesn't block the next one. Kept on globalThis so dev reloads
// share it; in memory is enough because the app runs as one server process.
const g = globalThis as unknown as { __queues?: Map<string, Promise<unknown>> };
const queues = (g.__queues ??= new Map());

export function oneAtATime<T>(queue: string, key: string, fn: () => Promise<T>): Promise<T> {
  const id = `${queue}:${key}`;
  const next = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
  queues.set(id, next);
  // Drop the entry once nothing else is waiting on this key.
  next.finally(() => queues.get(id) === next && queues.delete(id)).catch(() => {});
  return next;
}
