/**
 * `streamtube` hover (plan E14.6), after plotly.js `streamtube/convert.js` `handlePick` and
 * `gl3d/scene.js`: the scene's GPU pick gives a tube vertex under the pointer; its sample, or the
 * neighbouring sample of the same tube whose center projects nearest to the pointer, is the
 * hovered point. The label shows, per `hoverinfo` (default `x+y+z+norm+text+name`), the sample's
 * position (`x: …`, `y: …`, `z: …`), then the field's vector there (`u: …`, `v: …`, `w: …`,
 * formatted like the x / y / z axes or with `uhoverformat` / `vhoverformat` / `whoverformat`),
 * its `norm` and the `divergence` (3 significant digits) and the trace's `text` (`hovertext`
 * first). `hovertemplate` gets Plotly's `%{tubex}`, `%{tubey}`, `%{tubez}`, `%{tubeu}`,
 * `%{tubev}`, `%{tubew}`, `%{norm}`, `%{divergence}` (and `%{u}`, `%{v}`, `%{w}`); events report
 * them too.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { mapColor, rgbaToCss } from '@mk7s/holochart-traces-basic';
import { traceColorMapping } from '../mesh3d/colors.ts';
import { sceneAxisHoverText, sceneHoverPoint, sceneHoverText, scenePicks } from '../scene/hover.ts';
import type { Scene3D } from '../scene/scene.ts';
import type { StreamtubeCalc } from './calc.ts';
import { TUBE_FACETS } from './tube.ts';

const ALL = ['x', 'y', 'z', 'u', 'v', 'w', 'norm', 'divergence', 'text', 'name'];

/** The `hoverinfo` flags of a stream tube label. */
export function streamtubeHoverFlags(info: unknown): Set<string> {
  const s = typeof info === 'string' && info !== '' ? info : 'all';
  return new Set(s === 'all' ? ALL : s.split('+'));
}

/**
 * The hovered sample from a picked vertex: of the vertex's sample and its neighbours on the same
 * tube, the one whose center projects nearest to the pointer (container px).
 */
export function nearestSample(
  calc: StreamtubeCalc,
  vertex: number,
  project: (i: number) => { x: number; y: number },
  cx: number,
  cy: number,
): number {
  const i = Math.floor(vertex / TUBE_FACETS);
  if (!(i >= 0 && i < calc.count)) return -1;
  let best = i;
  let bestDist = Infinity;
  for (const j of [i - 1, i, i + 1]) {
    if (j < 0 || j >= calc.count || calc.tube[j] !== calc.tube[i]) continue;
    const s = project(j);
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (d < bestDist) [best, bestDist] = [j, d];
  }
  return best;
}

function screen(scene: Scene3D, calc: StreamtubeCalc, i: number) {
  const w = scene.toWorld(calc.x[i]!, calc.y[i]!, calc.z[i]!);
  return scene.project(w[0], w[1], w[2]);
}

/** The `streamtube` `hoverPoints`. */
export function streamtubeHoverPoints(
  calc: StreamtubeCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const pick = scenePicks(trace, query, ctx);
  const hit = pick?.hits[0];
  if (!pick || !hit) return [];
  const scene = pick.scene;
  const i = nearestSample(
    calc,
    hit.pointIndex,
    (j) => screen(scene, calc, j),
    query.cx ?? 0,
    query.cy ?? 0,
  );
  if (i < 0) return [];
  const [ax, ay, az] = scene.layout.axes;
  const u = calc.u[i]!;
  const v = calc.v[i]!;
  const w = calc.w[i]!;
  const norm = calc.norm[i]!;
  const divergence = calc.divergence[i]!;
  const precision = (n: number) => (Number.isFinite(n) ? n.toPrecision(3) : '');
  const labels = {
    u: sceneAxisHoverText(ax, u, trace['uhoverformat']),
    v: sceneAxisHoverText(ay, v, trace['vhoverformat']),
    w: sceneAxisHoverText(az, w, trace['whoverformat']),
    norm: precision(norm),
    divergence: precision(divergence),
  };
  const values = {
    x: ax.scale.l2d(calc.x[i]!),
    y: ay.scale.l2d(calc.y[i]!),
    z: az.scale.l2d(calc.z[i]!),
  };
  const mapping = traceColorMapping(trace, ctx.fullLayout, [calc.normMin, calc.normMax]);
  const point = sceneHoverPoint(pick, trace, {
    pointIndex: i,
    x: calc.x[i]!,
    y: calc.y[i]!,
    z: calc.z[i]!,
    values,
    ...(mapping ? { color: rgbaToCss(mapColor(norm, mapping)) } : {}),
    fields: {
      tubex: values.x,
      tubey: values.y,
      tubez: values.z,
      tubeu: u,
      tubev: v,
      tubew: w,
      u,
      v,
      w,
      norm,
      divergence,
    },
  });
  // Plotly's line order: position, vector, norm, divergence, then the text.
  const input = trace._input ?? {};
  const flags = streamtubeHoverFlags(trace['hoverinfo'] ?? input['hoverinfo']);
  const extra: string[] = [];
  for (const k of ['u', 'v', 'w', 'norm', 'divergence'] as const) {
    if (flags.has(k)) extra.push(`${k}: ${labels[k]}`);
  }
  // Plotly: `hovertext || text` (single strings).
  const text = trace['hovertext'] || trace['text'];
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
