/**
 * `bar3d` hover (plan E14.9): the scene's GPU pick gives the bar under the pointer; the label sits
 * at the center of its top (its end, for negative heights) and shows, per `hoverinfo` (default
 * all), the position (`x: …`, `y: …`, categories by name), the height (`z: …`, the bar's own value,
 * not its stacked top), `base: …` for a bar that does not start at 0 (its `base`, or the top of the
 * bar below it in a stack), then
 * its `text`. `hovertemplate` gets `%{base}` and `%{top}` too, and events report them.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { resolveColorMapping, rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { SceneAxis } from '../scene/layout.ts';
import { sceneAxisHoverText, sceneHoverPoint, sceneHoverText, scenePicks } from '../scene/hover.ts';
import type { Bar3dCalc } from './calc.ts';
import { bar3dColorAt } from './plot.ts';

const ALL = ['x', 'y', 'z', 'base', 'text', 'name'];

/** The `hoverinfo` flags of a bar label. */
export function bar3dHoverFlags(info: unknown): Set<string> {
  const s = typeof info === 'string' && info !== '' ? info : 'all';
  return new Set(s === 'all' ? ALL : s.split('+'));
}

function perPoint(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

/** A z data value (a height or a base) as hover text, formatted like the z axis. */
export function bar3dValueText(axis: SceneAxis, v: number, format: unknown): string {
  if (!Number.isFinite(v)) return '';
  // Heights are differences: on a log axis they have no position to format as.
  if (axis.full['type'] === 'log') return String(v);
  return sceneAxisHoverText(axis, v, format);
}

/** The `bar3d` `hoverPoints`. */
export function bar3dHoverPoints(
  calc: Bar3dCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const pick = scenePicks(trace, query, ctx);
  const hit = pick?.hits[0];
  if (!pick || !hit) return [];
  const i = hit.pointIndex;
  if (!(i >= 0 && i < calc.count) || !Number.isFinite(calc.value[i]!)) return [];
  const az = pick.scene.layout.axes[2];
  const value = calc.value[i]!;
  const base = calc.bottom[i]!;
  const top = calc.top[i]!;
  const marker = (trace['marker'] ?? {}) as Record<string, unknown>;
  const rgba = bar3dColorAt(marker, i, resolveColorMapping(marker, ctx.fullLayout));
  const topL = calc.topL[i]!;
  const point = sceneHoverPoint(pick, trace, {
    pointIndex: i,
    x: calc.x[i]!,
    y: calc.y[i]!,
    z: Number.isFinite(topL) ? topL : calc.bottomL[i]!,
    color: rgbaToCss(rgba),
    fields: { base, top },
  });
  const labels = {
    ...(point.labels as { x: string; y: string; z: string }),
    z: bar3dValueText(az, value, trace['zhoverformat']),
    base: bar3dValueText(az, base, trace['zhoverformat']),
  };
  const input = trace._input ?? {};
  const flags = bar3dHoverFlags(perPoint(trace['hoverinfo'] ?? input['hoverinfo'], i));
  const extra = flags.has('base') && base !== 0 ? `base: ${labels.base}` : '';
  // Plotly: `hovertext || text` (an empty `hovertext` falls back to `text`).
  const text = perPoint(trace['hovertext'], i) || perPoint(trace['text'], i);
  return [
    {
      ...point,
      labels,
      hoverText: sceneHoverText(labels, flags, text, extra),
    },
  ];
}
