/**
 * What the layout worker does with a message (backlog G7), as a function of the message and a
 * `post` callback, so the same code runs in the worker, on the main thread when no worker can be
 * had (`client.ts`), and in a Node test without either.
 *
 * A request is worked through in **slices**: a few milliseconds of work, then a pause that lets
 * the message queue in. That is how a `cancel` reaches a running layout in the worker (a worker
 * reads no message while it computes), and on the main thread it is what keeps the page alive.
 * Only the force simulation can be cut: a slice is a number of whole ticks. The other layouts,
 * the overlap removal at the end of a force layout and the bundling of links are one call each,
 * and a cancel is seen before and after them, not inside.
 *
 * The slices change when things are reported, never what is computed: a layout's result is the
 * same bits whatever the slice length, the clock or the thread.
 */
import { bundleLinks } from '../layout/bundle/index.ts';
import type { ForceOptions } from '../layout/force/index.ts';
import { forceRunOf } from '../layout/force/warm.ts';
import type { LayoutResult } from '../layout/types.ts';
import { ONE_CALL_LAYOUTS } from './layouts.ts';
import {
  encodeResult,
  resultTransferables,
  type LayoutBundleInfo,
  type LayoutProgressMessage,
  type LayoutRequest,
  type LayoutResponse,
} from './protocol.ts';

/** Sends a response; `transfer` lists the buffers that move with it. */
export type PostLayoutResponse = (response: LayoutResponse, transfer: ArrayBuffer[]) => void;

/** What the handler needs from its surroundings; the defaults are right outside of tests. */
export interface LayoutHandlerEnvironment {
  /** A clock in milliseconds. Default `performance.now`. */
  readonly now?: () => number;
  /** Resolves in a later task, after the messages that were waiting. Default {@link createPause}. */
  readonly pause?: () => Promise<void>;
}

/** A handler made by {@link createLayoutHandler}. */
export interface LayoutHandler {
  /**
   * Take one message. A `layout` request is run to its end: the promise resolves when its last
   * response (`done`, `error` or `cancelled`) is posted. A `cancel` marks its request and
   * resolves at once. Anything else is ignored. Never rejects.
   */
  handle(message: unknown): Promise<void>;
  /** Requests that have not ended yet. */
  readonly active: number;
}

const DEFAULT_SLICE_MS = 8;
const DEFAULT_PROGRESS_INTERVAL_MS = 16;

/**
 * A function that resolves in a later task. `setImmediate` where there is one (Node: it does not
 * keep the process alive, as an open message port would), else a message to oneself, which
 * browsers do not delay as they do a `setTimeout` chain (4 ms each after the fifth).
 */
export function createPause(): () => Promise<void> {
  const scope = globalThis as { setImmediate?: (callback: () => void) => unknown };
  const immediate = scope.setImmediate;
  if (typeof immediate === 'function') {
    return () => new Promise<void>((resolve) => void immediate(resolve));
  }
  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();
    const waiting: (() => void)[] = [];
    channel.port1.onmessage = () => waiting.shift()?.();
    return () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(0);
      });
  }
  return () => new Promise<void>((resolve) => void setTimeout(resolve, 0));
}

/**
 * The positions links are bundled over: the layout's, without the nodes it left out (a node
 * without a position under `preset`, the folded part of a tree), which have a placeholder there
 * and must not pull the middle of their group towards it.
 */
function drawnPositions(result: LayoutResult): { x: Float64Array; y: Float64Array } {
  const { hidden } = result;
  if (!hidden?.includes(1)) return result;
  const x = Float64Array.from(result.x);
  const y = Float64Array.from(result.y);
  for (let i = 0; i < hidden.length; i++) if (hidden[i] === 1) x[i] = y[i] = NaN;
  return { x, y };
}

const positive = (value: unknown, fallback: number): number =>
  typeof value === 'number' && value > 0 && value < Infinity ? value : fallback;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A request as far as it can be told from any other message; its contents are the layout's to judge. */
const isRequest = (
  message: Record<string, unknown>,
): message is Record<string, unknown> & LayoutRequest =>
  message['type'] === 'layout' && typeof message['id'] === 'number' && isObject(message['graph']);

/**
 * A handler that answers through `post`. It keeps the requests that are running, so one handler
 * serves one connection (a worker's, or the client's fallback).
 */
export function createLayoutHandler(
  post: PostLayoutResponse,
  environment: LayoutHandlerEnvironment = {},
): LayoutHandler {
  const now = environment.now ?? (() => performance.now());
  const pause = environment.pause ?? createPause();
  /** Running requests by id; `true` once cancelled. */
  const running = new Map<number, boolean>();

  /** Work a request through; `false` when it was cancelled on the way (nothing final was posted). */
  async function run(request: LayoutRequest): Promise<boolean> {
    const { id, graph } = request;
    const cancelled = (): boolean => running.get(id) !== false;
    const options = request.options ?? {};
    const slice = positive(request.slice, DEFAULT_SLICE_MS);
    const progress = request.progress === false ? null : (request.progress ?? {});
    const everyTicks = Math.max(1, Math.floor(positive(progress?.everyTicks, 1)));
    const interval =
      progress?.interval === 0 ? 0 : positive(progress?.interval, DEFAULT_PROGRESS_INTERVAL_MS);

    let busy = 0;
    let ticks = 0;
    let totalTicks = 0;
    let alpha = 0;
    /** Post positions; the arrays go with the message. */
    const report = (
      x: Float64Array<ArrayBuffer>,
      y: Float64Array<ArrayBuffer>,
      z: Float64Array<ArrayBuffer> | undefined,
      settled: boolean,
    ): void => {
      const message: LayoutProgressMessage = {
        type: 'progress',
        id,
        x,
        y,
        ...(z ? { z } : {}),
        alpha,
        ticks,
        totalTicks,
        settled,
      };
      post(message, z ? [x.buffer, y.buffer, z.buffer] : [x.buffer, y.buffer]);
    };

    // A cancel sent right behind the request is already waiting: let it in before any work.
    await pause();
    if (cancelled()) return false;

    let result: LayoutResult;
    if (request.arrangement === 'force') {
      let started = now();
      const layout = forceRunOf(graph, options as ForceOptions, request.start);
      const { simulation } = layout;
      const nodes = simulation.x.length;
      totalTicks = layout.ticks;
      // The first report goes out with the first slice, so there is something to draw early.
      let reportedAt = -Infinity;
      let reportedTicks = 0;
      for (let more = true; more;) {
        // One tick at a time, `totalTicks` at most: the ticks `forceLayout` runs in one call.
        do {
          ticks++;
          more = simulation.tick() && ticks < totalTicks;
        } while (more && now() - started < slice);
        alpha = simulation.alpha;
        const time = now();
        busy += time - started;
        if (progress && ticks - reportedTicks >= everyTicks && time - reportedAt >= interval) {
          // Centered as the result will be, so the picture does not jump when the result comes.
          const x = new Float64Array(nodes);
          const y = new Float64Array(nodes);
          const z = simulation.z ? new Float64Array(nodes) : undefined;
          layout.frame(x, y, z);
          report(x, y, z, false);
          reportedAt = time;
          reportedTicks = ticks;
        }
        if (!more) break;
        await pause();
        if (cancelled()) return false;
        started = now();
      }
      started = now();
      result = layout.finish();
      busy += now() - started;
    } else {
      // An own key only: a request may come from a page of another version, or from anywhere.
      const layout = Object.hasOwn(ONE_CALL_LAYOUTS, request.arrangement)
        ? ONE_CALL_LAYOUTS[request.arrangement]
        : undefined;
      if (!layout) {
        throw new Error(
          `the '${String(request.arrangement)}' arrangement cannot run in the layout worker`,
        );
      }
      const started = now();
      result = layout(graph, options as never);
      busy += now() - started;
    }

    let bundle: LayoutBundleInfo | undefined;
    if (request.bundle) {
      if (progress) report(result.x.slice(), result.y.slice(), result.z?.slice(), true);
      await pause();
      if (cancelled()) return false;
      const started = now();
      const bundled = bundleLinks(drawnPositions(result), graph, request.bundle);
      result = { ...result, routes: bundled.routes };
      bundle = { method: bundled.method, refused: bundled.refused };
      busy += now() - started;
    }

    const encoded = encodeResult(result);
    post(
      { type: 'done', id, result: encoded, ticks, elapsed: busy, ...(bundle ? { bundle } : {}) },
      resultTransferables(encoded),
    );
    return true;
  }

  return {
    get active() {
      return running.size;
    },
    async handle(message) {
      if (!isObject(message)) return;
      if (message['type'] === 'cancel') {
        const id = message['id'];
        if (typeof id === 'number' && running.has(id)) running.set(id, true);
        return;
      }
      if (!isRequest(message)) return;
      const { id } = message;
      // An id in use would make two layouts answer as one: the second is refused.
      if (running.has(id)) return;
      running.set(id, false);
      try {
        if (!(await run(message))) post({ type: 'cancelled', id }, []);
      } catch (error) {
        const known = error instanceof Error;
        post(
          {
            type: 'error',
            id,
            name: known ? error.name : 'Error',
            message: known ? error.message : String(error),
            ...(known && error.stack !== undefined ? { stack: error.stack } : {}),
          },
          [],
        );
      } finally {
        running.delete(id);
      }
    },
  };
}
