/**
 * `cone` hover (plan E14.5), after plotly.js `cone/convert.js` `handlePick` and `gl3d/scene.js`:
 * the scene's GPU pick gives the cone under the pointer; the label shows, per `hoverinfo` (default
 * `x+y+z+norm+text+name`), its position (`x: …`, `y: …`, `z: …`), then its vector (`u: …`, `v: …`,
 * `w: …`, formatted like the x / y / z axes or with `uhoverformat` / `vhoverformat` /
 * `whoverformat`), the norm (`norm: …`, 3 significant digits) and its `text`. `hovertemplate`
 * gets `%{u}`, `%{v}`, `%{w}` and `%{norm}`; events report `norm` too.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { mapColor, rgbaToCss } from '@mk7s/holochart-traces-basic';
import { sceneAxisHoverText, sceneHoverPoint, sceneHoverText, scenePicks } from '../scene/hover.ts';
import { traceColorMapping } from '../mesh3d/colors.ts';
import type { ConeCalc } from './calc.ts';

const ALL = ['x', 'y', 'z', 'u', 'v', 'w', 'norm', 'text', 'name'];

/** The `hoverinfo` flags of a cone label. */
export function coneHoverFlags(info: unknown): Set<string> {
  const s = typeof info === 'string' && info !== '' ? info : 'all';
  return new Set(s === 'all' ? ALL : s.split('+'));
}

function perPoint(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

/** The `cone` `hoverPoints`. */
export function coneHoverPoints(
  calc: ConeCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const pick = scenePicks(trace, query, ctx);
  const hit = pick?.hits[0];
  if (!pick || !hit) return [];
  const i = hit.pointIndex;
  if (!(i >= 0 && i < calc.count)) return [];
  const [ax, ay, az] = pick.scene.layout.axes;
  const u = calc.u[i]!;
  const v = calc.v[i]!;
  const w = calc.w[i]!;
  const norm = calc.norm[i]!;
  const labels = {
    u: sceneAxisHoverText(ax, u, trace['uhoverformat']),
    v: sceneAxisHoverText(ay, v, trace['vhoverformat']),
    w: sceneAxisHoverText(az, w, trace['whoverformat']),
    norm: Number.isFinite(norm) ? norm.toPrecision(3) : '',
  };
  const mapping = traceColorMapping(trace, ctx.fullLayout, [calc.normMin, calc.normMax]);
  const point = sceneHoverPoint(pick, trace, {
    pointIndex: i,
    x: calc.x[i]!,
    y: calc.y[i]!,
    z: calc.z[i]!,
    ...(mapping ? { color: rgbaToCss(mapColor(norm, mapping)) } : {}),
    fields: { u, v, w, norm },
  });
  // Plotly's line order: position, vector, norm, then the text.
  const input = trace._input ?? {};
  const flags = coneHoverFlags(perPoint(trace['hoverinfo'] ?? input['hoverinfo'], i));
  const extra: string[] = [];
  for (const k of ['u', 'v', 'w'] as const) if (flags.has(k)) extra.push(`${k}: ${labels[k]}`);
  if (flags.has('norm')) extra.push(`norm: ${labels.norm}`);
  // Plotly: `hovertext || text` (an empty `hovertext` falls back to `text`).
  const text = perPoint(trace['hovertext'], i) || perPoint(trace['text'], i);
  if (flags.has('text') && typeof text === 'string' && text !== '') extra.push(text);
  const position = point.labels as { x: string; y: string; z: string };
  return [
    {
      ...point,
      labels: { ...point.labels, ...labels },
      hoverText: sceneHoverText(position, flags, undefined, extra.join('<br>')),
    },
  ];
}
