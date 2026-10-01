/**
 * Prism geometry of the extrusion primitive (plan E8.9): 2D outlines extruded along +z from `z0`
 * to `z1`, with an optional rounded bevel on the front edges. Pure (no WebGL), unit-tested:
 * vertex counts, normals and watertightness.
 *
 * ## Outlines
 *
 * An {@link Outline} is a closed, counter-clockwise ring of points (seen from +z), each with the
 * shading normal of the wall there and the direction it moves when the bevel insets the outline
 * (the normal on curves, the miter vector at sharp corners, so the inset ring stays closed). Sharp
 * corners repeat their point, once per edge normal, so walls shade flat.
 *
 * - {@link rectOutline}: a rectangle whose corners are rounded with the bevel radius (bars,
 *   funnel, waterfall, heatmap cells, treemap tiles).
 * - {@link sectorOutline}: an annular sector (pie and sunburst slices), sharp corners.
 * - {@link polygonOutline}: any simple polygon (area fills), sharp corners.
 *
 * ## Extrusion
 *
 * {@link extrudeOutline} writes the walls (from `z0` up to where the bevel starts), the bevel —
 * `segments` rings along a quarter circle of radius `bevel`, each inset along the outline's offset
 * directions and lifted toward `z1`, with normals turning from the wall's to +z — and both caps
 * (the front cap is the fully inset ring; the back cap faces −z). Triangles that collapse (at
 * rounded corners fully inset, or between the two copies of a sharp corner) are skipped.
 */

/** Points closer than this (world units, summed over the axes) are the same point. */
const SAME_POINT = 1e-7;

/** A closed counter-clockwise ring of points (see the module comment). */
export interface Outline {
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** Unit shading normal of the wall (xy). */
  readonly nx: readonly number[];
  readonly ny: readonly number[];
  /** Inset direction: moving the point by `-offset · d` insets the outline by `d`. */
  readonly ox: readonly number[];
  readonly oy: readonly number[];
  /**
   * Front and back cap triangles as indices into the ring (counter-clockwise); omitted: a fan
   * from point 0 (convex outlines).
   */
  readonly cap?: readonly number[];
}

/** Growing vertex and index buffers (world units), one item id per vertex. */
export class PrismBuffers {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];
  /** Item (shape) index of every vertex. */
  readonly items: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, item: number) {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.items.push(item);
    return this.positions.length / 3 - 1;
  }

  /** A triangle, unless two of its corners are (within rounding) the same point. */
  triangle(a: number, b: number, c: number): void {
    if (this.#same(a, b) || this.#same(b, c) || this.#same(a, c)) return;
    this.indices.push(a, b, c);
  }

  #same(a: number, b: number): boolean {
    const p = this.positions;
    return (
      Math.abs(p[a * 3]! - p[b * 3]!) +
        Math.abs(p[a * 3 + 1]! - p[b * 3 + 1]!) +
        Math.abs(p[a * 3 + 2]! - p[b * 3 + 2]!) <
      SAME_POINT
    );
  }
}

/**
 * The bevel an outline of this size and depth takes: at most half its size and its depth; none
 * below a thousandth of a px.
 */
export function clampBevel(bevel: number, width: number, height: number, depth: number): number {
  const b = Math.min(bevel, width / 2, height / 2, depth);
  return Number.isFinite(b) && b > 1e-3 ? b : 0;
}

/**
 * A rectangle from `(x0, y0)` to `(x1, y1)` (any order) with corners rounded by `radius` in
 * `segments` steps (sharp corners for radius 0).
 */
export function rectOutline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  segments: number,
): Outline {
  const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
  const r = Math.max(0, Math.min(radius, (bx - ax) / 2, (by - ay) / 2));
  const out = { x: [] as number[], y: [] as number[], nx: [] as number[], ny: [] as number[] };
  const corners: [number, number, number][] = [
    [bx - r, ay + r, -Math.PI / 2],
    [bx - r, by - r, 0],
    [ax + r, by - r, Math.PI / 2],
    [ax + r, ay + r, Math.PI],
  ];
  const sharp = r === 0;
  const steps = sharp ? 1 : Math.max(1, Math.round(segments));
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * (Math.PI / 2);
      const c = Math.cos(a);
      const s = Math.sin(a);
      // Exact axis-aligned normals at the ends of each arc (flat walls in between).
      const nx = Math.abs(c) < 1e-12 ? 0 : c;
      const ny = Math.abs(s) < 1e-12 ? 0 : s;
      out.x.push(cx + r * nx);
      out.y.push(cy + r * ny);
      out.nx.push(nx);
      out.ny.push(ny);
    }
  }
  if (!sharp) return { ...out, ox: out.nx, oy: out.ny };
  // Sharp corners (two copies each): inset along the miter, (±1, ±1).
  const ox: number[] = [];
  const oy: number[] = [];
  for (let i = 0; i < out.x.length; i++) {
    ox.push(out.x[i] === bx ? 1 : -1);
    oy.push(out.y[i] === by ? 1 : -1);
  }
  return { ...out, ox, oy };
}

/** Add a sharp corner (two copies, one per edge normal) with its miter inset direction. */
function sharpCorner(
  out: { x: number[]; y: number[]; nx: number[]; ny: number[]; ox: number[]; oy: number[] },
  x: number,
  y: number,
  n1: readonly [number, number],
  n2: readonly [number, number],
): void {
  const d = 1 + n1[0] * n2[0] + n1[1] * n2[1];
  // Miter: moves both edges by the same distance; capped for very sharp corners.
  const m = d > 0.05 ? 1 / d : 20;
  const mx = (n1[0] + n2[0]) * m;
  const my = (n1[1] + n2[1]) * m;
  for (const n of [n1, n2]) {
    out.x.push(x);
    out.y.push(y);
    out.nx.push(n[0]);
    out.ny.push(n[1]);
    out.ox.push(mx);
    out.oy.push(my);
  }
}

/** Unit outward normal of the edge `a → b` of a counter-clockwise ring. */
function edgeNormal(ax: number, ay: number, bx: number, by: number): [number, number] {
  const l = Math.hypot(bx - ax, by - ay) || 1;
  return [(by - ay) / l, -(bx - ax) / l];
}

/**
 * An annular sector around `(cx, cy)` from `inner` to `outer` radius and angle `a0` to `a1`
 * (radians, counter-clockwise, `a1 > a0`), the arcs in `arcSegments` steps; `inner = 0` is a pie
 * slice. Sharp corners; the cap is a strip between the arcs.
 */
export function sectorOutline(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  a0: number,
  a1: number,
  arcSegments: number,
): Outline {
  const n = Math.max(1, Math.round(arcSegments));
  const out = { x: [] as number[], y: [] as number[], nx: [] as number[], ny: [] as number[] };
  const ox: number[] = [];
  const oy: number[] = [];
  const all = { ...out, ox, oy };
  const at = (r: number, a: number): [number, number] => [
    cx + r * Math.cos(a),
    cy + r * Math.sin(a),
  ];
  const radial = (a: number): [number, number] => [Math.cos(a), Math.sin(a)];
  // Normals of the straight edges: the start edge (inner → outer at a0) faces -a0's tangent side.
  const startN: [number, number] = [Math.sin(a0), -Math.cos(a0)];
  const endN: [number, number] = [-Math.sin(a1), Math.cos(a1)];
  // Outer arc, a0 → a1.
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const [x, y] = at(outer, a);
    if (k === 0) sharpCorner(all, x, y, startN, radial(a));
    else if (k === n) sharpCorner(all, x, y, radial(a), endN);
    else {
      all.x.push(x);
      all.y.push(y);
      all.nx.push(Math.cos(a));
      all.ny.push(Math.sin(a));
      all.ox.push(Math.cos(a));
      all.oy.push(Math.sin(a));
    }
  }
  const outerCount = all.x.length;
  if (inner > 0) {
    // Inner arc, a1 → a0 (normals toward the center).
    for (let k = n; k >= 0; k--) {
      const a = a0 + ((a1 - a0) * k) / n;
      const [x, y] = at(inner, a);
      const inward: [number, number] = [-Math.cos(a), -Math.sin(a)];
      if (k === n) sharpCorner(all, x, y, endN, inward);
      else if (k === 0) sharpCorner(all, x, y, inward, startN);
      else {
        all.x.push(x);
        all.y.push(y);
        all.nx.push(inward[0]);
        all.ny.push(inward[1]);
        all.ox.push(inward[0]);
        all.oy.push(inward[1]);
      }
    }
  } else {
    sharpCorner(all, cx, cy, endN, startN);
  }
  // Cap: a strip between the outer arc and the inner arc (or a fan to the center).
  const cap: number[] = [];
  const total = all.x.length;
  if (inner > 0) {
    // Outer index i pairs with the inner point at the same angle (walking back from the end).
    const outerAt = (k: number) => (k === 0 ? 0 : k === n ? outerCount - 1 : k + 1);
    const innerAt = (k: number) => (k === n ? outerCount : k === 0 ? total - 1 : total - 2 - k);
    for (let k = 0; k < n; k++) {
      const o0 = outerAt(k);
      const o1 = outerAt(k + 1);
      const i0 = innerAt(k);
      const i1 = innerAt(k + 1);
      cap.push(o0, o1, i1, o0, i1, i0);
    }
  } else {
    const center = total - 1;
    for (let k = 0; k < n; k++) {
      const o0 = k === 0 ? 0 : k + 1;
      const o1 = k + 1 === n ? outerCount - 1 : k + 2;
      cap.push(center, o0, o1);
    }
  }
  return { ...all, cap };
}

/**
 * A simple polygon (flat `[x0, y0, x1, y1, …]`, either orientation) with sharp corners; `cap`:
 * its triangulation (indices of the polygon's points, e.g. from earcut), default a fan (convex).
 */
export function polygonOutline(points: readonly number[], cap?: readonly number[]): Outline {
  const n = Math.floor(points.length / 2);
  if (n < 3) return { x: [], y: [], nx: [], ny: [], ox: [], oy: [] };
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i * 2]! * points[j * 2 + 1]! - points[j * 2]! * points[i * 2 + 1]!;
  }
  const order = [...Array(n).keys()];
  if (area < 0) order.reverse();
  const px = (k: number) => points[order[(k + n) % n]! * 2]!;
  const py = (k: number) => points[order[(k + n) % n]! * 2 + 1]!;
  const all = {
    x: [] as number[],
    y: [] as number[],
    nx: [] as number[],
    ny: [] as number[],
    ox: [] as number[],
    oy: [] as number[],
  };
  for (let k = 0; k < n; k++) {
    const before = edgeNormal(px(k - 1), py(k - 1), px(k), py(k));
    const after = edgeNormal(px(k), py(k), px(k + 1), py(k + 1));
    sharpCorner(all, px(k), py(k), before, after);
  }
  if (!cap) return all;
  // Cap indices refer to input points: map them to the first copy of each (reordered) corner,
  // and turn every triangle counter-clockwise.
  const slot = new Map(order.map((input, k) => [input, k * 2]));
  const tris: number[] = [];
  for (let t = 0; t + 2 < cap.length; t += 3) {
    const [a, b, c] = [cap[t]!, cap[t + 1]!, cap[t + 2]!].map((i) => slot.get(i) ?? 0) as [
      number,
      number,
      number,
    ];
    const cross =
      (all.x[b]! - all.x[a]!) * (all.y[c]! - all.y[a]!) -
      (all.y[b]! - all.y[a]!) * (all.x[c]! - all.x[a]!);
    if (cross >= 0) tris.push(a, b, c);
    else tris.push(a, c, b);
  }
  return { ...all, cap: tris };
}

/**
 * Extrude `outline` from `z0` to `z1` into `out` (see the module comment): walls, a bevel of
 * radius `bevel` in `segments` rings (clamp it with {@link clampBevel} first), and both caps.
 */
export function extrudeOutline(
  out: PrismBuffers,
  outline: Outline,
  z0: number,
  z1: number,
  bevel: number,
  segments: number,
  item: number,
): void {
  const n = outline.x.length;
  if (n < 3 || !(z1 > z0)) return;
  const b = Math.max(0, Math.min(bevel, z1 - z0));
  const steps = b > 0 ? Math.max(1, Math.round(segments)) : 0;
  const { x, y, nx, ny, ox, oy } = outline;
  const ring = (z: number, inset: number, cos: number, sin: number): number => {
    const first = out.vertexCount;
    for (let i = 0; i < n; i++) {
      out.vertex(
        x[i]! - ox[i]! * inset,
        y[i]! - oy[i]! * inset,
        z,
        nx[i]! * cos,
        ny[i]! * cos,
        sin,
        item,
      );
    }
    return first;
  };
  const band = (a: number, c: number): void => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.triangle(a + i, a + j, c + j);
      out.triangle(a + i, c + j, c + i);
    }
  };
  // Walls: from the back up to where the bevel starts.
  let lower = ring(z0, 0, 1, 0);
  for (let k = 0; k <= steps; k++) {
    // Exact at the ends: the walls' top (k = 0) and the front (k = steps: fully inset, at z1).
    const t = steps === 0 ? 0 : (k / steps) * (Math.PI / 2);
    const cos = k === steps && steps > 0 ? 0 : Math.cos(t);
    const sin = k === steps && steps > 0 ? 1 : Math.sin(t);
    const upper = ring(z1 - b + b * sin, b * (1 - cos), cos, sin);
    band(lower, upper);
    lower = upper;
  }
  // Front cap: the last ring, facing +z (its own vertices without a bevel: the walls' normals
  // are horizontal there).
  const front = steps > 0 ? lower : ring(z1, 0, 0, 1);
  const back = ring(z0, 0, 0, -1);
  const cap = outline.cap;
  if (cap) {
    for (let t = 0; t + 2 < cap.length; t += 3) {
      out.triangle(front + cap[t]!, front + cap[t + 1]!, front + cap[t + 2]!);
      out.triangle(back + cap[t]!, back + cap[t + 2]!, back + cap[t + 1]!);
    }
  } else {
    for (let i = 1; i + 1 < n; i++) {
      out.triangle(front, front + i, front + i + 1);
      out.triangle(back, back + i + 1, back + i);
    }
  }
}

/** Vertices of one rect prism with a bevel of `segments` (> 0) or none (0). */
export function rectPrismVertexCount(segments: number): number {
  // Outline: 4 · (s + 1) points (sharp: 8); rings: back, s + 1 bevel rings, back cap.
  if (segments <= 0) return 8 * 4;
  const s = Math.max(1, Math.round(segments));
  return 4 * (s + 1) * (s + 3);
}
