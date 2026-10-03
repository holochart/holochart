/**
 * 3D hover for trace modules (plan E14.1d), after plotly.js `gl3d/scene.js` (hover and click) and
 * `fx/hover.js` (`loneHover` label text): the pieces every 3D trace's `hoverPoints` uses.
 *
 * ```ts
 * hoverPoints(calc, trace, query, ctx) {
 *   const pick = scenePicks(trace, query, ctx); // this trace's GPU hits under the pointer
 *   if (!pick) return [];
 *   const i = pick.hits[0]!.pointIndex;
 *   return [sceneHoverPoint(pick, trace, { pointIndex: i, x: calc.x[i], y: calc.y[i], z: calc.z[i] })];
 * }
 * ```
 *
 * 3D hover is `closest` only (Plotly): the runtime asks 3D traces like domain traces, with the
 * pointer in container px, and keeps the nearest point. {@link sceneHoverPoint} anchors the label at
 * the point's projection, formats `x`, `y` and `z` per scene axis (`hoverformat`, or the trace's
 * `xhoverformat` / `yhoverformat` / `zhoverformat`; dates and categories as on the axes) for the
 * label (`x: …<br>y: …<br>z: …`, per `hoverinfo`) and for `hovertemplate` (`%{x}`, `%{y}`, `%{z}`),
 * reports `x`, `y`, `z` in hover and click events, and records the point's world position for
 * the scene's spikes.
 */
import {
  formatValue,
  isArrayLike,
  type FullAxis,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type { PickResult } from '@mk7s/holochart-render';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import type { Vec3 } from './camera.ts';
import type { SceneAxis } from './layout.ts';
import { scenePicking } from './pick.ts';
import { sceneFor, type Scene3D } from './scene.ts';

type Container = Record<string, unknown>;

/** A trace's GPU hits under the pointer (see {@link scenePicks}). @internal */
export interface ScenePicks {
  readonly scene: Scene3D;
  /** This trace's hits within the pick radius, nearest first (`pointIndex` per pickable). */
  readonly hits: readonly PickResult[];
  readonly query: HoverQuery;
}

/**
 * The hits of `trace` under the pointer, or `undefined` when there are none, the pointer is not
 * over the trace's scene, or the scene's `hovermode` is `false`.
 * @internal
 */
export function scenePicks(
  trace: FullTrace,
  query: HoverQuery,
  ctx: Pick<HoverContext, 'fullLayout'>,
): ScenePicks | undefined {
  const { cx, cy } = query;
  if (cx === undefined || cy === undefined) return undefined;
  const scene = sceneFor(ctx.fullLayout, trace);
  if (!scene || !scene.viewport.contains(cx, cy)) return undefined;
  if ((ctx.fullLayout[scene.id] as Container | undefined)?.['hovermode'] === false) {
    return undefined;
  }
  const all = scenePicking(scene).hits(cx, cy);
  let hits: PickResult[] | undefined;
  for (const h of all) if (h.traceIndex === trace._index) (hits ??= []).push(h);
  return hits ? { scene, hits, query } : undefined;
}

/** What a 3D trace reports for its hovered point (see {@link sceneHoverPoint}). @internal */
export interface SceneHoverSpec {
  readonly pointIndex: number;
  /** Linear coordinates of the hovered position (label anchor, spikes, labels). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * Data values for events and templates. Default: the trace's `x` / `y` / `z` at `pointIndex`
   * (or `cell`: `z[row][column]` for grid traces).
   */
  readonly values?: { readonly x?: unknown; readonly y?: unknown; readonly z?: unknown };
  /** Px from the pointer; default the nearest hit's. */
  readonly distance?: number;
  /** Label color (the point's color, CSS). */
  readonly color?: string;
  /** `[row, column]` of a grid point (surface). */
  readonly cell?: readonly [number, number];
  /** More `hovertemplate` fields (and event fields), e.g. `{ 'marker.size': 8 }`. */
  readonly fields?: Readonly<Record<string, unknown>>;
  /** Lines added after `x` / `y` / `z` and `text` (a cone's `u`, `v`, `w`, `norm`). */
  readonly extraText?: string;
}

/** A value of `trace[key]` at point `i` (arrays per point, else the value), or `undefined`. */
function perPoint(v: unknown, i: number, cell?: readonly [number, number]): unknown {
  if (!isArrayLike(v)) return v;
  if (cell) {
    const row = (v as ArrayLike<unknown>)[cell[0]];
    return isArrayLike(row) ? (row as ArrayLike<unknown>)[cell[1]] : undefined;
  }
  return (v as ArrayLike<unknown>)[i];
}

/**
 * A scene axis value as hover text: the axis' `hoverformat` or `format`, dates and categories.
 * @internal
 */
export function sceneAxisHoverText(axis: SceneAxis, l: number, format?: unknown): string {
  if (!Number.isFinite(l)) return '';
  const full =
    typeof format === 'string' && format !== '' ? { ...axis.full, hoverformat: format } : axis.full;
  try {
    return formatValue(axis.scale, full as unknown as FullAxis, l, true);
  } catch {
    return String(l);
  }
}

/** The `hoverinfo` flags of a point (`'all'` → x, y, z, text, name). */
function hoverFlags(info: unknown): Set<string> {
  const s = typeof info === 'string' && info !== '' ? info : 'all';
  return new Set(s === 'all' ? ['x', 'y', 'z', 'text', 'name'] : s.split('+'));
}

/**
 * The label text of a 3D point without `hovertemplate` (Plotly's `loneHover` for gl3d): `x: …`,
 * `y: …`, `z: …` lines for the flags `hoverinfo` sets (`(x, y)` when `z` is off), then the
 * point's `text`, then `extra` lines.
 * @internal
 */
export function sceneHoverText(
  labels: { readonly x: string; readonly y: string; readonly z: string },
  flags: ReadonlySet<string>,
  text: unknown,
  extra?: string,
): string {
  const x = flags.has('x') ? labels.x : undefined;
  const y = flags.has('y') ? labels.y : undefined;
  const lines: string[] = [];
  if (flags.has('z')) {
    if (x !== undefined) lines.push(`x: ${x}`);
    if (y !== undefined) lines.push(`y: ${y}`);
    lines.push(lines.length > 0 ? `z: ${labels.z}` : labels.z);
  } else if (x !== undefined && y !== undefined) lines.push(`(${x}, ${y})`);
  else if (x !== undefined) lines.push(x);
  else if (y !== undefined) lines.push(y);
  if (flags.has('text') && text !== undefined && text !== null && text !== '') {
    lines.push(String(text));
  }
  if (extra) lines.push(extra);
  return lines.join('<br>');
}

/**
 * The runtime hover point of a 3D trace's hovered position: the label anchored at its
 * projection (overlay px), `x` / `y` / `z` values and labels, the label text per `hoverinfo`,
 * and the spikes' world position recorded for the scene component.
 * @internal
 */
export function sceneHoverPoint(
  pick: ScenePicks,
  trace: FullTrace,
  spec: SceneHoverSpec,
): HoverPoint {
  const { scene, query } = pick;
  const i = spec.pointIndex;
  const world = scene.toWorld(spec.x, spec.y, spec.z);
  const s = scene.project(world[0], world[1], world[2]);
  const [ax, ay, az] = scene.layout.axes;
  const labels = {
    x: sceneAxisHoverText(ax, spec.x, trace['xhoverformat']),
    y: sceneAxisHoverText(ay, spec.y, trace['yhoverformat']),
    z: sceneAxisHoverText(az, spec.z, trace['zhoverformat']),
  };
  const v = spec.values ?? {};
  const x = 'x' in v ? v.x : perPoint(trace['x'], i, spec.cell);
  const y = 'y' in v ? v.y : perPoint(trace['y'], i, spec.cell);
  const z = 'z' in v ? v.z : perPoint(trace['z'], i, spec.cell);
  const input = trace._input ?? {};
  const given = (v: unknown): unknown => (v === '' || v === null ? undefined : v);
  const text =
    given(perPoint(trace['hovertext'] ?? input['hovertext'], i, spec.cell)) ??
    given(perPoint(trace['text'], i, spec.cell));
  const info = perPoint(trace['hoverinfo'] ?? input['hoverinfo'], i, spec.cell);
  const hoverText = sceneHoverText(labels, hoverFlags(info), text, spec.extraText);
  scenePicking(scene).hovered.set(`${trace._index}:${i}`, world);
  const cx = query.cx ?? 0;
  const cy = query.cy ?? 0;
  return {
    pointIndex: i,
    ...(spec.cell ? { cell: spec.cell } : {}),
    distance: spec.distance ?? pick.hits[0]?.distance ?? 0,
    // Overlay px (bottom-left origin), from the query's own offset between the two spaces.
    px: query.px + (s.x - cx),
    py: query.py - (s.y - cy),
    x,
    y,
    ...(typeof text === 'string' ? { text } : {}),
    ...(spec.color ? { color: spec.color } : {}),
    fields: { ...spec.fields, z },
    labels,
    // `hoverinfo` without the name flag, or only the name: the runtime handles `none` / `skip`.
    hoverText,
    // The name box repeats nothing: always the trace name when `name` is on (Plotly).
    showName: true,
  };
}

/** The world position hover recorded for point `pointIndex` of trace `traceIndex` (spikes). */
export function sceneHoveredPosition(
  fullLayout: FullLayout,
  trace: FullTrace,
  pointIndex: number,
): { scene: Scene3D; world: Vec3 } | undefined {
  const scene = sceneFor(fullLayout, trace);
  const world = scene && scenePicking(scene).hovered.get(`${trace._index}:${pointIndex}`);
  return scene && world ? { scene, world } : undefined;
}
