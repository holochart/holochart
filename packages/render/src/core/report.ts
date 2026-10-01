/**
 * Report an error thrown by user code (an event listener or a callback) without interrupting the
 * chart (S1.7): `reportError` where available, so the console and error trackers see it as
 * uncaught, else a rethrow on a microtask.
 */
export function reportUserError(error: unknown): void {
  if (typeof reportError === 'function') reportError(error);
  else
    queueMicrotask(() => {
      throw error;
    });
}
