/**
 * Latest-wins request queue for asynchronous picks (plan E2.17, E6.1).
 *
 * GPU picks (3D) resolve asynchronously, and under software GL a pick can take half a second. The
 * old pattern — one pick in flight, newer requests parked in a single slot, and the in-flight
 * result dropped whenever a newer request was waiting — starves: while the pointer keeps moving,
 * every result is discarded and the readout freezes on an old hit. This queue fixes both halves:
 *
 * - at most one request runs; newer requests replace the waiting one (no backlog);
 * - every completed result is delivered (unless {@link LatestQueue.cancel} ran since it started,
 *   e.g. the pointer left), so feedback keeps flowing at the pick rate while the pointer moves,
 *   and then the waiting request starts: the latest request always resolves.
 */

/** See the module docs. */
export interface LatestQueue<Req> {
  /** Ask for `request`; replaces any request still waiting to start. */
  push(request: Req): void;
  /** Drop the waiting request and ignore the result of the running one (e.g. pointer left). */
  cancel(): void;
  /** Whether a request is running. */
  readonly busy: boolean;
  /** Stop for good: nothing is delivered after this. */
  dispose(): void;
}

/**
 * Create a {@link LatestQueue}: `run` performs one request; `deliver` receives each result that is
 * still current. A rejected `run` delivers nothing for that request but keeps the queue going.
 */
export function createLatestQueue<Req, Res>(
  run: (request: Req) => Promise<Res>,
  deliver: (result: Res, request: Req) => void,
): LatestQueue<Req> {
  let running = false;
  // The waiting request (no wrapper object: pushes arrive on every pointer move).
  let hasWaiting = false;
  let waiting: Req | undefined;
  // Bumped by cancel(): results of requests started before it are stale.
  let generation = 0;
  let disposed = false;

  const start = (request: Req): void => {
    running = true;
    const gen = generation;
    const settle = (result: { ok: true; value: Res } | { ok: false }): void => {
      running = false;
      if (disposed) return;
      if (result.ok && gen === generation) deliver(result.value, request);
      if (hasWaiting) {
        const next = waiting as Req;
        hasWaiting = false;
        waiting = undefined;
        start(next);
      }
    };
    let promise: Promise<Res>;
    try {
      promise = run(request);
    } catch {
      promise = Promise.reject(new Error('pick failed'));
    }
    promise.then(
      (value) => settle({ ok: true, value }),
      () => settle({ ok: false }),
    );
  };

  return {
    push(request) {
      if (disposed) return;
      if (running) {
        waiting = request;
        hasWaiting = true;
      } else start(request);
    },
    cancel() {
      hasWaiting = false;
      waiting = undefined;
      generation++;
    },
    get busy() {
      return running;
    },
    dispose() {
      disposed = true;
      hasWaiting = false;
      waiting = undefined;
    },
  };
}
