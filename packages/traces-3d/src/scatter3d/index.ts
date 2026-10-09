/**
 * The `scatter3d` trace module (plan E14.2): markers, lines and text at `x`, `y`, `z` in a 3D scene
 * (see `scene/index.ts` for the scene contract it builds on and `plot.ts` for how it draws),
 * hovered through the scene's GPU picking (`scene/hover.ts`, E14.1d).
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { PickResult } from '@mk7s/holochart-render';
import type { HoverPoint, TraceModule } from '@mk7s/holochart-runtime';
import {
  coloraxisLayoutSchema,
  mapColor,
  markerColorbar,
  resolveColorMapping,
  rgbaToCss,
  scatter,
} from '@mk7s/holochart-traces-basic';
import { scenePicks, sceneHoverPoint, type ScenePicks } from '../scene/hover.ts';
import { lazyA11y, sceneKit } from '../a11y-loader.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { scatter3dAttributes } from './attributes.ts';
import { calcScatter3d, type Scatter3dCalc } from './calc.ts';
import { hasMarkers3d, supplyScatter3dDefaults } from './defaults.ts';
import { scatter3dRenderer } from './plot.ts';

type Container = Record<string, unknown>;

function at(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

/**
 * CSS color of point `i` (hover labels): the marker color (colorscale-mapped), else the line's.
 * @internal
 */
export function scatter3dPointColor(
  trace: FullTrace,
  i: number,
  fullLayout?: FullLayout,
): string | undefined {
  for (const key of hasMarkers3d(trace['mode']) ? ['marker', 'line'] : ['line']) {
    const c = trace[key] as Container | undefined;
    if (!c) continue;
    const v = at(c['color'], i);
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') {
      const mapping = resolveColorMapping(c, fullLayout);
      if (mapping) return rgbaToCss(mapColor(v, mapping));
    }
  }
  return undefined;
}

/**
 * The trace the legend draws: a line colored per point (`line.color` array) shows one color, the
 * middle of its colorscale (or its first CSS color).
 */
function legendTrace(trace: FullTrace, fullLayout: FullLayout | undefined): FullTrace {
  const line = trace['line'] as Container | undefined;
  const c = line?.['color'];
  if (!line || !(Array.isArray(c) || ArrayBuffer.isView(c))) return trace;
  const mapping = resolveColorMapping(line, fullLayout);
  const first = (c as ArrayLike<unknown>)[0];
  const color = mapping
    ? rgbaToCss(mapColor((mapping.cmin + mapping.cmax) / 2, mapping))
    : typeof first === 'string'
      ? first
      : undefined;
  return color ? ({ ...trace, line: { ...line, color } } as FullTrace) : trace;
}

/** The nearest hit, preferring markers over a line (screen, tube or ribbon) at the same distance. */
function bestHit(hits: readonly PickResult[]): PickResult {
  const first = hits[0]!;
  for (const h of hits) {
    if (h.distance > first.distance) break;
    if (!h.object?.name.startsWith('holochart:line3d')) return h;
  }
  return first;
}

/** The data point of a hit: tube and ribbon meshes map their vertices to points. */
function hitPoint(hit: PickResult): number {
  const map = hit.object?.userData['hcPointIndex'] as Int32Array | undefined;
  return map ? (map[hit.pointIndex] ?? -1) : hit.pointIndex;
}

/**
 * The hover point of data point `i` (`undefined` when it has no finite position): what GPU picking
 * found under the pointer, or a stop of keyboard navigation (`../a11y.ts`).
 * @internal
 */
export function scatter3dHoverPoint(
  pick: ScenePicks,
  calc: Scatter3dCalc,
  trace: FullTrace,
  i: number,
  fullLayout: FullLayout,
  distance?: number,
): HoverPoint | undefined {
  const x = calc.x[i]!;
  const y = calc.y[i]!;
  const z = calc.z[i]!;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
  const marker = (trace['marker'] ?? {}) as Container;
  const fields: Record<string, unknown> = {};
  for (const key of ['size', 'color', 'symbol'] as const) {
    const v = marker[key];
    if (Array.isArray(v) || ArrayBuffer.isView(v)) fields[`marker.${key}`] = at(v, i);
  }
  const color = scatter3dPointColor(trace, i, fullLayout);
  return sceneHoverPoint(pick, trace, {
    pointIndex: i,
    x,
    y,
    z,
    ...(distance === undefined ? {} : { distance }),
    ...(color ? { color } : {}),
    fields,
  });
}

function scatter3dHoverPoints(
  calc: Scatter3dCalc,
  trace: FullTrace,
  query: Parameters<NonNullable<TraceModule['hoverPoints']>>[2],
  ctx: Parameters<NonNullable<TraceModule['hoverPoints']>>[3],
): HoverPoint[] {
  const pick = scenePicks(trace, query, ctx);
  if (!pick) return [];
  const hit = bestHit(pick.hits);
  const i = hitPoint(hit);
  if (!(i >= 0 && i < calc.length)) return [];
  const point = scatter3dHoverPoint(pick, calc, trace, i, ctx.fullLayout, hit.distance);
  return point ? [point] : [];
}

export const scatter3d: TraceModule<Scatter3dCalc, typeof scatter3dAttributes.children> = {
  type: 'scatter3d',
  categories: ['gl3d', 'symbols', 'showLegend'],
  schema: scatter3dAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Markers, lines and text at x/y/z in a 3D scene, with colorscales, sprite or lit-sphere markers, 3D error bars, wall projections and a surface through the points; one GPU draw call per part whatever the point count.',
    docsPage: 'scatter3d',
    plotlyEquivalent: 'scatter3d',
  },
  animatable: ['x', 'y', 'z', 'marker.color', 'marker.size', 'line.color', 'line.width'],
  supplyDefaults: supplyScatter3dDefaults,
  // Color axes (`marker.coloraxis`): scatter's layout defaults collect their domains.
  ...(scatter.supplyLayoutDefaults ? { supplyLayoutDefaults: scatter.supplyLayoutDefaults } : {}),
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: calcScatter3d,
  plot: scatter3dRenderer,
  a11y: lazyA11y('scatter3d', scatter3dHoverPoint, ...sceneKit),
  hoverPoints: scatter3dHoverPoints,
  legendIcon: (trace, ctx) => scatter.legendIcon!(legendTrace(trace, ctx?.fullLayout), ctx),
  colorbar: (trace, ctx) =>
    markerColorbar(trace, ctx.fullLayout, 'marker') ??
    markerColorbar(trace, ctx.fullLayout, 'line'),
};

export { scatter3dAttributes, SCATTER3D_DASHES, SCATTER3D_SYMBOLS } from './attributes.ts';
export type { Scatter3dCalc } from './calc.ts';
