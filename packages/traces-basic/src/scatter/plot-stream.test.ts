import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LinePrimitive,
  MarkerSet,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type TraceAppend,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import type { InstancedInterleavedBuffer, InterleavedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { calcScatter, type ScatterCalc } from './calc.ts';
import { calcScatterAppend } from './calc-stream.ts';
import { scatter } from './index.ts';

const registry = createChartRegistry().register(scatter);

function axisInfo(): AxisInfo {
  return {
    scale: createScale({ type: 'linear' }),
    type: 'linear',
    full: {},
  } as unknown as AxisInfo;
}

const calcCtx: CalcContext = {
  fullLayout: {} as never,
  index: 0,
  xaxis: axisInfo(),
  yaxis: axisInfo(),
};

function traceOf(input: Record<string, unknown>): FullTrace {
  return supplyDefaults({ data: [input], layout: {} }, registry.core).fullData[0]!;
}

function plotContext(trace: FullTrace, calc: ScatterCalc) {
  const added: Primitive<unknown>[] = [];
  const ctx: TracePlotContext<ScatterCalc> = {
    trace,
    calc,
    index: 0,
    fullLayout: {} as never,
    subplot: undefined,
    xaxis: calcCtx.xaxis,
    yaxis: calcCtx.yaxis,
    transform: { scaleX: 3, scaleY: 2, offsetX: 5, offsetY: 7 },
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

/** Drawn line vertices in data space (`NaN` for gap sentinels). */
function lineVertices(line: LinePrimitive): number[] {
  const { head, vertexCount, origin } = line.stream;
  const attr = line.object.geometry.getAttribute('aA') as InterleavedBufferAttribute;
  const p = (attr.data as InstancedInterleavedBuffer).array as Float32Array;
  const out: number[] = [];
  for (let v = head; v < head + vertexCount; v++) {
    if (p[v * 4 + 3]) out.push(p[v * 4]! + origin[0], p[v * 4 + 1]! + origin[1]);
    else out.push(NaN, NaN);
  }
  return out;
}

/** Visible marker instances, in draw order: data-space position, size, fill and style. */
function markerInstances(markers: MarkerSet): number[] {
  const p = markers.positionArray!;
  const o = markers.origin;
  const attr = (name: string) =>
    (markers.geometry.getAttribute(name) as { array: ArrayLike<number> } | undefined)?.array;
  const size = attr('aSize')!;
  const fill = attr('aFill');
  const value = attr('aValue');
  const style = attr('aStyle')!;
  // Colorscale values are stored relative to a per-set origin: compare the position on the
  // colorscale the shader computes.
  const range = markers.material.uniforms['uCRange']!.value as { x: number; y: number };
  const out: number[] = [];
  for (let i = 0; i < markers.count; i++) {
    if (p[i * 3]! >= 1e38) continue; // hidden
    out.push(p[i * 3]! + o[0], p[i * 3 + 1]! + o[1], size[i]!);
    if (fill) out.push(fill[i * 4]!, fill[i * 4 + 1]!, fill[i * 4 + 2]!, fill[i * 4 + 3]!);
    if (value) out.push((value[i]! - range.x) / (range.y - range.x));
    for (let k = 0; k < 4; k++) out.push(style[i * 4 + k]!);
  }
  return out;
}

function expectClose(a: number[], b: number[]): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    if (Number.isNaN(b[i])) expect(a[i]).toBeNaN();
    else expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-3);
  }
}

describe('scatter view streaming (E7.2)', () => {
  it.each(['linear', 'hv', 'spline'] as const)(
    'draws the same line and markers as a fresh view after appends and prepends (%s)',
    (shape) => {
      let x: number[] = Array.from({ length: 200 }, (_, i) => i);
      let y: number[] = x.map((v) => Math.round(Math.sin(v / 7) * 50));
      y[50] = NaN;
      // Per-point sizes and colors (sliced per patch) next to a single-color line.
      const input = () => ({
        mode: 'lines+markers',
        line: { shape, color: '#123456' },
        x,
        y,
        marker: {
          size: x.map((v) => 4 + (Math.abs(v) % 5)),
          color: shape === 'hv' ? x.map((v) => (v % 2 ? 'red' : 'blue')) : x.map((v) => v % 9),
          line: { width: 1, color: '#ffffff' },
        },
      });
      let trace = traceOf(input());
      let calc = calcScatter(trace, calcCtx);
      const { ctx, added } = plotContext(trace, calc);
      const view = scatter.plot!.create(ctx);
      let next = 200;
      let first = 0;
      for (let step = 0; step < 40; step++) {
        const prepend = step % 5 === 4;
        const count = 1 + (step % 7);
        const previous = x.length;
        let trimmed: number;
        if (prepend) {
          const nx = Array.from({ length: count }, (_, k) => first - count + k);
          first -= count;
          x = [...nx, ...x];
          y = [...nx.map((v) => (v % 13 === 0 ? NaN : Math.cos(v) * 40)), ...y];
          trimmed = Math.max(0, x.length - 220);
          x = x.slice(0, x.length - trimmed);
          y = y.slice(0, y.length - trimmed);
        } else {
          const nx = Array.from({ length: count }, (_, k) => next + k);
          next += count;
          x = [...x, ...nx];
          y = [...y, ...nx.map((v) => (v % 17 === 0 ? NaN : Math.cos(v) * 40))];
          trimmed = Math.max(0, x.length - 220);
          x = x.slice(trimmed);
          y = y.slice(trimmed);
        }
        const append: TraceAppend = {
          at: prepend ? 'start' : 'end',
          start: prepend ? 0 : x.length - count,
          count,
          trimmed,
          previous,
          length: x.length,
          keys: ['x', 'y', 'marker.size', 'marker.color'],
        };
        trace = traceOf(input());
        const c = calcScatterAppend(calc, trace, calcCtx, append);
        expect(c).toBeDefined();
        calc = c!;
        view.update(
          { ...ctx, trace, calc },
          { calc: true, plot: true, style: true, transform: false, append },
        );
      }
      const fresh = plotContext(trace, calcScatter(trace, calcCtx));
      scatter.plot!.create(fresh.ctx);
      const lineOf = (list: Primitive<unknown>[]) =>
        list.find((p) => p instanceof LinePrimitive) as LinePrimitive;
      const markersOf = (list: Primitive<unknown>[]) =>
        list.find((p) => p instanceof MarkerSet) as MarkerSet;
      expectClose(lineVertices(lineOf(added)), lineVertices(lineOf(fresh.added)));
      expectClose(markerInstances(markersOf(added)), markerInstances(markersOf(fresh.added)));
    },
  );
});
