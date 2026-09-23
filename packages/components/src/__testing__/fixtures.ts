/**
 * Test helpers (not exported from the package): defaulted layouts, axes laid out on a plot area
 * the way the runtime does it, and a deterministic text measure.
 */
import {
  attr,
  createRegistry,
  createScale,
  supplyDefaults,
  type AxisType,
  type ComponentModule,
  type FullAxis,
  type FullLayout,
  type FullTrace,
  type Registry,
  type TraceModule,
} from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { AxisLike } from '../axes/geometry.ts';
import type { SubplotLike } from '../axes/placement.ts';
import type { MeasureLine } from '../shared/text.ts';

/** Every character is `0.5 em` wide: easy to reason about in assertions. */
export const measure: MeasureLine = (line, font) => line.length * font.size * 0.5;

/** A minimal cartesian trace module (enough for supply-defaults and legend entries). */
export function fakeTraceModule(extra: Partial<TraceModule> = {}): TraceModule {
  return {
    type: 'fake',
    categories: ['cartesian', 'showLegend'],
    schema: attr.object({
      x: attr.any(),
      y: attr.any(),
      mode: attr.any(),
      marker: attr.any(),
      line: attr.any(),
      legendrank: attr.any(),
    }),
    supplyDefaults(traceIn, traceOut) {
      for (const key of ['x', 'y', 'mode', 'marker', 'line']) {
        if (traceIn[key] !== undefined) traceOut[key] = traceIn[key];
      }
    },
    meta: { description: 'test' },
    ...extra,
  };
}

/** Registry with the fake trace type and the given components. */
export function testRegistry(
  components: readonly ComponentModule[] = [],
  trace: TraceModule = fakeTraceModule(),
): Registry {
  const registry = createRegistry().register(trace);
  for (const c of components) registry.registerComponent(c);
  return registry;
}

/** Defaulted layout (and data) for a figure. */
export function defaults(
  layout: Record<string, unknown> = {},
  data: Record<string, unknown>[] = [],
  registry: Registry = testRegistry(),
): { fullLayout: FullLayout; fullData: FullTrace[] } {
  const typed = data.map((d) => ({ type: 'fake', ...d }));
  const { fullLayout, fullData } = supplyDefaults({ data: typed, layout }, registry, {
    onIssue: () => undefined,
  });
  return { fullLayout, fullData };
}

/** A laid-out axis (as the runtime's `AxisInfo`), on `area`. */
export function layoutAxis(
  full: FullAxis,
  area: Readonly<ViewportRect>,
  range: readonly [number, number],
  options: { type?: AxisType; categories?: readonly string[] } = {},
): AxisLike {
  const letter: 'x' | 'y' = full._id.startsWith('y') ? 'y' : 'x';
  const d = full.domain as readonly number[];
  const d0 = d[0] ?? 0;
  const d1 = d[1] ?? 1;
  const start =
    letter === 'x'
      ? Math.round(area.x + d0 * area.width)
      : Math.round(area.y + (1 - d0) * area.height);
  const end =
    letter === 'x'
      ? Math.round(area.x + d1 * area.width)
      : Math.round(area.y + (1 - d1) * area.height);
  const type = options.type ?? (full.type === '-' ? 'linear' : (full.type as AxisType));
  const scale = createScale({
    type,
    range,
    length: Math.abs(end - start),
    ...(options.categories ? { categories: options.categories } : {}),
  });
  return {
    id: full._id,
    letter,
    type,
    full,
    scale,
    start,
    end,
    l2c: (l) => (letter === 'x' ? start + scale.l2p(l) : start - scale.l2p(l)),
  };
}

/** Axes map and subplots for a defaulted layout, on `area`, with the given ranges. */
export function layoutAxes(
  fullLayout: FullLayout,
  area: Readonly<ViewportRect>,
  ranges: Readonly<Record<string, readonly [number, number]>> = {},
  options: Readonly<Record<string, { type?: AxisType; categories?: readonly string[] }>> = {},
): { axes: Map<string, AxisLike>; subplots: Map<string, SubplotLike> } {
  const axes = new Map<string, AxisLike>();
  for (const id of [...fullLayout._subplots.xaxis, ...fullLayout._subplots.yaxis]) {
    const name = `${id.charAt(0)}axis${id.slice(1)}`;
    const full = fullLayout[name] as FullAxis;
    axes.set(id, layoutAxis(full, area, ranges[id] ?? [0, 10], options[id]));
  }
  const subplots = new Map<string, SubplotLike>();
  for (const id of fullLayout._subplots.cartesian) {
    const m = /^(x\d*)(y\d*)$/.exec(id);
    const xa = m && axes.get(m[1] as string);
    const ya = m && axes.get(m[2] as string);
    if (!xa || !ya) continue;
    subplots.set(id, {
      id,
      xaxis: xa,
      yaxis: ya,
      rect: { x: xa.start, y: ya.end, width: xa.end - xa.start, height: ya.start - ya.end },
    });
  }
  return { axes, subplots };
}
