/**
 * Extruded cartesian traces besides bars (plan E8.9): heatmap cells as columns and filled areas as
 * slabs, drawn by the extrusion primitive. Part of render's lazily loaded 2.5D chunk: the trace
 * views call `extrudeHeatmap` / `extrudeFills` (`extrusion-loader.ts`), which load it and then
 * call {@link syncHeatmapColumns} / {@link syncExtrudedFills}.
 *
 * ## Heatmap columns
 *
 * Every cell with a finite value becomes a column standing on its cell, as tall as its value:
 * heights grow linearly from 0 (from `zmin` when the color range has negative values) to `depth`
 * px at `zmax` (values beyond the color range are clamped), colored like the flat cell (its
 * colorscale, mixed linearly between stops as the trace hands them over) and inset by `xgap` /
 * `ygap`; columns under half a px are left out. The flat heatmap stays drawn under the columns, as
 * their floor: cells at the bottom of the range (height 0) keep their color. Columns are rect
 * prisms (the primitive's rect path, so hover ray casts pick the column under the pointer); grids
 * above {@link HEATMAP_COLUMNS_MAX} cells stay flat (with a warning) and above
 * {@link HEATMAP_BEVEL_MAX} cells the columns have sharp edges.
 *
 * ## Area slabs
 *
 * A scatter trace's fill (`fill: 'tozeroy' | 'tonexty' | 'toself' | …`) becomes a slab from the
 * plot plane to `depth` px: its front face is the fill's own triangulation (so the nonzero rule,
 * holes and self-intersecting `toself` rings come out exactly as in the flat fill) and its walls
 * stand on the boundary edges of that triangulation (edges only one triangle has), facing out.
 * Every filled trace uses the same depth range, so stacked areas (`stackgroup`, `tonexty`) form
 * one slab in layers; later traces' front faces sit a fraction of a px in front (0.2 px per trace
 * index), so overlapping fills never flicker. The flat fill is hidden while extruded (the slab
 * draws `fillcolor`; `fillgradient` and `fillpattern` are not extruded). The pointer ray test is
 * exact — the front triangles and the walls — and keeps rays within a few px of the front face on
 * its plane, where the trace's lines and markers are drawn.
 *
 * In both cases what the trace draws on top (heatmap cell labels; the area's lines, markers, labels
 * and error bars) moves in front of the extruded shapes, out of the 2.5D view's clipping.
 */
import type { Vector3 } from 'three';
import type { DataTransform, Primitive } from '../types.ts';
import {
  createExtrusionPrimitive,
  extrusionDepths,
  extrusionMaterialSpec,
  UNCLIPPED,
  type ExtrusionData,
  type ExtrusionHit,
  type ExtrusionHost,
  type ExtrusionPrimitive,
  type LiftedPrimitive,
} from './extrusion.ts';
import type { PrismBuffers } from './extrusion-geometry.ts';
import type { FillTriangulation } from './fill-triangulate.ts';
import type { LazyFillPrimitive } from './fill-loader.ts';
import type { HeatmapData, HeatmapPrimitive } from './heatmap.ts';
import type { MeshModule } from './mesh-loader.ts';

/** Largest heatmap (cells) drawn as columns: larger grids stay flat, with a warning. */
export const HEATMAP_COLUMNS_MAX = 100_000;
/** Largest heatmap (cells) whose columns take `bevel`: larger grids get sharp edges. */
export const HEATMAP_BEVEL_MAX = 10_000;
/** Distance (px) around a slab's front face at which rays still map onto its plane. */
const NEAR = 8;
/** Front-face offset of each trace index (px): overlapping slabs never share a plane. */
const TRACE_STEP = 0.2;

/** The inputs each extrusion primitive was last built from (skips rebuilds on pans). */
const built = new WeakMap<ExtrusionPrimitive, readonly unknown[]>();
let warned = false;

const same = (a: readonly unknown[] | undefined, b: readonly unknown[]): boolean =>
  !!a && a.length === b.length && a.every((v, i) => v === b[i]);

/** `depth` in px: a number, or a percentage of `width` px (arrays: their first number). */
function depthPx(depth: unknown, width: number): number {
  const d = extrusionDepths(depth, 1, () => width);
  return typeof d === 'number' ? d : (d[0] ?? 0);
}

/** Move `lift` in front of extruded shapes `top` px deep and out of the clipping, or back (null). */
function liftOnto(lift: readonly LiftedPrimitive[], tf: DataTransform, top: number | null): void {
  const t = top === null ? tf : { ...tf, offsetZ: (tf.offsetZ ?? 0) + top + 0.5 };
  for (const l of lift) {
    if (!l) continue;
    l.setTransform(t);
    for (const p of 'primitives' in l ? l.primitives : [l]) {
      if (top === null) delete p.object.userData[UNCLIPPED];
      else p.object.userData[UNCLIPPED] = true;
    }
  }
}

/** Remove the extrusion (flat trace): returns undefined. */
function drop(
  prev: ExtrusionPrimitive | undefined,
  host: ExtrusionHost,
  lift: readonly LiftedPrimitive[],
): undefined {
  if (prev) host.remove(prev);
  liftOnto(lift, host.transform, null);
  return undefined;
}

/**
 * Create or update the extrusion primitive with `patch` unless `key` shows nothing changed (then
 * only the transform), and lift `lift` in front of it.
 */
function place(
  prev: ExtrusionPrimitive | undefined,
  host: ExtrusionHost,
  key: readonly unknown[],
  patch: () => Partial<ExtrusionData>,
  lift: readonly LiftedPrimitive[],
  renderOrder: number,
  mesh: MeshModule,
): ExtrusionPrimitive {
  let p = prev;
  if (!p || !same(built.get(p), key)) {
    const t = host.trace;
    const bevel = (t['bevel'] ?? {}) as { size?: unknown; segments?: unknown };
    const xr = host.xaxis?.scale.range;
    const yr = host.yaxis?.scale.range;
    const data: Partial<ExtrusionData> = {
      bevel: typeof bevel.size === 'number' ? bevel.size : 0,
      segments: typeof bevel.segments === 'number' ? bevel.segments : 3,
      material: extrusionMaterialSpec(t['material'], () => host.invalidate?.()),
      clip: xr && yr ? { x: [xr[0], xr[1]], y: [yr[0], yr[1]] } : null,
      ...patch(),
    };
    if (!p) {
      // Built once, for the current transform.
      p = createExtrusionPrimitive(host.primitives, {}, mesh);
      p.setTransform(host.transform);
      host.add(p);
    }
    p.update(data);
    built.set(p, key);
  }
  p.object.renderOrder = renderOrder;
  p.setTransform(host.transform);
  liftOnto(lift, host.transform, p.maxDepth);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Heatmap columns
// ---------------------------------------------------------------------------------------------

/** Heatmap columns: rect corners (data space), heights (px) and colors of every cell. */
export interface HeatmapColumns {
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
  readonly depth: Float32Array;
  readonly color: Float32Array;
}

/**
 * The columns of a heatmap `top` px tall at `zmax` (see the module comment), their cells inset by
 * the gaps (`gapX` / `gapY`: half the gap in data units). Cells without a value have NaN corners.
 */
export function heatmapColumns(
  d: Pick<HeatmapData, 'z' | 'nx' | 'ny' | 'xEdges' | 'yEdges' | 'colorscale' | 'zmin' | 'zmax'> &
    Partial<Pick<HeatmapData, 'reversescale'>>,
  top: number,
  gapX = 0,
  gapY = 0,
): HeatmapColumns {
  const { nx, ny, z, xEdges: xe, yEdges: ye, zmin: lo, zmax: hi } = d;
  const n = nx * ny;
  const out = {
    x0: new Float64Array(n),
    y0: new Float64Array(n),
    x1: new Float64Array(n),
    y1: new Float64Array(n),
    depth: new Float32Array(n),
    color: new Float32Array(n * 4),
  };
  const stops = [...d.colorscale].sort((a, b) => a[0] - b[0]);
  const base = Math.min(lo, 0);
  // One cell's corners along an axis, inset by `gap` (NaN when nothing is left).
  const side = (a: number, b: number, gap: number): [number, number] => {
    const s = a <= b ? gap : -gap;
    return Math.abs(b - a) > 2 * gap ? [a + s, b - s] : [NaN, NaN];
  };
  for (let j = 0; j < ny; j++) {
    const [ya, yb] = side(ye[j]!, ye[j + 1]!, gapY);
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const v = z[k]!;
      const [xa, xb] = Number.isFinite(v) ? side(xe[i]!, xe[i + 1]!, gapX) : [NaN, NaN];
      out.x0[k] = xa;
      out.x1[k] = xb;
      out.y0[k] = ya;
      out.y1[k] = yb;
      const h = hi > base ? (v - base) / (hi - base) : 1;
      // Below half a px no column: the floor shows the cell (no flicker against it).
      const px = top * Math.min(1, Math.max(0, h));
      out.depth[k] = px >= 0.5 ? px : 0;
      // The flat heatmap's color: the colorscale at (v - zmin) / (zmax - zmin), between stops.
      let c = hi > lo ? (v - lo) / (hi - lo) : 0;
      c = Math.min(1, Math.max(0, d.reversescale ? 1 - c : c));
      let s = 1;
      while (s < stops.length - 1 && stops[s]![0] < c) s++;
      const [p0, c0] = stops[Math.max(0, s - 1)]!;
      const [p1, c1] = stops[Math.min(s, stops.length - 1)]!;
      const f = p1 > p0 ? Math.min(1, Math.max(0, (c - p0) / (p1 - p0))) : 1;
      for (let q = 0; q < 4; q++) out.color[k * 4 + q] = c0[q]! + (c1[q]! - c0[q]!) * f;
    }
  }
  return out;
}

/**
 * Draw a heatmap's cells as columns when its trace has `depth` (see the module comment; the
 * lazily loaded side of `extrudeHeatmap`): creates, updates or removes the extrusion primitive and
 * returns it. `depth` is the height at `zmax` in px, or a percentage of the mean cell width.
 */
export function syncHeatmapColumns(
  prev: ExtrusionPrimitive | undefined,
  host: ExtrusionHost,
  heatmap: HeatmapPrimitive | undefined,
  lift: readonly LiftedPrimitive[],
  mesh: MeshModule,
): ExtrusionPrimitive | undefined {
  if (!heatmap) return drop(prev, host, lift);
  const d = heatmap.current;
  const tf = host.transform;
  const n = d.nx * d.ny;
  if (n === 0) return drop(prev, host, lift);
  const width = Math.abs((d.xEdges[d.nx]! - d.xEdges[0]!) * tf.scaleX) / d.nx;
  let top = depthPx(host.trace['depth'], width);
  if (n > HEATMAP_COLUMNS_MAX && top > 0) {
    if (!warned) {
      warned = true;
      console.warn(
        `[holochart] heatmap depth: more than ${HEATMAP_COLUMNS_MAX} cells, drawing flat`,
      );
    }
    top = 0;
  }
  if (!(top > 0)) return drop(prev, host, lift);
  // Gaps are px: their inset in data units follows the zoom.
  const gx = d.xgap / 2 / Math.abs(tf.scaleX);
  const gy = d.ygap / 2 / Math.abs(tf.scaleY);
  const trace = host.trace;
  const key = [d, top, gx, gy, JSON.stringify([trace['bevel'], trace['material']])];
  return place(
    prev,
    host,
    key,
    () => {
      const cols = heatmapColumns(d, top, gx, gy);
      return {
        ...cols,
        ...(n > HEATMAP_BEVEL_MAX ? { bevel: 0 } : {}),
        opacity: d.opacity,
      };
    },
    lift,
    heatmap.object.renderOrder,
    mesh,
  );
}

// ---------------------------------------------------------------------------------------------
// Area slabs
// ---------------------------------------------------------------------------------------------

/** A fill's slab in world px (see the module comment). */
export interface SlabGeometry {
  /** World position of every triangulation vertex. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Polygon (item) of every vertex. */
  readonly item: Uint32Array;
  /** Counter-clockwise front triangles (vertex indices), degenerate ones left out. */
  readonly tris: readonly number[];
  /** Boundary edges `a → b` (vertex index pairs), the filled side on the left. */
  readonly edges: readonly number[];
}

/**
 * The slab geometry of a fill triangulation for a data → world transform. Vertices at the same
 * point count as one, so an edge two triangles share is found however they number it.
 */
export function slabGeometry(
  tri: Pick<FillTriangulation, 'positions' | 'indices' | 'vertexStarts'>,
  t: DataTransform,
): SlabGeometry {
  const nv = Math.floor(tri.positions.length / 3);
  const x = new Float64Array(nv);
  const y = new Float64Array(nv);
  const item = new Uint32Array(nv);
  const id = new Uint32Array(nv);
  const ids = new Map<string, number>();
  for (let v = 0; v < nv; v++) {
    x[v] = tri.positions[v * 3]! * t.scaleX + t.offsetX;
    y[v] = tri.positions[v * 3 + 1]! * t.scaleY + t.offsetY;
    const k = `${x[v]},${y[v]}`;
    let i = ids.get(k);
    if (i === undefined) ids.set(k, (i = ids.size));
    id[v] = i;
  }
  for (let p = 0; p + 1 < tri.vertexStarts.length; p++) {
    item.fill(p, tri.vertexStarts[p]!, tri.vertexStarts[p + 1]!);
  }
  const tris: number[] = [];
  // Undirected edge → [count, a, b] of its first (directed, counter-clockwise) occurrence.
  const seen = new Map<number, [number, number, number]>();
  const m = ids.size;
  for (let k = 0; k + 2 < tri.indices.length; k += 3) {
    const a = tri.indices[k]!;
    let b = tri.indices[k + 1]!;
    let c = tri.indices[k + 2]!;
    const cross = (x[b]! - x[a]!) * (y[c]! - y[a]!) - (y[b]! - y[a]!) * (x[c]! - x[a]!);
    if (!(cross !== 0)) continue;
    if (cross < 0) [b, c] = [c, b];
    tris.push(a, b, c);
    for (const [u, w] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const iu = id[u]!;
      const iw = id[w]!;
      const e = Math.min(iu, iw) * m + Math.max(iu, iw);
      const s = seen.get(e);
      if (s) s[0]++;
      else seen.set(e, [1, u, w]);
    }
  }
  const edges: number[] = [];
  for (const [count, a, b] of seen.values()) if (count === 1) edges.push(a, b);
  return { x, y, item, tris, edges };
}

/** Write a slab from `z0` to `z1`: the front triangles and the walls (no back face). */
export function writeSlab(out: PrismBuffers, g: SlabGeometry, z0: number, z1: number): void {
  const first = out.vertexCount;
  for (let v = 0; v < g.x.length; v++) out.vertex(g.x[v]!, g.y[v]!, z1, 0, 0, 1, g.item[v]!);
  for (const v of g.tris) out.indices.push(first + v);
  for (let k = 0; k + 1 < g.edges.length; k += 2) {
    const a = g.edges[k]!;
    const b = g.edges[k + 1]!;
    const dx = g.x[b]! - g.x[a]!;
    const dy = g.y[b]! - g.y[a]!;
    const l = Math.hypot(dx, dy);
    if (!(l > 0)) continue;
    const [nx, ny] = [dy / l, -dx / l];
    const i = g.item[a]!;
    const w = out.vertex(g.x[a]!, g.y[a]!, z0, nx, ny, 0, i);
    out.vertex(g.x[b]!, g.y[b]!, z0, nx, ny, 0, i);
    out.vertex(g.x[b]!, g.y[b]!, z1, nx, ny, 0, i);
    out.vertex(g.x[a]!, g.y[a]!, z1, nx, ny, 0, i);
    out.indices.push(w, w + 1, w + 2, w, w + 2, w + 3);
  }
}

/**
 * Where a ray (in the slab's own world frame) first meets the slab from `z0` to `z1`: its front
 * face (or its plane within {@link NEAR} px of it, where the lines along the edge are drawn) or a
 * wall facing the ray, inside the world box `clip` (x0, y0, x1, y1). The hit point on a wall is
 * moved a hair inside the fill.
 */
export function raycastSlab(
  g: SlabGeometry,
  z0: number,
  z1: number,
  o: { readonly x: number; readonly y: number; readonly z: number },
  d: { readonly x: number; readonly y: number; readonly z: number },
  clip: readonly [number, number, number, number],
): ExtrusionHit | undefined {
  let best: ExtrusionHit | undefined;
  const inClip = (px: number, py: number) =>
    px >= clip[0] && px <= clip[2] && py >= clip[1] && py <= clip[3];
  const s = Math.abs(d.z) > 1e-12 ? (z1 - o.z) / d.z : -1;
  const px = o.x + s * d.x;
  const py = o.y + s * d.y;
  if (s >= 0 && inClip(px, py)) {
    const { x, y, tris } = g;
    for (let k = 0; k + 2 < tris.length; k += 3) {
      const [a, b, c] = [tris[k]!, tris[k + 1]!, tris[k + 2]!];
      const side = (u: number, w: number) =>
        (x[w]! - x[u]!) * (py - y[u]!) - (y[w]! - y[u]!) * (px - x[u]!);
      if (side(a, b) >= 0 && side(b, c) >= 0 && side(c, a) >= 0) {
        best = { t: s, x: px, y: py, index: g.item[a]! };
        break;
      }
    }
    // Just outside the front face: still on its plane, where the lines and markers along the
    // fill's edge are drawn (at the silhouette a ray would otherwise fall far behind them).
    for (let k = 0; !best && k + 1 < g.edges.length; k += 2) {
      const a = g.edges[k]!;
      const ex = x[g.edges[k + 1]!]! - x[a]!;
      const ey = y[g.edges[k + 1]!]! - y[a]!;
      const f = Math.min(
        1,
        Math.max(0, ((px - x[a]!) * ex + (py - y[a]!) * ey) / (ex * ex + ey * ey)),
      );
      if (Math.hypot(px - x[a]! - f * ex, py - y[a]! - f * ey) <= NEAR) {
        best = { t: s, x: px, y: py, index: g.item[a]! };
      }
    }
  }
  for (let k = 0; k + 1 < g.edges.length; k += 2) {
    const a = g.edges[k]!;
    const b = g.edges[k + 1]!;
    const ex = g.x[b]! - g.x[a]!;
    const ey = g.y[b]! - g.y[a]!;
    const l = Math.hypot(ex, ey);
    // Outward normal (ey, -ex) / l; only walls facing the ray.
    const facing = (d.x * ey - d.y * ex) / l;
    if (!(l > 0) || !(facing < -1e-12)) continue;
    const w = ((g.x[a]! - o.x) * ey - (g.y[a]! - o.y) * ex) / l / facing;
    if (w < 0 || (best && w >= best.t)) continue;
    const qz = o.z + w * d.z;
    const qx = o.x + w * d.x;
    const qy = o.y + w * d.y;
    const along = ((qx - g.x[a]!) * ex + (qy - g.y[a]!) * ey) / (l * l);
    if (qz < z0 || qz > z1 || along < 0 || along > 1 || !inClip(qx, qy)) continue;
    best = { t: w, x: qx - (ey / l) * 1e-3, y: qy + (ex / l) * 1e-3, index: g.item[a]! };
  }
  return best;
}

/** What {@link syncExtrudedFills} needs of a trace view's context (its data index). */
type FillHost = ExtrusionHost & { readonly index?: number };

/**
 * Draw a scatter trace's fill as a slab when the trace has `depth` (see the module comment; the
 * lazily loaded side of `extrudeFills`): creates, updates or removes the extrusion primitive and
 * returns it; hides the flat fill while extruded and lifts the trace's other primitives in `added`
 * (those still drawn) onto the slab's front. `depth` is px, or a percentage of the plot
 * area's width. `fill` must have loaded (`fill.fill`).
 */
export function syncExtrudedFills(
  prev: ExtrusionPrimitive | undefined,
  host: FillHost,
  fill: LazyFillPrimitive | undefined,
  added: Iterable<Primitive<unknown>>,
  mesh: MeshModule,
): ExtrusionPrimitive | undefined {
  const lift = [...added].filter((p) => p !== fill && p.object.parent);
  const fp = fill?.fill;
  const tf = host.transform;
  const xr = host.xaxis?.scale.range;
  const depth = depthPx(host.trace['depth'], xr ? Math.abs((xr[1] - xr[0]) * tf.scaleX) : 0);
  if (fill) fill.object.visible = !(fp && depth > 0);
  if (!fp || !(depth > 0)) return drop(prev, host, lift);
  const z1 = depth + TRACE_STEP * (host.index ?? 0);
  const tri = fp.triangulation;
  const fd = fp.current;
  const key = [tri, fd.color, fd.opacity, z1, JSON.stringify(host.trace['material'])];
  return place(
    prev,
    host,
    key,
    () => {
      // Built for the transform of the last build; later pans shift the ray instead.
      let g: SlabGeometry | undefined;
      let at: DataTransform = tf;
      return {
        depth: z1,
        bevel: 0,
        color: fd.color,
        opacity: fd.opacity ?? 1,
        prisms: (out, t) => {
          at = t;
          g = slabGeometry(tri, t);
          writeSlab(out, g, 0, z1);
        },
        hit: (origin: Vector3, dir: Vector3, t: DataTransform, c) => {
          if (!g) return undefined;
          const dx = t.offsetX - at.offsetX;
          const dy = t.offsetY - at.offsetY;
          const o = { x: origin.x - dx, y: origin.y - dy, z: origin.z };
          const hit = raycastSlab(g, 0, z1, o, dir, [c[0] - dx, c[1] - dy, c[2] - dx, c[3] - dy]);
          return hit && { ...hit, x: hit.x + dx, y: hit.y + dy };
        },
      };
    },
    lift,
    fp.object.renderOrder,
    mesh,
  );
}
