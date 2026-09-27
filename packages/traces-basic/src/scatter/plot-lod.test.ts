import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LinePrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type TraceAppend,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { calcScatter, type ScatterCalc } from './calc.ts';
import { calcScatterAppend } from './calc-stream.ts';
import { scatter } from './index.ts';
import { LOD_MIN_POINTS } from './plot.ts';

const registry = createChartRegistry().register(scatter);
const TRANSFORM_ONLY: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: true };
const N = 200_000;
const WIDTH = 800;

function axis(range: [number, number]): AxisInfo {
  const scale = createScale({ type: 'linear' });
  scale.setRange(range[0], range[1]);
  return { scale, type: 'linear', full: {} } as unknown as AxisInfo;
}

const calcCtx: CalcContext = {
  fullLayout: {} as never,
  index: 0,
  xaxis: axis([0, 1]),
  yaxis: axis([0, 1]),
};

function traceOf(input: Record<string, unknown>): FullTrace {
  return supplyDefaults({ data: [input], layout: {} }, registry.core).fullData[0]!;
}

/** A plot context showing x in `range` on {@link WIDTH} px. */
function plotContext(trace: FullTrace, calc: ScatterCalc, range: [number, number]) {
  const added: Primitive<unknown>[] = [];
  const scaleX = WIDTH / (range[1] - range[0]);
  const ctx: TracePlotContext<ScatterCalc> = {
    trace,
    calc,
    index: 0,
    fullLayout: {} as never,
    subplot: undefined,
    xaxis: axis(range),
    yaxis: axis([-1, 1]),
    transform: { scaleX, scaleY: 100, offsetX: -range[0] * scaleX, offsetY: 200 },
    viewport: {} as Viewport,
    primitives: { resources: createResourceManager(), invalidate: vi.fn() },
    add: (p) => {
      added.push(p as Primitive<unknown>);
      return p;
    },
    remove: (p) => {
      added.splice(added.indexOf(p as Primitive<unknown>), 1);
      p.dispose();
    },
    invalidate: vi.fn(),
  };
  return { ctx, added };
}

function input(n: number, start = 0, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const x = Float64Array.from({ length: n }, (_, i) => start + i);
  const y = Float64Array.from(x, (v) => Math.sin(v / 50) + Math.sin(v * 1.7) * 0.3);
  return { mode: 'lines', x, y, ...extra };
}

/** x of the first and last drawn line vertex (gap sentinels skipped). */
function ends(line: LinePrimitive): [number, number] {
  const { head, vertexCount, origin } = line.stream;
  const p = (
    line.object.geometry.getAttribute('aA') as unknown as { data: { array: Float32Array } }
  ).data.array;
  const xs: number[] = [];
  for (let v = head; v < head + vertexCount; v++) if (p[v * 4 + 3]) xs.push(p[v * 4]! + origin[0]);
  return [xs[0]!, xs[xs.length - 1]!];
}

const lineOf = (list: Primitive<unknown>[]) =>
  list.find((p) => p instanceof LinePrimitive) as LinePrimitive & { ready?: Promise<void> };

describe('scatter view level of detail (E16.2)', () => {
  it('draws a big line through the pyramid once its code has loaded', async () => {
    expect(N).toBeGreaterThanOrEqual(LOD_MIN_POINTS);
    const trace = traceOf(input(N));
    const calc = calcScatter(trace, calcCtx);
    const { ctx, added } = plotContext(trace, calc, [0, N]);
    const view = scatter.plot!.create(ctx);
    const line = lineOf(added);
    await line.ready;
    expect(ctx.invalidate).toHaveBeenCalled();
    // ≤ 4 points per px column (plus the line primitive's end sentinels).
    expect(line.stream.vertexCount).toBeLessThanOrEqual(4 * WIDTH + 16);
    expect(line.stream.vertexCount).toBeGreaterThan(WIDTH);

    // A pan within the drawn window only moves the transform.
    const update = vi.spyOn(line, 'update');
    const panned = plotContext(trace, calc, [N / 20, N / 20 + N]).ctx;
    view.update({ ...panned, add: ctx.add, remove: ctx.remove }, TRANSFORM_ONLY);
    expect(update).not.toHaveBeenCalled();

    // Zooming in 16× re-reads the window at the new resolution: still a few vertices per px.
    const zoomed = plotContext(trace, calc, [N / 2, N / 2 + N / 16]).ctx;
    view.update({ ...zoomed, add: ctx.add, remove: ctx.remove }, TRANSFORM_ONLY);
    expect(update).toHaveBeenCalledTimes(1);
    expect(line.stream.vertexCount).toBeLessThanOrEqual(3 * 4 * WIDTH + 16);
  });

  it('draws step shapes through the decimated points', async () => {
    const trace = traceOf(input(N, 0, { line: { shape: 'hv' } }));
    const { ctx, added } = plotContext(trace, calcScatter(trace, calcCtx), [0, N]);
    scatter.plot!.create(ctx);
    const line = lineOf(added);
    await line.ready;
    // A step (two vertices) per decimated point.
    expect(line.stream.vertexCount).toBeLessThanOrEqual(2 * 4 * WIDTH + 16);
    expect(ends(line)).toEqual([0, N - 1]);
  });

  it('draws small, dashed and decreasing lines without it', async () => {
    const cases = [
      input(1000),
      input(N, 0, { line: { dash: 'dot' } }),
      input(N, 0, { line: { simplify: false } }),
      { ...input(N), x: Float64Array.from({ length: N }, (_, i) => (i === 5 ? -1 : i)) },
    ];
    for (const data of cases) {
      const trace = traceOf(data);
      const { ctx, added } = plotContext(trace, calcScatter(trace, calcCtx), [0, N]);
      scatter.plot!.create(ctx);
      const line = lineOf(added);
      await line.ready;
      // Not windowed: the path spans every point (decimated or not, it reaches the last one).
      const xs = data['x'] as Float64Array;
      expect(ends(line)).toEqual([xs[0], xs[xs.length - 1]]);
    }
  });

  it('keeps drawing through the pyramid while points stream in', async () => {
    let trace = traceOf(input(N));
    let calc = calcScatter(trace, calcCtx);
    const { ctx, added } = plotContext(trace, calc, [0, N]);
    const view = scatter.plot!.create(ctx);
    await lineOf(added).ready;
    let start = 0;
    for (let step = 0; step < 3; step++) {
      const count = 5000;
      start += count;
      const next = input(N, start);
      const append: TraceAppend = {
        at: 'end',
        start: N - count,
        count,
        trimmed: count,
        previous: N,
        length: N,
        keys: ['x', 'y'],
      };
      trace = traceOf(next);
      calc = calcScatterAppend(calc, trace, calcCtx, append)!;
      const range: [number, number] = [start, start + N];
      const { ctx: c } = plotContext(trace, calc, range);
      view.update(
        { ...c, add: ctx.add, remove: ctx.remove },
        { calc: true, plot: true, style: true, transform: true, append },
      );
    }
    const line = lineOf(added);
    expect(line.stream.vertexCount).toBeLessThanOrEqual(4 * WIDTH + 16);
    // The line reaches the newest point.
    expect(ends(line)).toEqual([start, start + N - 1]);
  });
});
