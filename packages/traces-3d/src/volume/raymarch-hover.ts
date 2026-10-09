/**
 * Hover of ray-marched volumes (`render: 'raymarch'`, plan E14.7): nothing is picked on the GPU
 * (the volume has no surfaces), so the pointer's ray is marched on the CPU through the same grid
 * and transfer function as the shader (trilinear values in grid-index space, the same opacity per
 * step): the hovered point is the first sample at which the ray's accumulated opacity reaches
 * {@link HOVER_OPACITY} — where the volume starts to show — or, for a ray that never gets that
 * opaque, its most opaque sample. It snaps to the nearest grid point, labelled like isosurfaces
 * (`x`, `y`, `z`, `value: …`). The ray ignores other traces in front of the volume.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { sceneFor } from '../scene/scene.ts';
import { sceneClip, sceneHovers, sceneRay } from '../surface/hover.ts';
import type { Ray } from '../surface/pick.ts';
import type { IsoCalc } from '../isosurface/calc.ts';
import { gridIndex, type IsoGrid } from '../isosurface/grid.ts';
import { isoGridHoverPoint } from '../isosurface/hover.ts';
import { transferAt, type TransferSpec } from './transfer.ts';
import type { Vec3 } from '@mk7s/holochart-render';

/** Accumulated opacity at which the hover ray stops. */
export const HOVER_OPACITY = 0.1;

/** What the hover ray reads (the ray-march primitive's data). */
export interface RayMarchHoverSpec {
  readonly transfer: TransferSpec;
  readonly isomin: number;
  readonly isomax: number;
  /** The shader's sample spacing, grid cells (the hover samples at most half a cell apart). */
  readonly step: number;
}

/** Cell and fraction of linear coordinate `v` on ascending `values` (null outside). */
function locate(values: Float64Array, v: number): [number, number] | null {
  const n = values.length;
  if (!(v >= values[0]! && v <= values[n - 1]!)) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= v) lo = mid;
    else hi = mid;
  }
  const a = values[lo]!;
  const b = values[hi]!;
  return [lo, b > a ? (v - a) / (b - a) : 0];
}

/** The grid value at linear point `p` (trilinear, like the texture; NaN outside or missing). */
export function sampleGrid(grid: IsoGrid, p: Readonly<Vec3>): number {
  const axes = [grid.xs, grid.ys, grid.zs];
  const cell: [number, number][] = [];
  for (let a = 0; a < 3; a++) {
    const c = locate(axes[a]!, p[a]!);
    if (!c) return NaN;
    cell.push(c);
  }
  const index = (a: number, m: number): number => {
    const n = axes[a]!.length;
    const mm = Math.min(n - 1, m);
    return grid.descending[a] ? n - 1 - mm : mm;
  };
  let sum = 0;
  for (let c = 0; c < 8; c++) {
    let w = 1;
    const at: number[] = [];
    for (let a = 0; a < 3; a++) {
      const [m, f] = cell[a]!;
      const up = (c >> a) & 1;
      w *= up ? f : 1 - f;
      at.push(index(a, m + up));
    }
    if (w === 0) continue;
    sum += w * grid.value[gridIndex(grid, at[0]!, at[1]!, at[2]!)]!;
  }
  return sum;
}

/** Where `ray` shows the volume (see the module comment), linear coordinates, or null. */
export function rayMarchHit(
  grid: IsoGrid,
  spec: RayMarchHoverSpec,
  ray: Ray,
  clip: { min: Readonly<Vec3>; max: Readonly<Vec3> } | null,
): Vec3 | null {
  if (grid.len === 0) return null;
  const axes = [grid.xs, grid.ys, grid.zs];
  let t0 = 0;
  let t1 = Infinity;
  // Voxels per unit of the ray parameter.
  let speed = 0;
  for (let a = 0; a < 3; a++) {
    const v = axes[a]!;
    let lo = v[0]!;
    let hi = v[v.length - 1]!;
    if (clip) {
      lo = Math.max(lo, clip.min[a]!);
      hi = Math.min(hi, clip.max[a]!);
    }
    const o = ray.origin[a]!;
    const d = ray.dir[a]!;
    if (d === 0) {
      if (o < lo || o > hi) return null;
    } else {
      const ta = (lo - o) / d;
      const tb = (hi - o) / d;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    const span = v[v.length - 1]! - v[0]!;
    if (span > 0) speed += ((d * (v.length - 1)) / span) ** 2;
  }
  speed = Math.sqrt(speed);
  if (!(t1 > t0) || !(speed > 0)) return null;
  const step = Math.min(0.5, Math.max(0.05, spec.step));
  const dt = step / speed;
  const [lo, hi] = [Math.min(spec.isomin, spec.isomax), Math.max(spec.isomin, spec.isomax)];
  let acc = 0;
  let best: Vec3 | null = null;
  let bestContribution = 0;
  const p: Vec3 = [0, 0, 0];
  for (let t = t0 + dt / 2, n = 0; t <= t1 && n < 20000; t += dt, n++) {
    for (let a = 0; a < 3; a++) p[a] = ray.origin[a]! + ray.dir[a]! * t;
    const v = sampleGrid(grid, p);
    if (!(v >= lo && v <= hi)) continue;
    const alpha = transferAt(spec.transfer, v)[3];
    const a = 1 - Math.pow(Math.max(0, 1 - alpha), step);
    const contribution = (1 - acc) * a;
    acc += contribution;
    if (acc >= HOVER_OPACITY) return [p[0], p[1], p[2]];
    if (contribution > bestContribution) {
      bestContribution = contribution;
      best = [p[0], p[1], p[2]];
    }
  }
  return best;
}

/** Hover specs of the ray-marched volumes drawn, by calc (set by the view). */
export const RAYMARCH_HOVER = new WeakMap<IsoCalc, RayMarchHoverSpec>();

/** The `hoverPoints` of a ray-marched volume. */
export function rayMarchHoverPoints(
  calc: IsoCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const spec = RAYMARCH_HOVER.get(calc);
  const { cx, cy } = query;
  if (!spec || cx === undefined || cy === undefined) return [];
  const scene = sceneFor(ctx.fullLayout, trace);
  if (!scene || !scene.viewport.contains(cx, cy) || !sceneHovers(ctx.fullLayout, scene)) return [];
  const ray = sceneRay(scene, cx, cy);
  const hit = ray ? rayMarchHit(calc.grid, spec, ray, sceneClip(scene.layout)) : null;
  if (!hit) return [];
  const point = isoGridHoverPoint({ scene, hits: [], query }, trace, calc, ctx, hit, 0);
  return point ? [point] : [];
}
