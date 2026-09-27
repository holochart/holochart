/**
 * Test helpers: defaulted financial figures, axes with real scales, and plot / hover contexts that
 * record the primitives a view adds.
 */
import {
  createBreakMap,
  createScale,
  supplyDefaults,
  type AxisType,
  type FullAxis,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  type DataTransform,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type HoverContext,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { vi } from 'vitest';
import { candlestick } from '../candlestick/index.ts';
import { ohlc } from '../ohlc/index.ts';
import type { PriceCalc } from '../shared/calc.ts';

export const registry = createChartRegistry().register(ohlc, candlestick);

export interface AxisSpec {
  type?: AxisType;
  categories?: string[];
  range?: [number, number];
  /** `rangebreaks` of the axis, as given in the layout. */
  rangebreaks?: Record<string, unknown>[];
}

/** An axis with a real scale, as the runtime builds it. */
export function axis(fullLayout: FullLayout, id: 'x' | 'y', spec: AxisSpec = {}): AxisInfo {
  const type = spec.type ?? 'linear';
  const breaks = spec.rangebreaks ? createBreakMap(spec.rangebreaks, type) : undefined;
  const scale = createScale({
    type,
    range: spec.range ?? [-5, 5],
    ...(spec.categories ? { categories: spec.categories } : {}),
    ...(breaks ? { breaks } : {}),
  });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type, scale, full } as unknown as AxisInfo;
}

/** Defaults of a figure of `ohlc` / `candlestick` traces (type `ohlc` unless given). */
export function figure(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'ohlc', ...t }));
  return supplyDefaults({ data: traces, layout }, registry.core, { onIssue: () => {} });
}

/** Defaults and calc of one trace. */
export function calcOf(
  trace: Record<string, unknown>,
  axes: { x?: AxisSpec; y?: AxisSpec } = {},
  layout: Record<string, unknown> = {},
) {
  const { fullData, fullLayout } = figure([trace], layout);
  const xaxis = axis(fullLayout, 'x', axes.x);
  const yaxis = axis(fullLayout, 'y', axes.y);
  const full = fullData[0]!;
  const ctx: CalcContext = { fullLayout, index: 0, xaxis, yaxis };
  const module = full.type === 'candlestick' ? candlestick : ohlc;
  const calc = module.calc!(full, ctx);
  return { fullData, fullLayout, trace: full, calc, xaxis, yaxis, ctx };
}

/** A hover context with a transform of `scale` px per unit on both axes. */
export function hoverCtx(
  s: { fullLayout: FullLayout; xaxis: AxisInfo; yaxis: AxisInfo },
  transform: Partial<DataTransform> = {},
): HoverContext {
  return {
    fullLayout: s.fullLayout,
    xaxis: s.xaxis,
    yaxis: s.yaxis,
    transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 10, ...transform },
  };
}

/** A plot context that records the primitives a view adds. */
export function plotCtx(
  trace: FullTrace,
  calc: PriceCalc,
  fullLayout: FullLayout,
  extra: Partial<TracePlotContext<PriceCalc>> = {},
): { ctx: TracePlotContext<PriceCalc>; added: Primitive<unknown>[] } {
  const added: Primitive<unknown>[] = [];
  const ctx: TracePlotContext<PriceCalc> = {
    trace,
    calc,
    index: 0,
    fullLayout,
    subplot: undefined,
    xaxis: undefined,
    yaxis: undefined,
    transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 10 },
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
    ...extra,
  };
  return { ctx, added };
}

/** A figure's daily OHLC rows, from `[open, high, low, close]` tuples starting at `start`. */
export function daily(
  rows: readonly (readonly [number, number, number, number])[],
  start = '2024-01-01',
): Record<string, unknown> {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return {
    x: rows.map((_, i) => new Date(t0 + i * 86_400_000).toISOString().slice(0, 10)),
    open: rows.map((r) => r[0]),
    high: rows.map((r) => r[1]),
    low: rows.map((r) => r[2]),
    close: rows.map((r) => r[3]),
  };
}
