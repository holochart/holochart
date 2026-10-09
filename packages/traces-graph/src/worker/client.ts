/**
 * The page's side of the layout worker (backlog G7): {@link layoutInWorker} lays a graph out off
 * the main thread and reports positions while a simulation cools, so a large graph settles on
 * screen instead of blocking it.
 *
 * One worker serves every request; it is started with the first one. When a worker cannot be had
 * (no `Worker`, a Content Security Policy without `worker-src`, a bundler that did not emit the
 * file, a page opened from `file://`), the same handler runs on the main thread in slices of a
 * few milliseconds, with the same progress and the same result, so the caller has one code path.
 * Why there is no worker is said once, as a warning; nothing is thrown for it.
 *
 * Only built-in arrangements run here. A layout registered with `registerGraphLayout` is a
 * function and cannot be sent to a worker: call it on the main thread.
 */
import { warnOnce, type WarnFunction } from '@mk7s/holochart-core';
import type { BundleOptions } from '../layout/bundle/index.ts';
import type { ForceStart } from '../layout/force/warm.ts';
import type { LayoutGraph, LayoutResult } from '../layout/types.ts';
import { createLayoutHandler, type LayoutHandler } from './handler.ts';
import {
  LAYOUT_PROTOCOL,
  copyGraph,
  decodeResult,
  graphTransferables,
  type LayoutBundleInfo,
  type LayoutMessage,
  type LayoutProgressOptions,
  type LayoutRequest,
  type LayoutResponse,
  type WorkerArrangement,
} from './protocol.ts';
import { sharedWorker } from './shared.ts';

export { setGraphWorkerUrl } from './shared.ts';

/** Where a layout ran: in the worker, or on the main thread in slices. */
export type LayoutThread = 'worker' | 'main';

/** Positions of a simulation on its way to rest. The arrays are the caller's to keep. */
export interface LayoutProgress {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z?: Float64Array;
  /** How far from rest, 1 to 0. */
  readonly alpha: number;
  /** Ticks run so far and the ticks from start to rest. */
  readonly ticks: number;
  readonly totalTicks: number;
  /**
   * These are the final positions and only the bundled routes are still to come (a request with
   * `bundle`). Otherwise they are the simulation's on its way: centered as the result will be,
   * but not yet cleared of the last overlaps, which the result is.
   */
  readonly settled: boolean;
  readonly thread: LayoutThread;
}

/** How a finished layout went. */
export interface LayoutRunInfo {
  readonly thread: LayoutThread;
  /** Ticks run (0 for a layout that is not a simulation). */
  readonly ticks: number;
  /** Milliseconds spent computing. */
  readonly elapsed: number;
  /** Milliseconds from the request to the result on the page's clock: start-up, transfer and pauses included. */
  readonly total: number;
  /** For a request with `bundle`: the method that gave the routes, and whether it was refused. */
  readonly bundle?: LayoutBundleInfo;
}

/** Options of one {@link layoutInWorker} call. */
export interface LayoutRunOptions {
  /**
   * Called with a simulation's positions as it cools (`force`), at most once per
   * `progress.interval`. Without it no positions are sent before the result.
   */
  readonly onProgress?: (progress: LayoutProgress) => void;
  /** Called once, right before the promise resolves. */
  readonly onDone?: (info: LayoutRunInfo) => void;
  /** Aborting it cancels the layout; the promise rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /**
   * Whose layout this is (a trace, a view: any value). A new request for the same owner cancels
   * the one before, whose promise rejects with an `AbortError`.
   */
  readonly owner?: unknown;
  /**
   * `force` only: positions the simulation goes on from, and how warm it is there (the trace's
   * `force.start`), instead of the spiral.
   */
  readonly start?: ForceStart;
  /** Bundle the links once the nodes are placed: the result's `routes` are the bundled ones. */
  readonly bundle?: BundleOptions;
  /**
   * Give the graph's arrays to the worker instead of sending copies: they are empty afterwards
   * (detached), and the copy is saved. Default `false`: the caller keeps its arrays.
   */
  readonly move?: boolean;
  /** How often positions are reported. */
  readonly progress?: LayoutProgressOptions;
  /** Milliseconds of work between two pauses (see `LayoutRequest.slice`). Default 8. */
  readonly slice?: number;
  /** `'main'`: do not use the worker for this request. Default `'auto'`. */
  readonly thread?: 'auto' | 'main';
}

/** The part of a `Worker` the client uses. */
export interface LayoutWorkerLike {
  postMessage(message: LayoutMessage, transfer: ArrayBuffer[]): void;
  terminate(): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** Options of a {@link GraphLayoutWorker}. */
export interface GraphLayoutWorkerOptions {
  /**
   * Where the worker file is, for an app that serves `dist/layout-worker.js` itself. Default: next
   * to this module, which is where the package build puts it and where bundlers look.
   */
  readonly url?: string | URL;
  /** Makes the worker, for tests and hosts with a worker of their own kind. */
  readonly createWorker?: (url: string | URL | undefined) => LayoutWorkerLike;
  /** Milliseconds the worker has to load in before the main thread takes over. Default 10,000. */
  readonly startTimeout?: number;
  /** Where the warning about a missing worker goes. Default `console.warn`, once. */
  readonly warn?: WarnFunction;
}

/**
 * The worker, the way bundlers recognise it: Vite, webpack 5 and others emit the file and rewrite
 * the URL when they see exactly this expression. With a URL of the app's, nothing is rewritten.
 */
function createModuleWorker(url: string | URL | undefined): LayoutWorkerLike {
  const worker =
    url === undefined
      ? // Names the source file, which is what a bundler reading these sources (the docs, the
        // sandbox) has to find; the package build rewrites it to `./layout-worker.js`, the file
        // it emits next to `dist/index.js` (tsdown.config.ts).
        new Worker(new URL('./layout-worker.ts', import.meta.url), { type: 'module' })
      : new Worker(url, { type: 'module' });
  return worker as unknown as LayoutWorkerLike;
}

/** An error that says a request was given up, as `fetch` rejects with on abort. */
function abortError(message: string): Error {
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/** Whether `error` is the rejection of a cancelled or superseded layout, which is not a failure. */
export function isLayoutAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as Error).name === 'AbortError';
}

const describe = (cause: unknown): string => {
  if (typeof cause === 'string') return cause;
  const message = (cause as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message !== '' ? message : 'the file did not load';
};

/** A request that has not ended. */
interface Pending {
  readonly id: number;
  readonly graph: LayoutGraph;
  readonly arrangement: WorkerArrangement;
  readonly options: unknown;
  readonly run: LayoutRunOptions;
  readonly started: number;
  readonly resolve: (result: LayoutResult) => void;
  readonly reject: (error: unknown) => void;
  /** Waiting for the worker to load, sent to it, or running on the main thread. */
  where: 'queue' | LayoutThread;
  unlisten?: () => void;
}

const now = (): number => (typeof performance === 'object' ? performance.now() : Date.now());

/**
 * A layout worker and the requests sent to it. Most callers use the shared one through
 * {@link layoutInWorker}; make your own for a worker that serves one chart and ends with it.
 */
export class GraphLayoutWorker {
  readonly #options: GraphLayoutWorkerOptions;
  #state: 'idle' | 'starting' | LayoutThread = 'idle';
  #worker: LayoutWorkerLike | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #fallback: LayoutHandler | null = null;
  #nextId = 1;
  readonly #pending = new Map<number, Pending>();
  readonly #owners = new Map<unknown, Pending>();
  readonly #started: ((thread: LayoutThread) => void)[] = [];

  constructor(options: GraphLayoutWorkerOptions = {}) {
    this.#options = options;
  }

  /**
   * Where requests run: `'worker'` once the worker has loaded, `'main'` once it is known that
   * there is none, `undefined` before the first request and while the worker loads.
   */
  get thread(): LayoutThread | undefined {
    return this.#state === 'worker' || this.#state === 'main' ? this.#state : undefined;
  }

  /** Requests that have not ended: sent, waiting for the worker to load, or running here. */
  get pending(): number {
    return this.#pending.size;
  }

  /**
   * Start the worker ahead of the first request, so that request does not wait for the file.
   * Resolves with where requests will run.
   */
  start(): Promise<LayoutThread> {
    if (this.#state === 'idle') this.#start();
    const thread = this.thread;
    if (thread) return Promise.resolve(thread);
    return new Promise((resolve) => this.#started.push(resolve));
  }

  /**
   * Lay `graph` out with a built-in arrangement and that layout's own options (`ForceOptions`,
   * `LayeredOptions`, …: what the trace builds from its option containers and would pass to the
   * layout in calc). Resolves with what the layout returns, the same bits as calling it directly. Rejects with an `AbortError` when cancelled
   * ({@link isLayoutAbort}), and with the layout's error when it throws.
   */
  run<Result extends LayoutResult = LayoutResult>(
    graph: LayoutGraph,
    arrangement: WorkerArrangement,
    options?: unknown,
    run: LayoutRunOptions = {},
  ): Promise<Result> {
    return new Promise<LayoutResult>((resolve, reject) => {
      const { signal, owner } = run;
      if (signal?.aborted) {
        reject(signal.reason ?? abortError('the layout was cancelled'));
        return;
      }
      if (owner !== undefined) {
        const previous = this.#owners.get(owner);
        if (previous) this.#abort(previous, abortError('the layout was replaced by a newer one'));
      }
      const pending: Pending = {
        id: this.#nextId++,
        graph,
        arrangement,
        options,
        run,
        started: now(),
        resolve,
        reject,
        where: 'queue',
      };
      this.#pending.set(pending.id, pending);
      if (owner !== undefined) this.#owners.set(owner, pending);
      if (signal) {
        const onAbort = (): void =>
          this.#abort(pending, signal.reason ?? abortError('the layout was cancelled'));
        signal.addEventListener('abort', onAbort, { once: true });
        pending.unlisten = () => signal.removeEventListener('abort', onAbort);
      }
      this.#dispatch(pending);
    }) as Promise<Result>;
  }

  /**
   * Cancel the request of `owner`, or every request when called without one. Their promises
   * reject with an `AbortError`.
   */
  cancel(owner?: unknown): void {
    const error = abortError('the layout was cancelled');
    if (owner !== undefined) {
      const pending = this.#owners.get(owner);
      if (pending) this.#abort(pending, error);
      return;
    }
    for (const pending of [...this.#pending.values()]) this.#abort(pending, error);
  }

  /** Cancel everything and end the worker. The next request starts a new one. */
  dispose(): void {
    this.cancel();
    this.#stop();
    this.#state = 'idle';
  }

  #stop(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    const worker = this.#worker;
    this.#worker = null;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }

  #dispatch(pending: Pending): void {
    if (pending.run.thread !== 'main' && this.#state === 'idle') this.#start();
    if (pending.run.thread === 'main' || this.#state === 'main') this.#runOnMain(pending);
    else if (this.#state === 'worker') this.#send(pending);
    // Else it waits, `where: 'queue'`, for the worker to say `ready` or to fail.
  }

  #start(): void {
    const create = this.#options.createWorker;
    if (!create && typeof Worker !== 'function') {
      this.#fall('this environment has no Worker');
      return;
    }
    let worker: LayoutWorkerLike;
    try {
      worker = (create ?? createModuleWorker)(this.#options.url);
    } catch (error) {
      this.#fall(`it could not be created: ${describe(error)}`);
      return;
    }
    this.#worker = worker;
    this.#state = 'starting';
    worker.onmessage = (event) => {
      if (worker === this.#worker) this.#receive(event.data as LayoutResponse);
    };
    // A file that is missing, blocked or not a script fails here, after `new Worker` returned.
    worker.onerror = (event) => {
      if (worker === this.#worker) this.#failed(describe(event));
    };
    this.#timer = setTimeout(
      () => this.#failed('it did not load in time'),
      this.#options.startTimeout ?? 10_000,
    );
  }

  /** There is no worker (any more): say why, once, and move what was meant for it to the main thread. */
  #failed(reason: string): void {
    const loaded = this.#state === 'worker';
    this.#stop();
    this.#fall(loaded ? `it failed: ${reason}` : `it could not be loaded: ${reason}`);
    for (const pending of [...this.#pending.values()]) {
      if (pending.where === 'main') continue;
      if (pending.where === 'worker' && pending.run.move) {
        // Its arrays went with the worker.
        this.#end(pending);
        pending.reject(new Error(`the layout worker failed: ${reason}`));
      } else {
        this.#runOnMain(pending);
      }
    }
  }

  #fall(reason: string): void {
    this.#state = 'main';
    warnOnce(
      'graph:layout-worker',
      `[holochart] graph: the layout worker is not available (${reason}). Layouts run on the ` +
        'main thread, in slices. If a Content Security Policy or the bundler keeps the file ' +
        "from loading, serve the package's dist/layout-worker.js yourself and call " +
        'setGraphWorkerUrl(url).',
      this.#options.warn,
    );
    this.#announce('main');
  }

  #announce(thread: LayoutThread): void {
    for (const resolve of this.#started.splice(0)) resolve(thread);
  }

  #receive(response: LayoutResponse): void {
    if (response.type !== 'ready') {
      this.#answer(response, 'worker');
      return;
    }
    if (this.#state !== 'starting') return;
    if (response.protocol !== LAYOUT_PROTOCOL) {
      this.#failed(
        `the file speaks protocol ${String(response.protocol)}, this package ${LAYOUT_PROTOCOL}: ` +
          'it is from another version',
      );
      return;
    }
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#state = 'worker';
    this.#announce('worker');
    for (const pending of [...this.#pending.values()]) {
      if (pending.where === 'queue') this.#send(pending);
    }
  }

  #request(pending: Pending, graph: LayoutGraph): LayoutRequest {
    const { run } = pending;
    return {
      type: 'layout',
      id: pending.id,
      arrangement: pending.arrangement,
      graph,
      options: pending.options,
      progress: run.onProgress ? (run.progress ?? {}) : false,
      ...(run.start ? { start: run.start } : {}),
      ...(run.bundle ? { bundle: run.bundle } : {}),
      ...(run.slice !== undefined ? { slice: run.slice } : {}),
    };
  }

  #send(pending: Pending): void {
    const worker = this.#worker;
    if (!worker) {
      this.#runOnMain(pending);
      return;
    }
    const graph = pending.run.move ? pending.graph : copyGraph(pending.graph);
    pending.where = 'worker';
    try {
      worker.postMessage(this.#request(pending, graph), graphTransferables(graph));
    } catch (error) {
      // Options that hold a function (or anything else that cannot be cloned) cannot be sent;
      // nothing was transferred, so the layout can still run here.
      warnOnce(
        'graph:layout-worker-clone',
        `[holochart] graph: a layout request could not be sent to the worker (${describe(error)}); ` +
          'it runs on the main thread. Layout options must be plain data.',
        this.#options.warn,
      );
      this.#runOnMain(pending);
    }
  }

  #runOnMain(pending: Pending): void {
    pending.where = 'main';
    this.#fallback ??= createLayoutHandler((response) => {
      if (response.type !== 'ready') this.#answer(response, 'main');
    });
    void this.#fallback.handle(this.#request(pending, pending.graph));
  }

  /** A response to a request: dropped unless the request is still wanted, from that thread. */
  #answer(response: Exclude<LayoutResponse, { type: 'ready' }>, thread: LayoutThread): void {
    const pending = this.#pending.get(response.id);
    if (!pending || pending.where !== thread) return;
    switch (response.type) {
      case 'progress': {
        const { x, y, z, alpha, ticks, totalTicks, settled } = response;
        try {
          pending.run.onProgress?.({
            x,
            y,
            ...(z ? { z } : {}),
            alpha,
            ticks,
            totalTicks,
            settled,
            thread,
          });
        } catch (error) {
          this.#abort(pending, error);
        }
        return;
      }
      case 'done': {
        this.#end(pending);
        const result = decodeResult(response.result);
        try {
          pending.run.onDone?.({
            thread,
            ticks: response.ticks,
            elapsed: response.elapsed,
            total: now() - pending.started,
            ...(response.bundle ? { bundle: response.bundle } : {}),
          });
        } catch (error) {
          pending.reject(error);
          return;
        }
        pending.resolve(result);
        return;
      }
      case 'error': {
        this.#end(pending);
        const error = new Error(response.message);
        error.name = response.name;
        if (response.stack !== undefined) error.stack = response.stack;
        pending.reject(error);
        return;
      }
      case 'cancelled':
        return;
    }
  }

  /** Forget a request that has ended, one way or another. */
  #end(pending: Pending): void {
    this.#pending.delete(pending.id);
    const owner = pending.run.owner;
    if (owner !== undefined && this.#owners.get(owner) === pending) this.#owners.delete(owner);
    pending.unlisten?.();
  }

  /** Give a request up: stop its work where it runs and reject its promise with `error`. */
  #abort(pending: Pending, error: unknown): void {
    if (this.#pending.get(pending.id) !== pending) return;
    this.#end(pending);
    const cancel: LayoutMessage = { type: 'cancel', id: pending.id };
    if (pending.where === 'worker') this.#worker?.postMessage(cancel, []);
    else if (pending.where === 'main') void this.#fallback?.handle(cancel);
    pending.reject(error);
  }
}

/** The layout worker every `graph` trace of the page shares, made on first use. */
export function graphLayoutWorker(): GraphLayoutWorker {
  return sharedWorker((url) => new GraphLayoutWorker(url === undefined ? {} : { url }));
}

/**
 * Lay a graph out in the shared layout worker, or on the main thread in slices when there is no
 * worker: see {@link GraphLayoutWorker.run} and {@link LayoutRunOptions}.
 *
 * ```ts
 * const result = await layoutInWorker(graph, 'force', { ticks: 300 }, {
 *   owner: view,
 *   onProgress: ({ x, y }) => view.setPositions(x, y),
 * });
 * ```
 */
export function layoutInWorker<Result extends LayoutResult = LayoutResult>(
  graph: LayoutGraph,
  arrangement: WorkerArrangement,
  options?: unknown,
  run?: LayoutRunOptions,
): Promise<Result> {
  return graphLayoutWorker().run<Result>(graph, arrangement, options, run);
}
