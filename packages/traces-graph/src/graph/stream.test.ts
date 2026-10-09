import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutResult } from '../layout/types.ts';
import type { LayoutProgress, LayoutRunInfo, LayoutRunOptions } from '../worker/client.ts';
import type { GraphCalc } from './calc.ts';
import { frameOf } from './frame.ts';
import { BUNDLES, clearPending, LAYOUTS, type GraphPending } from './pending.ts';
import { LayoutStream, STREAM_GLIDE_MS, StreamFit, type StreamHost } from './stream.ts';

afterEach(() => {
  clearPending();
  vi.restoreAllMocks();
});

/** A calc of `n` nodes on a line that waits for `pending`. */
function calcOf(n: number, pending?: Partial<GraphPending>): GraphCalc {
  const calc = {
    length: n,
    x: Float64Array.from({ length: n }, (_, i) => i * 10),
    y: new Float64Array(n),
    hidden: new Uint8Array(n),
    routes: undefined,
    pending: pending
      ? {
          key: 'k1',
          what: 'layout',
          arrangement: 'force',
          graph: { nodes: n },
          options: { ticks: 5 },
          thread: 'worker',
          streams: true,
          ...pending,
        }
      : undefined,
  };
  return calc as unknown as GraphCalc;
}

/** One request the fake worker was given, to answer by hand. */
interface Sent {
  arrangement: string;
  options: unknown;
  run: LayoutRunOptions;
  resolve(result: LayoutResult, info?: Partial<LayoutRunInfo>): void;
  reject(error: unknown): void;
  cancelled: boolean;
}

function harness(calc: GraphCalc, motion = true) {
  const sent: Sent[] = [];
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  let now = 0;
  const state = { calc, holds: [] as (Promise<void> | undefined)[] };
  const draw = vi.fn<() => void>();
  const arrived = vi.fn<() => void>();
  const recalc = vi.fn<() => void>();
  const host: StreamHost & { draw: typeof draw; arrived: typeof arrived; recalc: typeof recalc } = {
    calc: () => state.calc,
    motion: () => motion,
    draw,
    hold: (ready) => {
      state.holds.push(ready);
    },
    arrived,
    recalc,
    load: () =>
      Promise.resolve({
        graphLayoutWorker: () => ({
          run(_graph, arrangement, options, run) {
            return new Promise<LayoutResult>((resolve, reject) => {
              const request: Sent = {
                arrangement,
                options,
                run,
                cancelled: false,
                resolve: (result, info) => {
                  run.onDone?.({ thread: 'worker', ticks: 5, elapsed: 1, total: 2, ...info });
                  resolve(result);
                },
                reject,
              };
              sent.push(request);
            });
          },
          cancel(owner) {
            for (const request of sent) {
              if (request.run.owner !== owner || request.cancelled) continue;
              request.cancelled = true;
              const error = new Error('cancelled');
              error.name = 'AbortError';
              request.reject(error);
            }
          },
        }),
      }),
    requestFrame: (callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
    now: () => now,
  };
  const stream = new LayoutStream(host);
  return {
    stream,
    host,
    sent,
    state,
    frames,
    /** Run the animation frames that are asked for now. */
    frame(elapsed = 16) {
      now += elapsed;
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback();
    },
    /** Let the promises of `load` and of a settled request run. */
    flush: async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    },
  };
}

const progress = (x: number[], y: number[]): LayoutProgress => ({
  x: Float64Array.from(x),
  y: Float64Array.from(y),
  alpha: 0.5,
  ticks: 1,
  totalTicks: 5,
  settled: false,
  thread: 'worker',
});

const result = (n: number): LayoutResult => ({
  x: Float64Array.from({ length: n }, (_, i) => i),
  y: Float64Array.from({ length: n }, (_, i) => -i),
});

describe('LayoutStream', () => {
  it('does nothing for a calc that waits for nothing', async () => {
    const h = harness(calcOf(3));
    h.stream.follow(h.state.calc);
    await h.flush();
    expect(h.sent).toHaveLength(0);
    expect(h.stream.waiting).toBe(false);
    expect(h.stream.running).toBe(false);
  });

  it('asks for the layout a calc waits for, and holds the chart until it is there', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    expect(h.stream.waiting).toBe(true);
    expect(h.stream.running).toBe(true);
    // The chart waits from the first moment, before the code is loaded.
    expect(h.state.holds).toHaveLength(1);
    expect(h.state.holds[0]).toBeInstanceOf(Promise);
    await h.flush();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.arrangement).toBe('force');
    expect(h.sent[0]!.options).toEqual({ ticks: 5 });
    expect(h.sent[0]!.run.thread).toBe('auto');
    expect(typeof h.sent[0]!.run.onProgress).toBe('function');
  });

  it('draws the positions that arrive once per animation frame, the last ones', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    const report = h.sent[0]!.run.onProgress!;
    report(progress([0, 1, 2], [0, 0, 0]));
    report(progress([0, 5, 10], [0, 1, 0]));
    report(progress([0, 10, 20], [0, 2, 0]));
    // Three reports, one frame asked for, nothing drawn yet.
    expect(h.frames.size).toBe(1);
    expect(h.host.draw).not.toHaveBeenCalled();
    h.frame();
    expect(h.host.draw).toHaveBeenCalledTimes(1);
    const frame = frameOf(h.state.calc);
    // The last report, in the calc's frame (here it is inside the box of the calc as it is; the
    // calc's nodes are on a line, so the box has no height and y is not scaled).
    expect(Array.from(frame.x)).toEqual([0, 10, 20]);
    expect(Array.from(frame.y)).toEqual([0, 2, 0]);
    expect(frame.hidden).toBe(h.state.calc.hidden);
    expect(frame.stamp).not.toBe(0);
    // No report, no frame.
    expect(h.frames.size).toBe(0);
    h.frame();
    expect(h.host.draw).toHaveBeenCalledTimes(1);
  });

  it('keeps the result, tells the view and has calc run again', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    const answer = result(3);
    h.sent[0]!.resolve(answer);
    await h.flush();
    expect(LAYOUTS.get('k1')).toEqual({ result: answer });
    expect(h.host.arrived).toHaveBeenCalledTimes(1);
    expect(h.host.recalc).toHaveBeenCalledTimes(1);
    expect(h.stream.waiting).toBe(false);
    expect(h.stream.running).toBe(false);
    // The promise the chart waits for settles after calc was asked to run again.
    await expect(h.state.holds[0]).resolves.toBeUndefined();
    // The calc that comes back waits for nothing: the hold is let go.
    h.state.calc = calcOf(3);
    h.stream.follow(h.state.calc);
    expect(h.state.holds.at(-1)).toBeUndefined();
  });

  it('draws no late report after the result', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    const report = h.sent[0]!.run.onProgress!;
    report(progress([0, 1, 2], [0, 0, 0]));
    h.sent[0]!.resolve(result(3));
    await h.flush();
    // The frame that was asked for is cancelled.
    expect(h.frames.size).toBe(0);
    report(progress([9, 9, 9], [9, 9, 9]));
    h.frame();
    expect(h.host.draw).not.toHaveBeenCalled();
  });

  it('goes on for a calc that waits for the same key (a style restyle), with its picture', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    h.sent[0]!.run.onProgress!(progress([0, 10, 20], [0, 4, 0]));
    h.frame();
    // Another calc for the same layout: no new request, and it shows what was drawn so far.
    const again = calcOf(3, {});
    h.state.calc = again;
    h.stream.follow(again);
    await h.flush();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.cancelled).toBe(false);
    expect(Array.from(frameOf(again).y)).toEqual([0, 4, 0]);
    // The result is kept under the key both calcs wait for.
    h.sent[0]!.resolve(result(3));
    await h.flush();
    expect(h.host.recalc).toHaveBeenCalledTimes(1);
  });

  it('cancels and starts over for a calc that waits for another key (a restyle of the layout)', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    const other = calcOf(3, { key: 'k2', options: { ticks: 9 } });
    h.state.calc = other;
    h.stream.follow(other);
    await h.flush();
    expect(h.sent).toHaveLength(2);
    expect(h.sent[0]!.cancelled).toBe(true);
    expect(h.sent[1]!.options).toEqual({ ticks: 9 });
    // The cancelled request keeps nothing and asks for nothing.
    expect(LAYOUTS.get('k1')).toBeUndefined();
    expect(h.host.recalc).not.toHaveBeenCalled();
    h.sent[1]!.resolve(result(3));
    await h.flush();
    expect(LAYOUTS.get('k2')).toBeDefined();
    expect(h.host.recalc).toHaveBeenCalledTimes(1);
  });

  it('cancels when the trace goes away, and lets the chart go', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    h.sent[0]!.run.onProgress!(progress([0, 1, 2], [0, 0, 0]));
    h.stream.stop();
    await h.flush();
    expect(h.sent[0]!.cancelled).toBe(true);
    expect(h.frames.size).toBe(0);
    expect(h.state.holds.at(-1)).toBeUndefined();
    expect(h.host.recalc).not.toHaveBeenCalled();
    expect(h.stream.waiting).toBe(false);
    // The promise the chart held does not reject.
    await expect(h.state.holds[0]).resolves.toBeUndefined();
  });

  it('cancels before the code has loaded without sending anything', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    h.stream.stop();
    await h.flush();
    expect(h.sent).toHaveLength(0);
    expect(h.host.recalc).not.toHaveBeenCalled();
  });

  it('cancels for a calc that waits for nothing', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    h.state.calc = calcOf(3);
    h.stream.follow(h.state.calc);
    await h.flush();
    expect(h.sent[0]!.cancelled).toBe(true);
    expect(h.host.recalc).not.toHaveBeenCalled();
  });

  it('asks for no positions without motion, and draws nothing before the result', async () => {
    const h = harness(calcOf(3, {}), false);
    h.stream.follow(h.state.calc);
    await h.flush();
    expect(h.sent[0]!.run.onProgress).toBeUndefined();
    expect(h.stream.running).toBe(false);
    expect(h.stream.waiting).toBe(true);
    h.sent[0]!.resolve(result(3));
    await h.flush();
    expect(h.host.draw).not.toHaveBeenCalled();
    expect(h.host.recalc).toHaveBeenCalledTimes(1);
  });

  it('asks for no positions of a layout that reports none', async () => {
    const h = harness(calcOf(3, { arrangement: 'layered', streams: false }));
    h.stream.follow(h.state.calc);
    await h.flush();
    expect(h.sent[0]!.arrangement).toBe('layered');
    expect(h.sent[0]!.run.onProgress).toBeUndefined();
    expect(h.stream.running).toBe(false);
  });

  it('passes on the start of a warm layout, the bundling and the thread', async () => {
    const start = { x: new Float64Array(3), y: new Float64Array(3), alpha: 0.3 };
    const h = harness(calcOf(3, { start, thread: 'main' }));
    h.stream.follow(h.state.calc);
    await h.flush();
    expect(h.sent[0]!.run.start).toBe(start);
    expect(h.sent[0]!.run.thread).toBe('main');
    expect(h.sent[0]!.run.bundle).toBeUndefined();
  });

  it('keeps bundled routes under their key, with how the bundling went', async () => {
    const bundle = { method: 'force' as const, strength: 0.85 };
    const h = harness(
      calcOf(3, { key: 'k1|b', what: 'bundle', arrangement: 'preset', streams: false, bundle }),
    );
    h.stream.follow(h.state.calc);
    await h.flush();
    expect(h.sent[0]!.arrangement).toBe('preset');
    expect(h.sent[0]!.run.bundle).toBe(bundle);
    expect(h.sent[0]!.run.onProgress).toBeUndefined();
    const routes = [undefined, { points: Float64Array.of(0, 0, 1, 1), kind: 'polyline' as const }];
    h.sent[0]!.resolve({ ...result(3), routes }, { bundle: { method: 'force', refused: false } });
    await h.flush();
    expect(BUNDLES.get('k1|b')).toEqual({ routes, method: 'force', refused: false });
    expect(LAYOUTS.get('k1|b')).toBeUndefined();
    expect(h.host.recalc).toHaveBeenCalledTimes(1);
  });

  it('notes a refusal of the bundling', async () => {
    const h = harness(
      calcOf(3, { key: 'b', what: 'bundle', arrangement: 'preset', streams: false }),
    );
    h.stream.follow(h.state.calc);
    await h.flush();
    h.sent[0]!.resolve({ ...result(3), routes: [] }, { bundle: { method: 'none', refused: true } });
    await h.flush();
    expect(BUNDLES.get('b')).toEqual({ routes: [], method: 'none', refused: true });
  });

  it('notes a layout that fails, warns once and has calc run it itself', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    h.sent[0]!.reject(new Error('boom'));
    await h.flush();
    expect(LAYOUTS.get('k1')).toEqual({ failed: true });
    expect(h.host.recalc).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('boom');
    await expect(h.state.holds[0]).resolves.toBeUndefined();
  });

  it('draws the links straight when the bundling fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness(
      calcOf(3, { key: 'b2', what: 'bundle', arrangement: 'preset', streams: false }),
    );
    h.stream.follow(h.state.calc);
    await h.flush();
    h.sent[0]!.reject(new Error('no'));
    await h.flush();
    expect(BUNDLES.get('b2')).toEqual({ routes: [], method: 'none', refused: false });
    expect(h.host.recalc).toHaveBeenCalledTimes(1);
  });

  it('starts over when the answer it kept is gone again', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    h.sent[0]!.resolve(result(3));
    await h.flush();
    // Calc ran again and still waits for the same key (the answer was dropped meanwhile).
    h.state.calc = calcOf(3, {});
    h.stream.follow(h.state.calc);
    await h.flush();
    expect(h.sent).toHaveLength(2);
  });

  it('keeps what was on screen until positions arrive, and glides into them', async () => {
    const h = harness(calcOf(3, {}));
    const from = { x: Float64Array.of(100, 100, 100), y: Float64Array.of(50, 50, 50) };
    h.stream.follow(h.state.calc, from);
    // At once: the calc is drawn where the nodes were.
    expect(Array.from(frameOf(h.state.calc).x)).toEqual([100, 100, 100]);
    await h.flush();
    h.sent[0]!.run.onProgress!(progress([0, 10, 20], [0, 0, 0]));
    h.frame();
    // The first frame of the stream is still where the nodes were.
    expect(Array.from(frameOf(h.state.calc).x)).toEqual([100, 100, 100]);
    // The glide goes on between two reports.
    expect(h.frames.size).toBe(1);
    h.frame(STREAM_GLIDE_MS / 2);
    const half = frameOf(h.state.calc);
    expect(half.x[0]).toBeCloseTo(50, 6);
    expect(half.y[1]).toBeCloseTo(25, 6);
    h.frame(STREAM_GLIDE_MS);
    expect(Array.from(frameOf(h.state.calc).x)).toEqual([0, 10, 20]);
    // Arrived: frames are asked for by reports alone again.
    expect(h.frames.size).toBe(0);
  });

  it('ignores a picture of other nodes', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc, { x: new Float64Array(5), y: new Float64Array(5) });
    expect(frameOf(h.state.calc).stamp).toBe(0);
  });

  it('ignores positions for another number of nodes', async () => {
    const h = harness(calcOf(3, {}));
    h.stream.follow(h.state.calc);
    await h.flush();
    h.sent[0]!.run.onProgress!(progress([0, 1], [0, 1]));
    h.frame();
    expect(h.host.draw).not.toHaveBeenCalled();
  });
});

describe('StreamFit', () => {
  const box = { x: Float64Array.of(-50, 50), y: Float64Array.of(-20, 20) };
  const out = () => ({ x: new Float64Array(2), y: new Float64Array(2) });

  it('draws positions that are inside the box as they are', () => {
    const fit = new StreamFit(box);
    const to = out();
    fit.apply({ x: Float64Array.of(-10, 30), y: Float64Array.of(-5, 15) }, to);
    expect(fit.scale).toBe(1);
    expect(Array.from(to.x)).toEqual([-10, 30]);
    expect(Array.from(to.y)).toEqual([-5, 15]);
  });

  it('scales positions that outgrow the box into it, by the axis that outgrows it most', () => {
    const fit = new StreamFit(box);
    const to = out();
    fit.apply({ x: Float64Array.of(-100, 100), y: Float64Array.of(-80, 80) }, to);
    // 200 wide into 100, 160 high into 40: a quarter.
    expect(fit.scale).toBe(0.25);
    expect(Array.from(to.x)).toEqual([-25, 25]);
    expect(Array.from(to.y)).toEqual([-20, 20]);
  });

  it('scales about the middle of the box, by the side that reaches farthest from it', () => {
    const fit = new StreamFit({ x: Float64Array.of(0, 100), y: Float64Array.of(0, 100) });
    const to = out();
    // 150 to the right of the middle, 50 to the left: a third brings the right side in.
    fit.apply({ x: Float64Array.of(0, 200), y: Float64Array.of(50, 50) }, to);
    expect(fit.scale).toBeCloseTo(1 / 3, 12);
    expect(to.x[1]).toBeCloseTo(100, 9);
    expect(to.x[0]).toBeCloseTo(50 - 50 / 3, 9);
    expect(Array.from(to.y)).toEqual([50, 50]);
  });

  it('never zooms back in when the layout shrinks again', () => {
    const fit = new StreamFit(box);
    const to = out();
    fit.apply({ x: Float64Array.of(-100, 100), y: Float64Array.of(0, 0) }, to);
    expect(fit.scale).toBe(0.5);
    fit.apply({ x: Float64Array.of(-60, 60), y: Float64Array.of(0, 0) }, to);
    expect(fit.scale).toBe(0.5);
    expect(Array.from(to.x)).toEqual([-30, 30]);
  });

  it('leaves the scale alone for a box without an extent', () => {
    const fit = new StreamFit({ x: Float64Array.of(5, 5), y: Float64Array.of(1, 1) });
    const to = out();
    fit.apply({ x: Float64Array.of(-100, 100), y: Float64Array.of(-100, 100) }, to);
    expect(fit.scale).toBe(1);
    expect(Array.from(to.x)).toEqual([-100, 100]);
  });
});
