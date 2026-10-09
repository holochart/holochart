/**
 * Geometry of `graph3d` (backlog G6): how sizes map to the scene, which links are drawn, the path
 * of every link, the links as one gapped polyline, the tubes and arrowheads as one triangle mesh,
 * and the outlines of the planes of a layered arrangement. Pure: typed arrays in and out, no
 * three.js.
 *
 * - **Paths** ({@link linkPaths}) are in scene units (world), so a curve keeps its shape whatever
 *   the axis scales. A link is the straight segment between its two nodes (two points); with a
 *   curvature (`link.curve`, or the fan of the links between the same two nodes) a quadratic
 *   curve that bows sideways; from a node to itself a ring beside the node.
 * - **Lines** ({@link linkLines}): the points of every path and a gap, so a GPU pick on the line
 *   names a vertex and the vertex names the link.
 * - **Tubes** sweep a circle of {@link SEGMENTS} vertices along the path, one ring per point, with
 *   radial normals: a straight link is a cylinder of two rings. They have no caps: an end is
 *   inside its node's sphere, or closed by the base of an arrowhead.
 * - **Arrowheads** are cones whose tip is where the path meets the surface of the node they point
 *   at; a tube stops at the cone's base. A link too short for its head gets a shorter one.
 *
 * `scatter3d`'s tube mesh (`traces-3d`, `line-mesh.ts`) sweeps one radius along one polyline; a
 * graph needs a radius per link and ends cut at the nodes, which is why the tubes are built here.
 */
import type { ColorInput, DataTransform, Vec3 } from '@mk7s/holochart-render';
import type { Graph3dCalc, Graph3dPlanes } from './calc.ts';

/** Vertices around a tube or a cone. */
export const SEGMENTS = 8;
/** Radius of an arrowhead's base, as a share of its length. */
export const ARROW_ASPECT = 0.35;
/** Segments a curved link is drawn with, and a self-link's ring. */
export const CURVE_SEGMENTS = 16;
export const LOOP_SEGMENTS = 24;

/**
 * Scene units (world) per size unit. Sizes are CSS px at the middle of the scene as it is first
 * seen: a view that spans `span` scene units over `height` px shows one px as `span / height`
 * units there. What is sized with it is an object in the scene from then on, larger near the
 * camera and growing as the camera comes closer.
 */
export function sizeUnit(span: number, height: number): number {
  return span > 0 && height > 0 ? span / height : 0;
}

/** The kept links that are drawn: those whose two ends are drawn (self-links among them). */
export function drawnLinks3d(calc: Graph3dCalc): Int32Array {
  const { model, hidden } = calc;
  const out = new Int32Array(model.links);
  let count = 0;
  for (let k = 0; k < model.links; k++) {
    if (hidden[model.source[k]!] === 1 || hidden[model.target[k]!] === 1) continue;
    out[count++] = k;
  }
  return out.subarray(0, count);
}

/** What {@link linkPaths} builds from: everything in scene units. */
export interface LinkPathInput {
  /** Node centers. */
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  /** Node radii (a self-link's ring is sized by its node). */
  readonly radius: ArrayLike<number>;
  readonly source: Int32Array;
  readonly target: Int32Array;
  /** The kept links to build (see {@link drawnLinks3d}). */
  readonly drawn: Int32Array;
  /** Curvature by kept link: how far it bows out, as a share of its length. Unset: straight. */
  readonly curve?: ArrayLike<number> | undefined;
  /** By kept link: which of its node's self-links it is, from 0; -1 for any other link. */
  readonly loop?: ArrayLike<number> | undefined;
  /** How far a self-link reaches beyond its node at least, and the step of every further one. */
  readonly loopReach?: number | undefined;
  readonly loopStep?: number | undefined;
}

/** The paths of the drawn links (see the module comment). */
export interface LinkPaths {
  /** `x, y, z` of every point, path after path. */
  readonly points: Float64Array;
  /** The points of the `j`-th drawn link are `offsets[j] … offsets[j + 1]`. */
  readonly offsets: Uint32Array;
  /** The kept link of every path. */
  readonly drawn: Int32Array;
}

/**
 * The unit vector to the left of direction `d` for someone who looks down the z axis; for a
 * direction along z, along y. It turns around with `d`, so two opposite links with the same
 * curvature bow to opposite sides.
 */
function leftOf(dx: number, dy: number, dz: number, out: Float64Array): void {
  const flat = Math.hypot(dx, dy);
  if (flat > 1e-6 * Math.abs(dz)) {
    out[0] = -dy / flat;
    out[1] = dx / flat;
  } else {
    out[0] = 0;
    out[1] = dz > 0 ? -1 : 1;
  }
  out[2] = 0;
}

/**
 * Where the self-links of every node that has one point: away from the node's neighbours (the sum
 * of the unit vectors to them, turned around), up the z axis for a node without any.
 */
function loopDirections(input: LinkPathInput): Map<number, Vec3> {
  const { source, target, drawn, x, y, z } = input;
  const out = new Map<number, Vec3>();
  for (const k of drawn) if (source[k] === target[k]) out.set(source[k]!, [0, 0, 0]);
  if (out.size === 0) return out;
  for (const k of drawn) {
    const a = source[k]!;
    const b = target[k]!;
    if (a === b) continue;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const dz = z[b]! - z[a]!;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 0)) continue;
    const from = out.get(a);
    if (from) {
      from[0] -= dx / length;
      from[1] -= dy / length;
      from[2] -= dz / length;
    }
    const to = out.get(b);
    if (to) {
      to[0] += dx / length;
      to[1] += dy / length;
      to[2] += dz / length;
    }
  }
  for (const d of out.values()) {
    const length = Math.hypot(d[0], d[1], d[2]);
    if (length > 1e-6) {
      d[0] /= length;
      d[1] /= length;
      d[2] /= length;
    } else {
      d[0] = d[1] = 0;
      d[2] = 1;
    }
  }
  return out;
}

export function linkPaths(input: LinkPathInput): LinkPaths {
  const { drawn, source, target, curve, loop } = input;
  const m = drawn.length;
  const offsets = new Uint32Array(m + 1);
  const bowed = (k: number): boolean => {
    const c = curve?.[k];
    return c !== undefined && c !== 0 && Number.isFinite(c);
  };
  for (let j = 0; j < m; j++) {
    const k = drawn[j]!;
    const count = source[k] === target[k] ? LOOP_SEGMENTS + 1 : bowed(k) ? CURVE_SEGMENTS + 1 : 2;
    offsets[j + 1] = offsets[j]! + count;
  }
  const points = new Float64Array(3 * offsets[m]!);
  const directions = loopDirections(input);
  const reach = input.loopReach ?? 0;
  const step = input.loopStep ?? 0;
  const side = new Float64Array(3);
  for (let j = 0; j < m; j++) {
    const k = drawn[j]!;
    const a = source[k]!;
    const b = target[k]!;
    const ax = input.x[a]!;
    const ay = input.y[a]!;
    const az = input.z[a]!;
    let at = 3 * offsets[j]!;
    if (a === b) {
      // A ring through the node's center, in the plane of its direction and of what is to the
      // left of it: its far side is the node's radius and the reach away from the center.
      const d = directions.get(a)!;
      leftOf(d[0], d[1], d[2], side);
      const r = input.radius[a]!;
      const rho = (r + Math.max(reach, r) + step * Math.max(0, loop?.[k] ?? 0)) / 2;
      for (let s = 0; s <= LOOP_SEGMENTS; s++) {
        const angle = (2 * Math.PI * s) / LOOP_SEGMENTS;
        const along = rho * (1 - Math.cos(angle));
        const across = rho * Math.sin(angle);
        points[at++] = ax + along * d[0] + across * side[0]!;
        points[at++] = ay + along * d[1] + across * side[1]!;
        points[at++] = az + along * d[2] + across * side[2]!;
      }
      continue;
    }
    const bx = input.x[b]!;
    const by = input.y[b]!;
    const bz = input.z[b]!;
    if (!bowed(k)) {
      points.set([ax, ay, az, bx, by, bz], at);
      continue;
    }
    // A quadratic curve: its apex is half as far from the chord as its control point.
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    leftOf(bx - ax, by - ay, bz - az, side);
    const reachOut = 2 * curve![k]! * length;
    const cx = (ax + bx) / 2 + reachOut * side[0]!;
    const cy = (ay + by) / 2 + reachOut * side[1]!;
    const cz = (az + bz) / 2 + reachOut * side[2]!;
    for (let s = 0; s <= CURVE_SEGMENTS; s++) {
      const t = s / CURVE_SEGMENTS;
      const wa = (1 - t) * (1 - t);
      const wc = 2 * t * (1 - t);
      const wb = t * t;
      points[at++] = wa * ax + wc * cx + wb * bx;
      points[at++] = wa * ay + wc * cy + wb * by;
      points[at++] = wa * az + wc * cz + wb * bz;
    }
  }
  return { points, offsets, drawn };
}

/**
 * The middle of the `j`-th path: for a curve its apex, for a ring its far side, for a straight
 * link the point halfway.
 */
export function pathMiddle(paths: LinkPaths, j: number): Vec3 {
  const from = paths.offsets[j]!;
  const count = paths.offsets[j + 1]! - from;
  const lo = 3 * (from + ((count - 1) >> 1));
  const hi = 3 * (from + (count >> 1));
  const p = paths.points;
  return [(p[lo]! + p[hi]!) / 2, (p[lo + 1]! + p[hi + 1]!) / 2, (p[lo + 2]! + p[hi + 2]!) / 2];
}

/** The paths a view drew for a calc, and the scene transform they were built for. */
const DRAWN = new WeakMap<
  Graph3dCalc,
  { readonly paths: LinkPaths; readonly transform: Required<DataTransform>; at?: Int32Array }
>();

/** Keep the paths the view drew for `calc`, for hover (see {@link drawnLinkMiddle}). */
export function keepLinkPaths(
  calc: Graph3dCalc,
  paths: LinkPaths,
  transform: Required<DataTransform>,
): void {
  DRAWN.set(calc, { paths, transform: { ...transform } });
}

/**
 * The middle of kept link `k` as it is drawn, in linear coordinates: where its hover label points.
 * `undefined` when the link is not drawn (or nothing was drawn yet for `calc`).
 */
export function drawnLinkMiddle(calc: Graph3dCalc, k: number): Vec3 | undefined {
  const kept = DRAWN.get(calc);
  if (!kept) return undefined;
  if (!kept.at) {
    kept.at = new Int32Array(calc.model.links).fill(-1);
    kept.paths.drawn.forEach((link, j) => (kept.at![link] = j));
  }
  const j = kept.at[k];
  if (j === undefined || j < 0) return undefined;
  const w = pathMiddle(kept.paths, j);
  const t = kept.transform;
  return [
    (w[0] - t.offsetX) / t.scaleX,
    (w[1] - t.offsetY) / t.scaleY,
    (w[2] - t.offsetZ) / t.scaleZ,
  ];
}

/** The links as one polyline with gaps (see the module comment). */
export interface LinkLines {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** The kept link of every vertex. */
  readonly link: Int32Array;
}

/**
 * The paths as one polyline with a gap after every link, in the linear coordinates that
 * `transform` takes to the paths' scene units (unset: as they are).
 */
export function linkLines(paths: LinkPaths, transform?: Required<DataTransform>): LinkLines {
  const { points, offsets, drawn } = paths;
  const m = drawn.length;
  const total = offsets[m]! + m;
  const x = new Float64Array(total);
  const y = new Float64Array(total);
  const z = new Float64Array(total);
  const link = new Int32Array(total);
  const t = transform;
  const [sx, sy, sz] = t ? [t.scaleX, t.scaleY, t.scaleZ] : [1, 1, 1];
  const [ox, oy, oz] = t ? [t.offsetX, t.offsetY, t.offsetZ] : [0, 0, 0];
  let v = 0;
  for (let j = 0; j < m; j++) {
    const k = drawn[j]!;
    for (let p = offsets[j]!; p < offsets[j + 1]!; p++, v++) {
      x[v] = (points[3 * p]! - ox) / sx;
      y[v] = (points[3 * p + 1]! - oy) / sy;
      z[v] = (points[3 * p + 2]! - oz) / sz;
      link[v] = k;
    }
    x[v] = y[v] = z[v] = NaN;
    link[v++] = k;
  }
  return { x, y, z, link };
}

/** What {@link linkMesh} builds from: everything in scene units. */
export interface LinkMeshInput {
  /** The paths of the links to build. */
  readonly paths: LinkPaths;
  /** Node centers and radii: an arrowhead's tip is on the surface of its node. */
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  readonly radius: ArrayLike<number>;
  readonly source: Int32Array;
  readonly target: Int32Array;
  /** Tube radius by kept link; `undefined`: no tubes (the links are lines). */
  readonly tube?: ArrayLike<number> | undefined;
  /** Arrowheads: at which ends, and their length by kept link. `undefined`: none. */
  readonly arrows?:
    | { readonly start: boolean; readonly end: boolean; readonly length: ArrayLike<number> }
    | undefined;
  /** One sRGB color, or 4 floats per kept link. */
  readonly color: ColorInput;
}

/** An indexed triangle mesh in scene units, relative to `origin`. */
export interface LinkMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  /** sRGB RGBA per vertex. */
  readonly colors: Float32Array;
  /** The kept link of every vertex. */
  readonly link: Int32Array;
  readonly origin: Vec3;
}

/** A polyline that is cut at its ends: `n` points in `p` (`x, y, z` each). */
interface Cut {
  readonly p: Float64Array;
  n: number;
}

function reverse(cut: Cut): void {
  const { p, n } = cut;
  for (let i = 0, j = n - 1; i < j; i++, j--) {
    for (let c = 0; c < 3; c++) {
      const t = p[3 * i + c]!;
      p[3 * i + c] = p[3 * j + c]!;
      p[3 * j + c] = t;
    }
  }
}

/**
 * Cut the end of a polyline where it last enters the sphere of radius `r` around `(cx, cy, cz)`:
 * its last point is then on the sphere. Nothing is left of a polyline that is all inside.
 */
function cutAtSphere(cut: Cut, cx: number, cy: number, cz: number, r: number): void {
  const { p } = cut;
  let i = cut.n - 1;
  const outside = (v: number): boolean =>
    Math.hypot(p[3 * v]! - cx, p[3 * v + 1]! - cy, p[3 * v + 2]! - cz) > r;
  while (i >= 0 && !outside(i)) i--;
  if (i < 0) {
    cut.n = 0;
    return;
  }
  if (i === cut.n - 1) return;
  // Between point i (outside) and the next (inside): where the segment is `r` from the center.
  const px = p[3 * i]! - cx;
  const py = p[3 * i + 1]! - cy;
  const pz = p[3 * i + 2]! - cz;
  const dx = p[3 * i + 3]! - p[3 * i]!;
  const dy = p[3 * i + 4]! - p[3 * i + 1]!;
  const dz = p[3 * i + 5]! - p[3 * i + 2]!;
  const a = dx * dx + dy * dy + dz * dz;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - r * r;
  const root = Math.sqrt(Math.max(0, b * b - a * c));
  const t = a > 0 ? Math.min(1, Math.max(0, (-b - root) / a)) : 0;
  p[3 * i + 3] = p[3 * i]! + dx * t;
  p[3 * i + 4] = p[3 * i + 1]! + dy * t;
  p[3 * i + 5] = p[3 * i + 2]! + dz * t;
  cut.n = i + 2;
}

function lengthOf(cut: Cut): number {
  const { p, n } = cut;
  let sum = 0;
  for (let i = 1; i < n; i++) {
    sum += Math.hypot(
      p[3 * i]! - p[3 * i - 3]!,
      p[3 * i + 1]! - p[3 * i - 2]!,
      p[3 * i + 2]! - p[3 * i - 1]!,
    );
  }
  return sum;
}

/**
 * Take `length` off the end of a polyline. One no longer than that is left with its first point
 * alone.
 */
function shorten(cut: Cut, length: number): void {
  const { p } = cut;
  let left = length;
  for (let i = cut.n - 1; i > 0; i--) {
    const dx = p[3 * i]! - p[3 * i - 3]!;
    const dy = p[3 * i + 1]! - p[3 * i - 2]!;
    const dz = p[3 * i + 2]! - p[3 * i - 1]!;
    const segment = Math.hypot(dx, dy, dz);
    if (segment > left) {
      const t = left / segment;
      p[3 * i] = p[3 * i]! - dx * t;
      p[3 * i + 1] = p[3 * i + 1]! - dy * t;
      p[3 * i + 2] = p[3 * i + 2]! - dz * t;
      cut.n = i + 1;
      return;
    }
    left -= segment;
  }
  cut.n = Math.min(cut.n, 1);
}

/** Two unit vectors that span the plane normal to the unit vector `d`: `(u, v, d)` is right-handed. */
function frame(dx: number, dy: number, dz: number, u: Float64Array, v: Float64Array): void {
  const least =
    Math.abs(dx) <= Math.abs(dy) && Math.abs(dx) <= Math.abs(dz)
      ? 0
      : Math.abs(dy) <= Math.abs(dz)
        ? 1
        : 2;
  const ex = least === 0 ? 1 : 0;
  const ey = least === 1 ? 1 : 0;
  const ez = least === 2 ? 1 : 0;
  const ux = dy * ez - dz * ey;
  const uy = dz * ex - dx * ez;
  const uz = dx * ey - dy * ex;
  const ul = Math.hypot(ux, uy, uz);
  u[0] = ux / ul;
  u[1] = uy / ul;
  u[2] = uz / ul;
  v[0] = dy * u[2] - dz * u[1];
  v[1] = dz * u[0] - dx * u[2];
  v[2] = dx * u[1] - dy * u[0];
}

/** Tubes and arrowheads of the drawn links (see the module comment). */
export function linkMesh(input: LinkMeshInput): LinkMesh {
  const { paths, tube, arrows } = input;
  const { drawn, offsets } = paths;
  const S = SEGMENTS;
  const heads = arrows ? (arrows.start ? 1 : 0) + (arrows.end ? 1 : 0) : 0;
  const points = offsets[drawn.length]!;
  // A cut path has no more points than the path it was cut from.
  const most = (tube ? S * points : 0) + heads * (3 * S + 1) * drawn.length;
  const world = new Float64Array(3 * most);
  const normals = new Float32Array(3 * most);
  const colors = new Float32Array(4 * most);
  const link = new Int32Array(most);
  const indices = new Uint32Array(
    (tube ? 6 * S * (points - drawn.length) : 0) + heads * 6 * S * drawn.length,
  );
  let nv = 0;
  let ni = 0;
  const color = [0, 0, 0, 1];
  let k = 0;

  const vertex = (
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
  ): number => {
    world[3 * nv] = px;
    world[3 * nv + 1] = py;
    world[3 * nv + 2] = pz;
    normals[3 * nv] = nx;
    normals[3 * nv + 1] = ny;
    normals[3 * nv + 2] = nz;
    colors.set(color, 4 * nv);
    link[nv] = k;
    return nv++;
  };
  const cos = new Float64Array(S);
  const sin = new Float64Array(S);
  for (let s = 0; s < S; s++) {
    cos[s] = Math.cos((2 * Math.PI * s) / S);
    sin[s] = Math.sin((2 * Math.PI * s) / S);
  }
  const u = new Float64Array(3);
  const v = new Float64Array(3);

  /** A tube of radius `r` along a polyline: one ring per point, the frame carried along. */
  const sweep = ({ p, n }: Cut, r: number): void => {
    const first = nv;
    for (let i = 0; i < n; i++) {
      const before = 3 * Math.max(0, i - 1);
      const after = 3 * Math.min(n - 1, i + 1);
      let dx = p[after]! - p[before]!;
      let dy = p[after + 1]! - p[before + 1]!;
      let dz = p[after + 2]! - p[before + 2]!;
      const length = Math.hypot(dx, dy, dz);
      dx /= length;
      dy /= length;
      dz /= length;
      // The frame of the ring before, turned into the plane this tangent is normal to.
      const along = u[0]! * dx + u[1]! * dy + u[2]! * dz;
      const ux = u[0]! - along * dx;
      const uy = u[1]! - along * dy;
      const uz = u[2]! - along * dz;
      const ul = Math.hypot(ux, uy, uz);
      if (i === 0 || !(ul > 1e-6)) frame(dx, dy, dz, u, v);
      else {
        u[0] = ux / ul;
        u[1] = uy / ul;
        u[2] = uz / ul;
        v[0] = dy * u[2] - dz * u[1];
        v[1] = dz * u[0] - dx * u[2];
        v[2] = dx * u[1] - dy * u[0];
      }
      for (let s = 0; s < S; s++) {
        const nx = cos[s]! * u[0]! + sin[s]! * v[0]!;
        const ny = cos[s]! * u[1]! + sin[s]! * v[1]!;
        const nz = cos[s]! * u[2]! + sin[s]! * v[2]!;
        vertex(p[3 * i]! + r * nx, p[3 * i + 1]! + r * ny, p[3 * i + 2]! + r * nz, nx, ny, nz);
      }
    }
    for (let i = 0; i + 1 < n; i++) {
      for (let s = 0; s < S; s++) {
        const s1 = (s + 1) % S;
        const r0 = first + S * i + s;
        const r1 = r0 + S;
        // Counter-clockwise seen from outside ((u, v, d) is right-handed).
        indices.set(
          [r0, first + S * i + s1, r1, r1, first + S * i + s1, first + S * (i + 1) + s1],
          ni,
        );
        ni += 6;
      }
    }
  };

  /** A cone `length` long (which sets how wide it is) from the middle of its base to its tip. */
  const cone = (at: Float64Array, o: number, length: number): void => {
    const [bx, by, bz, tx, ty, tz] = [
      at[o]!,
      at[o + 1]!,
      at[o + 2]!,
      at[o + 3]!,
      at[o + 4]!,
      at[o + 5]!,
    ];
    let dx = tx - bx;
    let dy = ty - by;
    let dz = tz - bz;
    const along = Math.hypot(dx, dy, dz);
    if (!(along > 0)) return;
    dx /= along;
    dy /= along;
    dz /= along;
    frame(dx, dy, dz, u, v);
    const base = length * ARROW_ASPECT;
    // The slant of the cone's side: its normal leans this far toward the tip.
    const slant = Math.hypot(length, base);
    const nr = length / slant;
    const nd = base / slant;
    const first = nv;
    for (let s = 0; s < S; s++) {
      const rx = cos[s]! * u[0]! + sin[s]! * v[0]!;
      const ry = cos[s]! * u[1]! + sin[s]! * v[1]!;
      const rz = cos[s]! * u[2]! + sin[s]! * v[2]!;
      const nx = nr * rx + nd * dx;
      const ny = nr * ry + nd * dy;
      const nz = nr * rz + nd * dz;
      // Side: a base vertex and its own tip vertex (the same normal along the slant).
      vertex(bx + base * rx, by + base * ry, bz + base * rz, nx, ny, nz);
      vertex(tx, ty, tz, nx, ny, nz);
    }
    const center = vertex(bx, by, bz, -dx, -dy, -dz);
    const cap = nv;
    for (let s = 0; s < S; s++) {
      const rx = cos[s]! * u[0]! + sin[s]! * v[0]!;
      const ry = cos[s]! * u[1]! + sin[s]! * v[1]!;
      const rz = cos[s]! * u[2]! + sin[s]! * v[2]!;
      vertex(bx + base * rx, by + base * ry, bz + base * rz, -dx, -dy, -dz);
    }
    for (let s = 0; s < S; s++) {
      const s1 = (s + 1) % S;
      const b0 = first + 2 * s;
      const b1 = first + 2 * s1;
      indices.set([b0, b1, b0 + 1], ni);
      indices.set([center, cap + s1, cap + s], ni + 3);
      ni += 6;
    }
  };

  let longest = 0;
  for (let j = 0; j < drawn.length; j++) longest = Math.max(longest, offsets[j + 1]! - offsets[j]!);
  const cut: Cut = { p: new Float64Array(3 * longest), n: 0 };
  // The heads of a link, each as the middle of its base and its tip: at the start, at the end.
  const cones = new Float64Array(12);
  /** Cut a head's length off the end of the path: its tip is the end, its base the new end. */
  const takeHead = (o: number, length: number): void => {
    cones.set(cut.p.subarray(3 * cut.n - 3, 3 * cut.n), o + 3);
    shorten(cut, length);
    cones.set(cut.p.subarray(3 * cut.n - 3, 3 * cut.n), o);
  };

  for (let j = 0; j < drawn.length; j++) {
    k = drawn[j]!;
    const a = input.source[k]!;
    const b = input.target[k]!;
    cut.n = offsets[j + 1]! - offsets[j]!;
    cut.p.set(paths.points.subarray(3 * offsets[j]!, 3 * offsets[j + 1]!));
    const whole = lengthOf(cut);
    if (!(whole > 0)) continue;
    if (input.color instanceof Float32Array) {
      for (let c = 0; c < 4; c++) color[c] = input.color[4 * k + c] ?? 1;
    } else for (let c = 0; c < 4; c++) color[c] = input.color[c]!;

    // The path is cut where a head's tip is (on its node's surface), then by the head itself.
    let head = 0;
    if (arrows) {
      if (arrows.end) cutAtSphere(cut, input.x[b]!, input.y[b]!, input.z[b]!, input.radius[b]!);
      if (arrows.start && cut.n > 0) {
        reverse(cut);
        cutAtSphere(cut, input.x[a]!, input.y[a]!, input.z[a]!, input.radius[a]!);
        reverse(cut);
      }
      // Nothing shows of a link that is all inside a node.
      if (cut.n === 0) continue;
      head = Math.min(arrows.length[k]!, lengthOf(cut) / heads);
      if (head > 0) {
        if (arrows.end) takeHead(6, head);
        if (arrows.start) {
          reverse(cut);
          takeHead(0, head);
          reverse(cut);
        }
      }
    }
    if (tube && cut.n > 1 && lengthOf(cut) > 1e-9 * whole) sweep(cut, tube[k]!);
    if (head > 0 && arrows?.start) cone(cones, 0, head);
    if (head > 0 && arrows?.end) cone(cones, 6, head);
  }

  // Relative to the middle of the box, so float32 keeps its precision.
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) {
    for (let c = 0; c < 3; c++) {
      const w = world[3 * i + c]!;
      if (w < lo[c]!) lo[c] = w;
      if (w > hi[c]!) hi[c] = w;
    }
  }
  const origin: Vec3 =
    nv > 0 ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] : [0, 0, 0];
  const positions = new Float32Array(3 * nv);
  for (let i = 0; i < 3 * nv; i++) positions[i] = world[i]! - origin[i % 3]!;
  return {
    positions,
    normals: normals.slice(0, 3 * nv),
    indices: indices.slice(0, ni),
    colors: colors.slice(0, 4 * nv),
    link: link.slice(0, nv),
    origin,
  };
}

/**
 * The outlines of the planes of a layered arrangement: one rectangle per plane, all the same size
 * (the extent of the drawn nodes along the two other axes, with a margin), as one polyline with
 * gaps in linear coordinates. `undefined` when there is nothing to outline.
 */
export function planeOutlines(
  calc: Pick<Graph3dCalc, 'x' | 'y' | 'z'>,
  planes: Graph3dPlanes,
  margin = 0.08,
): { x: Float64Array; y: Float64Array; z: Float64Array } | undefined {
  const coords = [calc.x, calc.y, calc.z];
  const e = (planes.axis + 1) % 3;
  const f = (planes.axis + 2) % 3;
  const box = [e, f].map((d) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of coords[d]!) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi] as const;
  });
  if (planes.at.length === 0 || box.some(([lo, hi]) => !(lo <= hi))) return undefined;
  const pad = margin * Math.max(box[0]![1] - box[0]![0], box[1]![1] - box[1]![0], 1);
  const [e0, e1] = [box[0]![0] - pad, box[0]![1] + pad];
  const [f0, f1] = [box[1]![0] - pad, box[1]![1] + pad];
  const count = planes.at.length;
  const out = [0, 1, 2].map(() => new Float64Array(6 * count));
  const corners = [
    [e0, f0],
    [e1, f0],
    [e1, f1],
    [e0, f1],
    [e0, f0],
    [NaN, NaN],
  ] as const;
  for (let r = 0; r < count; r++) {
    corners.forEach(([ce, cf], c) => {
      const v = 6 * r + c;
      out[planes.axis]![v] = c === 5 ? NaN : planes.at[r]!;
      out[e]![v] = ce;
      out[f]![v] = cf;
    });
  }
  return { x: out[0]!, y: out[1]!, z: out[2]! };
}
