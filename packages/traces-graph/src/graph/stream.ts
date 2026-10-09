/**
 * The view's side of a layout that runs off the main thread (backlog G7): it asks for what a calc
 * waits for (`GraphCalc.pending`, `pending.ts`), draws the positions the layout reports while it
 * settles, and has calc run again when the answer is there. Pure of drawing: the view hands in
 * how to draw a frame, how to ask for the next one and how to have calc run again
 * ({@link StreamHost}), so the whole course is tested without a renderer or a worker.
 *
 * ## The course of a request
 *
 * {@link LayoutStream.follow} is called with every context the view gets:
 *
 * - a calc that waits for something under a key no request is running for: a request starts (and
 *   the one before, if any, is cancelled). `chart.ready`, the promises of updates and image
 *   export wait from here on ({@link StreamHost.hold});
 * - a calc that waits for the same key (a restyle of a color, a label: anything the layout does
 *   not read): the request goes on, and what it has drawn so far is drawn for the new calc;
 * - a calc that waits for nothing: a request that is still running is cancelled.
 *
 * While a `force` layout cools, the worker reports its positions (`onProgress`). The last ones
 * that arrived are drawn once per animation frame, in the calc's frame (`frame.ts`), so hover and
 * selection answer for what is on screen. Without motion (reduced motion, a static plot, no
 * animation frames) no positions are asked for and nothing is drawn before the result.
 *
 * When the result arrives it is kept under the request's key, the view is told that the next
 * calc is the one it waited for ({@link StreamHost.arrived}: it glides there from what is on
 * screen), and calc is asked to run again ({@link StreamHost.recalc}). That calc finds the
 * result and waits for nothing more, or for the next thing (the bundled routes of a layout that
 * has just arrived). A layout that fails in the worker is noted as failed: calc then runs it
 * itself, and reports what it throws as it always does.
 *
 * {@link LayoutStream.stop} cancels the request when the trace or the chart goes away.
 *
 * ## Fitting the stream to the axes
 *
 * The axes were sized for the calc that waits, whose nodes are where the layout starts. A force
 * layout grows from there, by a factor of two or more on a large graph, and its final extent is
 * not known until it ends. So the positions are drawn scaled about the middle of the box of the
 * start ({@link StreamFit}): by 1 at first, which is the positions themselves, and by less as the
 * layout outgrows the box. The factor only ever falls, so the picture zooms out steadily and
 * never back in; when the result arrives and autorange fits the axes to it, the picture is
 * already about where it will be, and the view glides the rest.
 */
import { warnOnce } from '@mk7s/holochart-core';
import type { LayoutResult } from '../layout/types.ts';
import type { LayoutProgress, LayoutRunInfo, LayoutRunOptions } from '../worker/client.ts';
import type { WorkerArrangement } from '../worker/protocol.ts';
import type { GraphCalc } from './calc.ts';
import { showFrame } from './frame.ts';
import { BUNDLES, LAYOUTS, type GraphPending } from './pending.ts';
import { glide } from './tween.ts';

type Positions = { readonly x: Float64Array; readonly y: Float64Array };

/** The part of the lazy layout code a stream uses (`layout-code.ts`). */
export interface StreamCode {
  graphLayoutWorker(): {
    run(
      graph: GraphPending['graph'],
      arrangement: WorkerArrangement,
      options: unknown,
      run: LayoutRunOptions,
    ): Promise<LayoutResult>;
    cancel(owner: unknown): void;
  };
}

/** What a stream needs from its view. */
export interface StreamHost {
  /** The calc of the view's last update. */
  calc(): GraphCalc;
  /** Whether the chart may move things (reduced motion, a static plot, no animation frames). */
  motion(): boolean;
  /** Draw the frame that was just put in place (`showFrame`). */
  draw(): void;
  /** Keep the chart from being "ready" until `ready` settles; `undefined` lets it go. */
  hold(ready: Promise<void> | undefined): void;
  /** The next calc is the answer to what was asked here: the view glides to it. */
  arrived(): void;
  /** Have calc run again (`TracePlotContext.recalc`). */
  recalc(): void;
  /** The worker's client and the bundling (`loadLayoutCode`). */
  load(): Promise<StreamCode>;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  now(): number;
}

/** How long the picture takes to glide from what was on screen into the stream, in ms. */
export const STREAM_GLIDE_MS = 300;

/** The scale of a stream into the box of its start (see the module comment). */
export class StreamFit {
  /** The box the stream is drawn into: its middle and half its size. */
  readonly #cx: number;
  readonly #cy: number;
  readonly #halfWidth: number;
  readonly #halfHeight: number;
  #scale = 1;

  /** `box`: the positions the axes were sized for (the calc's). */
  constructor(box: Positions) {
    const [x0, x1] = extent(box.x);
    const [y0, y1] = extent(box.y);
    this.#cx = (x0 + x1) / 2;
    this.#cy = (y0 + y1) / 2;
    this.#halfWidth = (x1 - x0) / 2;
    this.#halfHeight = (y1 - y0) / 2;
  }

  /** The factor the last positions were drawn by, 1 or less. */
  get scale(): number {
    return this.#scale;
  }

  /** `at` scaled about the middle of the box until it is inside, written to `out`. */
  apply(at: Positions, out: { x: Float64Array; y: Float64Array }): void {
    const [x0, x1] = extent(at.x);
    const [y0, y1] = extent(at.y);
    // How far the positions reach from the middle of the box, along each axis.
    const reachX = Math.max(x1 - this.#cx, this.#cx - x0);
    const reachY = Math.max(y1 - this.#cy, this.#cy - y0);
    let scale = 1;
    if (reachX > this.#halfWidth && this.#halfWidth > 0) scale = this.#halfWidth / reachX;
    if (reachY > this.#halfHeight && this.#halfHeight > 0) {
      scale = Math.min(scale, this.#halfHeight / reachY);
    }
    // Never back in: a layout that breathes while it cools does not make the picture pump.
    this.#scale = Math.min(this.#scale, scale);
    const k = this.#scale;
    const n = Math.min(at.x.length, out.x.length);
    for (let i = 0; i < n; i++) {
      out.x[i] = this.#cx + (at.x[i]! - this.#cx) * k;
      out.y[i] = this.#cy + (at.y[i]! - this.#cy) * k;
    }
  }
}

/** The least and the greatest finite value (0, 0 when there is none). */
function extent(values: Float64Array): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi >= lo ? [lo, hi] : [0, 0];
}

/** A request that has not ended. */
interface Request {
  readonly key: string;
  readonly what: GraphPending['what'];
  /** Positions are drawn while it runs. */
  readonly streams: boolean;
  cancelled: boolean;
  /** The answer is kept and calc was asked to run again. */
  done: boolean;
  cancel?: () => void;
  fit?: StreamFit;
  /** The picture the stream glides in from, and when its first frame was drawn (-1: not yet). */
  from?: Positions | undefined;
  start: number;
  /** Positions that arrived and are not drawn yet. */
  latest?: Positions | undefined;
  /** The positions drawn last (the stream's arrays, written again for every frame). */
  drawn?: { x: Float64Array; y: Float64Array } | undefined;
}

/** The layout a view is waiting for (see the module comment). */
export class LayoutStream {
  readonly #host: StreamHost;
  #request: Request | undefined;
  #frame = 0;

  constructor(host: StreamHost) {
    this.#host = host;
  }

  /** Whether positions are being drawn as they arrive: the picture is moving. */
  get running(): boolean {
    const r = this.#request;
    return r !== undefined && r.streams && !r.done;
  }

  /** Whether a request is under way (its answer has not been kept yet). */
  get waiting(): boolean {
    return this.#request !== undefined && !this.#request.done;
  }

  /**
   * Bring the stream in line with a calc (see the module comment). `from`: the picture that was
   * on screen, in this calc's coordinates, when the calc is new and the nodes are the same ones:
   * it stays until positions arrive, and they are glided into.
   */
  follow(calc: GraphCalc, from?: Positions): void {
    const pending = calc.pending;
    const request = this.#request;
    if (!pending) {
      this.stop();
      return;
    }
    if (request && request.key === pending.key && !request.cancelled && !request.done) {
      // The same work for another calc: what was drawn so far is its picture too.
      if (request.drawn && request.drawn.x.length === calc.length) {
        showFrame(calc, { ...request.drawn, hidden: calc.hidden, routes: undefined });
      } else if (request.from && request.from.x.length === calc.length) {
        showFrame(calc, { ...request.from, hidden: calc.hidden, routes: undefined });
      }
      return;
    }
    this.stop();
    this.#start(calc, pending, from);
  }

  /** Cancel the request, if one is running: the trace is going away, or waits for nothing. */
  stop(): void {
    const request = this.#request;
    this.#request = undefined;
    if (this.#frame !== 0) this.#host.cancelFrame(this.#frame);
    this.#frame = 0;
    if (!request) return;
    request.cancelled = true;
    if (!request.done) request.cancel?.();
    this.#host.hold(undefined);
  }

  #start(calc: GraphCalc, pending: GraphPending, from: Positions | undefined): void {
    const host = this.#host;
    const streams = pending.what === 'layout' && pending.streams && host.motion();
    const request: Request = {
      key: pending.key,
      what: pending.what,
      streams,
      cancelled: false,
      done: false,
      start: -1,
      from: pending.what === 'layout' && from && from.x.length === calc.length ? from : undefined,
    };
    this.#request = request;
    if (streams) request.fit = new StreamFit(calc);
    // What was on screen stays there until the layout says where the nodes are.
    if (request.from) {
      showFrame(calc, { ...request.from, hidden: calc.hidden, routes: undefined });
    }
    let info: LayoutRunInfo | undefined;
    const ready = host
      .load()
      .then((code) => {
        if (request.cancelled) return undefined;
        const worker = code.graphLayoutWorker();
        request.cancel = () => worker.cancel(request);
        return worker.run(pending.graph, pending.arrangement, pending.options, {
          owner: request,
          thread: pending.thread === 'main' ? 'main' : 'auto',
          ...(pending.start ? { start: pending.start } : {}),
          ...(pending.bundle ? { bundle: pending.bundle } : {}),
          ...(streams ? { onProgress: (p: LayoutProgress) => this.#progress(request, p) } : {}),
          onDone: (i) => {
            info = i;
          },
        });
      })
      .then(
        (result) => {
          if (!result || request.cancelled || this.#request !== request) return;
          if (request.what === 'layout') LAYOUTS.set(request.key, { result });
          else {
            BUNDLES.set(request.key, {
              routes: result.routes ?? [],
              method: info?.bundle?.method ?? 'none',
              refused: info?.bundle?.refused === true,
            });
          }
          this.#finish(request);
        },
        (error: unknown) => {
          // A request that was cancelled or replaced rejects too: that is not a failure.
          if (request.cancelled || this.#request !== request) return;
          warnOnce(
            `graph:layout-failed:${request.what}`,
            request.what === 'layout'
              ? `[holochart] graph: the layout failed off the main thread (${describe(error)}); it runs on the main thread instead.`
              : `[holochart] graph: the links could not be bundled (${describe(error)}); they are drawn straight.`,
          );
          if (request.what === 'layout') LAYOUTS.set(request.key, { failed: true });
          else BUNDLES.set(request.key, { routes: [], method: 'none', refused: false });
          this.#finish(request);
        },
      );
    host.hold(ready);
  }

  /** The answer is kept: the frames stop, and calc runs again. */
  #finish(request: Request): void {
    request.done = true;
    request.latest = undefined;
    if (this.#frame !== 0) this.#host.cancelFrame(this.#frame);
    this.#frame = 0;
    this.#host.arrived();
    this.#host.recalc();
  }

  #progress(request: Request, progress: LayoutProgress): void {
    if (request.cancelled || request.done || this.#request !== request) return;
    request.latest = progress;
    if (this.#frame === 0) this.#frame = this.#host.requestFrame(this.#step);
  }

  /** Draw the positions that arrived last, once per animation frame. */
  readonly #step = (): void => {
    this.#frame = 0;
    const request = this.#request;
    const host = this.#host;
    if (!request || request.done) return;
    const latest = request.latest;
    request.latest = undefined;
    const calc = host.calc();
    if (!latest || latest.x.length !== calc.length || !request.fit) return;
    const n = calc.length;
    if (!request.drawn || request.drawn.x.length !== n) {
      request.drawn = { x: new Float64Array(n), y: new Float64Array(n) };
    }
    request.fit.apply(latest, request.drawn);
    let at: Positions = request.drawn;
    if (request.from) {
      const now = host.now();
      if (request.start < 0) request.start = now;
      const t = (now - request.start) / STREAM_GLIDE_MS;
      if (t >= 1) request.from = undefined;
      else at = glide(request.from, request.drawn, t);
    }
    showFrame(calc, { x: at.x, y: at.y, hidden: calc.hidden, routes: undefined });
    host.draw();
    // A glide goes on between two reports of the worker.
    if (request.from && this.#frame === 0) {
      request.latest = latest;
      this.#frame = host.requestFrame(this.#step);
    }
  };
}

function describe(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message !== '' ? message : String(error);
}
