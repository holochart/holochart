/**
 * Picking a surface under the pointer (plan E14.3): a ray cast on the CPU, exact against the drawn
 * triangles (the same two per cell as the shader), synchronous (hover asks every pointer move).
 *
 * The grid is cut into blocks of 16 × 16 cells with their linear bounding boxes (built once per
 * grid, O(n)); a ray tests the boxes, then the triangles of the boxes it enters, nearest box first,
 * and stops once no box can hold a nearer hit: well under a millisecond for a 1024² grid. The hit
 * snaps to the nearest grid point (Plotly's `snapToData`: hover shows the point's own values).
 */
import { gridX, gridY, type SurfaceGrid } from './grid.ts';

type Vec3 = [number, number, number];

/** A ray in linear coordinates: `origin + t · dir`, `t ≥ 0`. */
export interface Ray {
  readonly origin: Readonly<Vec3>;
  readonly dir: Readonly<Vec3>;
}

/** Where a ray hits a surface. */
export interface SurfaceHit {
  /** The grid point nearest to the hit (column, row). */
  readonly i: number;
  readonly j: number;
  /** The hit on the drawn surface, linear coordinates. */
  readonly point: Vec3;
  /** Fractional grid coordinates of the hit. */
  readonly fi: number;
  readonly fj: number;
  /** Ray parameter of the hit. */
  readonly t: number;
}

const BLOCK = 16;

/** Möller–Trumbore, two-sided: `[t, u, v]` or null. */
export function intersectTriangle(
  ray: Ray,
  a: Readonly<Vec3>,
  b: Readonly<Vec3>,
  c: Readonly<Vec3>,
): [number, number, number] | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.dir;
  const e1x = b[0] - a[0];
  const e1y = b[1] - a[1];
  const e1z = b[2] - a[2];
  const e2x = c[0] - a[0];
  const e2y = c[1] - a[1];
  const e2z = c[2] - a[2];
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det === 0 || !Number.isFinite(det)) return null;
  const inv = 1 / det;
  const tx = ox - a[0];
  const ty = oy - a[1];
  const tz = oz - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 ? [t, u, v] : null;
}

/** Entry parameter of a ray into a box (`Infinity`: misses). */
function enterBox(ray: Ray, box: Float64Array, o: number): number {
  let t0 = 0;
  let t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    const lo = box[o + a]!;
    const hi = box[o + 3 + a]!;
    const org = ray.origin[a]!;
    const d = ray.dir[a]!;
    if (d === 0) {
      if (org < lo || org > hi) return Infinity;
      continue;
    }
    let ta = (lo - org) / d;
    let tb = (hi - org) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Ray casts against one grid (see the module comment). */
export class SurfacePicker {
  readonly grid: SurfaceGrid;
  readonly #bx: number;
  readonly #by: number;
  /** Per block: min x, y, z, max x, y, z (empty blocks: +∞ / −∞). */
  readonly #boxes: Float64Array;

  constructor(grid: SurfaceGrid) {
    this.grid = grid;
    const { nx, ny } = grid;
    this.#bx = Math.max(0, Math.ceil((nx - 1) / BLOCK));
    this.#by = Math.max(0, Math.ceil((ny - 1) / BLOCK));
    const boxes = new Float64Array(this.#bx * this.#by * 6);
    for (let b = 0; b < this.#bx * this.#by; b++) {
      boxes.fill(Infinity, b * 6, b * 6 + 3);
      boxes.fill(-Infinity, b * 6 + 3, b * 6 + 6);
    }
    const p: Vec3 = [0, 0, 0];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!this.point(i, j, p)) continue;
        // A point belongs to the blocks of the cells around it.
        const bi0 = Math.min(this.#bx - 1, Math.floor(Math.max(0, i - 1) / BLOCK));
        const bi1 = Math.min(this.#bx - 1, Math.floor(i / BLOCK));
        const bj0 = Math.min(this.#by - 1, Math.floor(Math.max(0, j - 1) / BLOCK));
        const bj1 = Math.min(this.#by - 1, Math.floor(j / BLOCK));
        for (let bj = bj0; bj <= bj1; bj++) {
          for (let bi = bi0; bi <= bi1; bi++) {
            const o = (bj * this.#bx + bi) * 6;
            for (let a = 0; a < 3; a++) {
              if (p[a]! < boxes[o + a]!) boxes[o + a] = p[a]!;
              if (p[a]! > boxes[o + 3 + a]!) boxes[o + 3 + a] = p[a]!;
            }
          }
        }
      }
    }
    this.#boxes = boxes;
  }

  /** Grid point `(i, j)` into `out`; false for a gap. */
  point(i: number, j: number, out: Vec3): boolean {
    const g = this.grid;
    out[0] = gridX(g, i, j);
    out[1] = gridY(g, i, j);
    out[2] = g.z[j * g.nx + i]!;
    return Number.isFinite(out[0]) && Number.isFinite(out[1]) && Number.isFinite(out[2]);
  }

  /**
   * The nearest hit of `ray` on the surface, or null. `clip`: a linear box outside which hits
   * don't count (the scene's axis ranges; the drawn surface is clipped to it).
   */
  intersect(
    ray: Ray,
    clip?: { min: Readonly<Vec3>; max: Readonly<Vec3> } | null,
  ): SurfaceHit | null {
    const blocks: [number, number][] = [];
    for (let b = 0; b < this.#bx * this.#by; b++) {
      const t = enterBox(ray, this.#boxes, b * 6);
      if (t < Infinity) blocks.push([t, b]);
    }
    blocks.sort((a, b) => a[0] - b[0]);
    const { nx, ny } = this.grid;
    const p0: Vec3 = [0, 0, 0];
    const p1: Vec3 = [0, 0, 0];
    const p2: Vec3 = [0, 0, 0];
    const p3: Vec3 = [0, 0, 0];
    let best: SurfaceHit | null = null;
    const inside = (q: Vec3): boolean => {
      if (!clip) return true;
      for (let a = 0; a < 3; a++) {
        const lo = Math.min(clip.min[a]!, clip.max[a]!);
        const hi = Math.max(clip.min[a]!, clip.max[a]!);
        const eps = (hi - lo) * 1e-9;
        if (q[a]! < lo - eps || q[a]! > hi + eps) return false;
      }
      return true;
    };
    for (const [tEnter, b] of blocks) {
      if (best && tEnter > best.t) break;
      const bi = b % this.#bx;
      const bj = (b - bi) / this.#bx;
      const i1 = Math.min(nx - 1, (bi + 1) * BLOCK);
      const j1 = Math.min(ny - 1, (bj + 1) * BLOCK);
      for (let j = bj * BLOCK; j < j1; j++) {
        for (let i = bi * BLOCK; i < i1; i++) {
          const ok00 = this.point(i, j, p0);
          const ok10 = this.point(i + 1, j, p1);
          const ok11 = this.point(i + 1, j + 1, p2);
          const ok01 = this.point(i, j + 1, p3);
          // The shader's split: (00, 10, 11) and (00, 11, 01).
          for (let h = 0; h < 2; h++) {
            if (!ok00 || !ok11 || !(h === 0 ? ok10 : ok01)) continue;
            const q = h === 0 ? p1 : p3;
            const hit =
              h === 0 ? intersectTriangle(ray, p0, q, p2) : intersectTriangle(ray, p0, p2, q);
            if (!hit || (best && hit[0] >= best.t)) continue;
            const [t, u, v] = hit;
            const point: Vec3 = [
              ray.origin[0] + ray.dir[0] * t,
              ray.origin[1] + ray.dir[1] * t,
              ray.origin[2] + ray.dir[2] * t,
            ];
            if (!inside(point)) continue;
            // Barycentric grid coordinates: (i, j), then (i+1, j) (i+1, j+1) or (i+1, j+1) (i, j+1).
            const fi = i + (h === 0 ? u + v : u);
            const fj = j + (h === 0 ? v : u + v);
            best = {
              i: Math.min(nx - 1, Math.max(0, Math.round(fi))),
              j: Math.min(ny - 1, Math.max(0, Math.round(fj))),
              point,
              fi,
              fj,
              t,
            };
          }
        }
      }
    }
    return best;
  }
}
