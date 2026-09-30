/**
 * `mesh3d` hover (plan E14.4), after plotly.js `mesh3d/convert.js` `handlePick`: the GPU pick of
 * the scene (`scene/hover.ts`) gives the triangle (or a vertex of it) under the pointer. With
 * per-vertex colors the label shows the triangle's vertex nearest to the pointer (its `x`, `y`,
 * `z` and `text`); with per-triangle colors (`intensitymode: 'cell'`, `facecolor`) the triangle's
 * centroid (in data coordinates: Plotly shows it in its internal scaled units) and the triangle's
 * `text`. The intensity at the hovered point is `%{intensity}` in `hovertemplate` (Plotly's
 * default label doesn't show it).
 *
 * The hover contour (`contour.show`) is the level set, through the mesh, of the intensity (of z
 * without vertex intensity) at the hovered point: {@link isoSegments}.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { sceneHoverPoint, sceneHoverText, scenePicks } from '../scene/hover.ts';
import type { Scene3D } from '../scene/scene.ts';
import type { Mesh3dCalc } from './calc.ts';
import { numbersOf } from './colors.ts';

/** Whether the trace is colored per triangle (the mesh then picks triangles). */
export function cellColored(trace: Readonly<Record<string, unknown>>): boolean {
  if (trace['intensity'] !== undefined) return trace['intensitymode'] === 'cell';
  return trace['vertexcolor'] === undefined && trace['facecolor'] !== undefined;
}

/** The label color of a mesh (Plotly's `this.color`). */
export function meshHoverColor(trace: Readonly<Record<string, unknown>>): string | undefined {
  if (trace['intensity'] !== undefined) return '#fff';
  const first = (v: unknown) => (Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined);
  if (trace['vertexcolor'] !== undefined) return first(trace['vertexcolor']);
  if (trace['facecolor'] !== undefined) return first(trace['facecolor']);
  return typeof trace['color'] === 'string' ? trace['color'] : undefined;
}

/** Triangles around each vertex (CSR), built once per calc. */
const AROUND = new WeakMap<Mesh3dCalc, { start: Uint32Array; list: Uint32Array }>();

function trianglesAround(calc: Mesh3dCalc): { start: Uint32Array; list: Uint32Array } {
  let hit = AROUND.get(calc);
  if (hit) return hit;
  const t = calc.triangles;
  const start = new Uint32Array(calc.count + 1);
  for (let k = 0; k < t.length; k++) start[t[k]! + 1]!++;
  for (let i = 0; i < calc.count; i++) start[i + 1]! += start[i]!;
  const fill = start.slice(0, calc.count);
  const list = new Uint32Array(t.length);
  for (let k = 0; k < t.length; k++) list[fill[t[k]!]!++] = Math.floor(k / 3);
  hit = { start, list };
  AROUND.set(calc, hit);
  return hit;
}

/** Screen position (container px) and NDC depth of vertex `i`. */
function screen(scene: Scene3D, calc: Mesh3dCalc, i: number) {
  const w = scene.toWorld(calc.x[i]!, calc.y[i]!, calc.z[i]!);
  return scene.project(w[0], w[1], w[2]);
}

/**
 * The hovered vertex: of the triangles `candidates`, those containing the pointer on screen
 * (else all of them), the vertex nearest to the pointer.
 */
export function nearestVertex(
  scene: Scene3D,
  calc: Mesh3dCalc,
  candidates: readonly number[],
  cx: number,
  cy: number,
): number {
  const t = calc.triangles;
  let containing: number[] = [];
  let depth = Infinity;
  for (const tri of candidates) {
    const [a, b, c] = [0, 1, 2].map((k) => screen(scene, calc, t[tri * 3 + k]!));
    const area = (b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x);
    if (!(area !== 0)) continue;
    const l1 = ((b!.x - cx) * (c!.y - cy) - (b!.y - cy) * (c!.x - cx)) / area;
    const l2 = ((c!.x - cx) * (a!.y - cy) - (c!.y - cy) * (a!.x - cx)) / area;
    const l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const z = l1 * a!.depth + l2 * b!.depth + l3 * c!.depth;
    if (z < depth) [depth, containing] = [z, [tri]];
  }
  const tris = containing.length > 0 ? containing : candidates;
  let best = -1;
  let bestDist = Infinity;
  for (const tri of tris) {
    for (let k = 0; k < 3; k++) {
      const v = t[tri * 3 + k]!;
      const s = screen(scene, calc, v);
      const dist = Math.hypot(s.x - cx, s.y - cy);
      if (dist < bestDist) [best, bestDist] = [v, dist];
    }
  }
  return best;
}

/** What the hover found: a vertex, or a triangle (cell colors). */
export interface MeshHit {
  readonly kind: 'vertex' | 'cell';
  readonly index: number;
}

/**
 * Values of the level set for the hover contour: the vertex intensity, else the vertex z
 * (gl-mesh3d contours the intensity field, or z without one).
 */
export function contourField(trace: FullTrace, calc: Mesh3dCalc): Float64Array {
  if (trace['intensity'] !== undefined && trace['intensitymode'] !== 'cell') {
    return numbersOf(trace['intensity'], calc.count);
  }
  return calc.z;
}

/** The level of the hover contour through `hit`. */
export function contourLevel(field: Float64Array, calc: Mesh3dCalc, hit: MeshHit): number {
  if (hit.kind === 'vertex') return field[hit.index]!;
  const t = calc.triangles;
  let sum = 0;
  for (let k = 0; k < 3; k++) sum += field[t[hit.index * 3 + k]!]!;
  return sum / 3;
}

/**
 * The level set `field = level` through the mesh's triangles, as line segments (linear
 * coordinates, three entries per segment: both ends and a NaN gap).
 */
export function isoSegments(
  calc: Mesh3dCalc,
  field: ArrayLike<number>,
  level: number,
): { x: Float64Array; y: Float64Array; z: Float64Array } {
  const t = calc.triangles;
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const cross = (a: number, b: number) => {
    const fa = field[a]! - level;
    const fb = field[b]! - level;
    if (!(fa < 0 !== fb < 0)) return false;
    const s = fa / (fa - fb);
    xs.push(calc.x[a]! + s * (calc.x[b]! - calc.x[a]!));
    ys.push(calc.y[a]! + s * (calc.y[b]! - calc.y[a]!));
    zs.push(calc.z[a]! + s * (calc.z[b]! - calc.z[a]!));
    return true;
  };
  if (Number.isFinite(level)) {
    for (let k = 0; k + 2 < t.length; k += 3) {
      const [a, b, c] = [t[k]!, t[k + 1]!, t[k + 2]!];
      if (![a, b, c].every((v) => Number.isFinite(field[v]))) continue;
      const before = xs.length;
      cross(a, b);
      cross(b, c);
      cross(c, a);
      const n = xs.length - before;
      if (n === 2) {
        xs.push(NaN);
        ys.push(NaN);
        zs.push(NaN);
      } else {
        xs.length = ys.length = zs.length = before;
      }
    }
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), z: Float64Array.from(zs) };
}

/** Views listening to hover (the hover contour), by calc. */
export const MESH_HOVER_LISTENERS = new WeakMap<Mesh3dCalc, (hit: MeshHit | null) => void>();

function l2d(scene: Scene3D, axis: 0 | 1 | 2, l: number): unknown {
  return scene.layout.axes[axis].scale.l2d(l);
}

/** The `mesh3d` `hoverPoints`. */
export function mesh3dHoverPoints(
  calc: Mesh3dCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const notify = MESH_HOVER_LISTENERS.get(calc);
  const pick = scenePicks(trace, query, ctx);
  const first = pick?.hits[0];
  if (!pick || !first || calc.triangles.length === 0) {
    notify?.(null);
    return [];
  }
  const cells = cellColored(trace);
  const t = calc.triangles;
  let hit: MeshHit;
  if (cells) {
    // Expanded meshes pick triangles.
    hit = { kind: 'cell', index: first.pointIndex };
  } else {
    const cx = query.cx ?? 0;
    const cy = query.cy ?? 0;
    let candidates: number[];
    if (first.kind === 'triangle') candidates = [first.pointIndex];
    else {
      const around = trianglesAround(calc);
      const v = first.pointIndex;
      candidates = Array.from(around.list.subarray(around.start[v], around.start[v + 1]));
    }
    const v = candidates.length > 0 ? nearestVertex(pick.scene, calc, candidates, cx, cy) : -1;
    hit = { kind: 'vertex', index: v >= 0 ? v : first.pointIndex };
  }
  const i = hit.index;
  if (!(i >= 0) || (cells ? i * 3 + 2 >= t.length : i >= calc.count)) {
    notify?.(null);
    return [];
  }
  notify?.(hit);
  let x: number;
  let y: number;
  let z: number;
  if (cells) {
    const [a, b, c] = [t[i * 3]!, t[i * 3 + 1]!, t[i * 3 + 2]!];
    x = (calc.x[a]! + calc.x[b]! + calc.x[c]!) / 3;
    y = (calc.y[a]! + calc.y[b]! + calc.y[c]!) / 3;
    z = (calc.z[a]! + calc.z[b]! + calc.z[c]!) / 3;
  } else [x, y, z] = [calc.x[i]!, calc.y[i]!, calc.z[i]!];
  const intensity = trace['intensity'];
  const color = meshHoverColor(trace);
  const fields: Record<string, unknown> =
    intensity !== undefined ? { intensity: numbersOf(intensity, i + 1)[i] } : {};
  const point = sceneHoverPoint(pick, trace, {
    pointIndex: i,
    x,
    y,
    z,
    ...(cells
      ? { values: { x: l2d(pick.scene, 0, x), y: l2d(pick.scene, 1, y), z: l2d(pick.scene, 2, z) } }
      : {}),
    ...(color ? { color } : {}),
    fields,
  });
  // Plotly: `hovertext || text` (an empty `hovertext` falls back to `text`).
  const input = trace._input ?? {};
  const text = perPoint(trace['hovertext'], i) || perPoint(trace['text'], i);
  const info = perPoint(trace['hoverinfo'] ?? input['hoverinfo'], i);
  const flags = new Set(
    typeof info === 'string' && info !== '' && info !== 'all'
      ? info.split('+')
      : ['x', 'y', 'z', 'text', 'name'],
  );
  const labels = point.labels as { x: string; y: string; z: string };
  return [
    {
      ...point,
      ...(typeof text === 'string' && text !== '' ? { text } : {}),
      hoverText: sceneHoverText(labels, flags, text),
    },
  ];
}

function perPoint(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}
