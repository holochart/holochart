/**
 * Test helpers for the bar-like and pie-like financial traces (`waterfall`, `funnel`,
 * `funnelarea`): defaulted figures, calcs on axes with real scales, cross-trace passes, and plot
 * contexts that record the primitives a view adds.
 */
import { supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
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
  type CrossTraceContext,
  type SubplotInfo,
  type TraceModule,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { bar, scatter } from '@mk7s/holochart-traces-basic';
import { vi } from 'vitest';
import { funnel } from '../funnel/index.ts';
import { funnelarea } from '../funnelarea/index.ts';
import { waterfall } from '../waterfall/index.ts';
import { axis, type AxisSpec } from './figure.ts';

export const registry = createChartRegistry().register(waterfall, funnel, funnelarea, bar, scatter);

/** Defaults of a figure (traces are `waterfall` unless they say otherwise). */
export function figure(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'waterfall', ...t }));
  return supplyDefaults({ data: traces, layout }, registry.core, { onIssue: () => {} });
}

/** Axis specs of a calc: categories by default on the position axis. */
export interface Axes {
  x?: AxisSpec;
  y?: AxisSpec;
}

/** Defaults and calc of every trace of a figure, then the cross-trace pass of each type. */
export function calcAll(
  data: Record<string, unknown>[],
  axes: Axes = {},
  layout: Record<string, unknown> = {},
) {
  const { fullData, fullLayout } = figure(data, layout);
  const xaxis = axis(fullLayout, 'x', axes.x);
  const yaxis = axis(fullLayout, 'y', axes.y);
  const calcs: unknown[] = fullData.map((trace, index) => {
    const module = registry.core.getModule(trace.type) as
      { calc?: TraceModule['calc'] } | undefined;
    const ctx: CalcContext = { fullLayout, index, xaxis, yaxis };
    return trace.visible === true ? module?.calc?.(trace, ctx) : undefined;
  });
  const cross: CrossTraceContext = {
    fullLayout,
    subplot: { id: 'xy' } as SubplotInfo,
    xaxis,
    yaxis,
  };
  for (const module of [waterfall, funnel] as const) {
    const entries = fullData
      .map((trace, index) => ({ trace, index, calc: calcs[index] }))
      .filter((e) => e.trace.type === module.type && e.calc !== undefined);
    if (entries.length > 0) module.crossTraceCalc!(entries as never, cross);
  }
  return { fullData, fullLayout, calcs, xaxis, yaxis };
}

/** Defaults and calc of one trace (after its cross-trace pass). */
export function calcOne(
  trace: Record<string, unknown>,
  axes: Axes = {},
  layout: Record<string, unknown> = {},
) {
  const r = calcAll([trace], axes, layout);
  return { ...r, trace: r.fullData[0]!, calc: r.calcs[0]! };
}

/** A category axis spec for positions `names`, spanning them. */
export function categories(names: string[]): AxisSpec {
  return { type: 'category', categories: names, range: [-0.5, names.length - 0.5] };
}

/** A plot context that records the primitives a view adds. */
export function plotCtx<C>(
  trace: FullTrace,
  calc: C,
  fullLayout: FullLayout,
  extra: Partial<TracePlotContext<C>> = {},
): { ctx: TracePlotContext<C>; added: Primitive<unknown>[] } {
  const added: Primitive<unknown>[] = [];
  const ctx: TracePlotContext<C> = {
    trace,
    calc,
    index: 0,
    fullLayout,
    subplot: undefined,
    xaxis: undefined,
    yaxis: undefined,
    transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 10 },
    viewport: { size: { width: 600, height: 400 } } as unknown as Viewport,
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

/** A hover context of `axes` with `scale` px per unit on both axes. */
export function hoverCtx(
  s: { fullLayout: FullLayout; xaxis: AxisInfo; yaxis: AxisInfo },
  transform: Partial<DataTransform> = {},
) {
  return {
    fullLayout: s.fullLayout,
    xaxis: s.xaxis,
    yaxis: s.yaxis,
    transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 10, ...transform },
  };
}
