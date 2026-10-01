/**
 * Domain traces in 2.5D (plan E8.9, E9.12): pie slices and treemap / icicle tiles as lit prisms,
 * seen through the trace's own tilted camera. Part of render's lazily loaded 2.5D chunk; the full
 * bundle's domain-trace wrapper (`@mk7s/holochart`, `view3d/domain.ts`) calls in through
 * `extrudeDomain` (`extrusion-loader.ts`) and the `domain*` functions below.
 *
 * ## The view
 *
 * A domain trace has no axes and draws in the figure's overlay viewport, which other traces and the
 * figure's components share, so its camera can't be the viewport's. Each trace sees itself through
 * a camera of its own instead: the 2.5D view's camera (`view3d-camera.ts`) with the trace's domain
 * rect as the plane — `tilt` (degrees) and `perspective` (0 parallel, 1 strong) from the trace, no
 * azimuth (a pie turns with its own `rotation`). Tilt 0 draws the plane where the flat trace is;
 * a positive tilt lays the trace back like a pie on a table seen from the front: its near (bottom)
 * edge comes toward the eye and the fronts of its prisms show.
 *
 * The camera is applied on the CPU: prism vertices are projected to the overlay's px (their depth
 * mapped behind the overlay's plane, so legends and annotations draw over them), while normals stay
 * in the plane's frame — the light rig is fixed to the trace, as in the 2.5D view of cartesian
 * subplots: faces toward the plane's normal (slice and tile tops) show their exact color at any
 * tilt. Prisms are opaque (translucent colors are composited first, {@link over}), so they sort by
 * depth.
 *
 * ## What is drawn
 *
 * The trace view draws as usual; its primitives are captured as it adds them
 * ({@link domainCapture}) and their updates intercepted (so drill-down transitions, hover outlines
 * and uniform-text refreshes follow):
 *
 * - **Shapes** — arcs (pie slices) and rects (tiles) — become prisms of one extrusion primitive
 *   (`prisms`), the flat primitive hidden while the trace is in 2.5D. Arc outlines (`marker.line`)
 *   become gaps of the line width between slices; rect outlines likewise between tiles. A rect
 *   inside an earlier one (a treemap tile in its parent) stands on the parent's top, so a treemap
 *   rises in terraces, one per level.
 * - **Text, lines and fills** (labels, leader lines, the path bar) are projected: each point onto
 *   the top of the shape it lies on (else the nearest shape's), so labels sit on the top faces,
 *   upright and unscaled — and in depth, so a prism in front of a label hides it.
 *
 * `depth` is px, a percentage of each shape's size (`'20%'`: of a slice's radius, of a tile's
 * smaller side) or one number per item (`items`: per slice, the data index of its first point; per
 * tile, its node's). With `tilt` and no depth the shapes are drawn as flat caps.
 *
 * ## Pointer
 *
 * {@link domainHover}, {@link domainKeyboard} and {@link domainPointer} map the pointer onto the
 * flat trace: the ray from the eye through the pointer is tested against every prism exactly (top
 * faces and walls), and the point hit is moved inside that shape's flat footprint — so the trace's
 * own hit tests (slices, tiles, path bar) pick what is drawn under the pointer. Hover labels are
 * placed where the tilted trace draws their anchors.
 */
import { Color, SRGBColorSpace, Vector4 } from 'three';
import type { ViewportRect } from '../core/viewport.ts';
import type { Primitive, PrimitiveContext, RGBA, ViewportSize } from '../types.ts';
import {
  createExtrusionPrimitive,
  extrusionMaterialSpec,
  type ExtrusionData,
  type ExtrusionPrimitive,
} from './extrusion.ts';
import {
  clampBevel,
  extrudeOutline,
  rectOutline,
  sectorOutline,
  type Outline,
  type PrismBuffers,
} from './extrusion-geometry.ts';
import type { MeshModule } from './mesh-loader.ts';
import { view3dCamera, view3dRay, type View3DCamera } from './view3d-camera.ts';

/** What {@link syncDomain} reads from a trace's plot context (the runtime's fits). */
export interface DomainHost {
  readonly primitives: PrimitiveContext;
  readonly trace: Readonly<Record<string, unknown>>;
  readonly calc: unknown;
  /** `paper_bgcolor`: translucent shapes are drawn composited over it. */
  readonly fullLayout?: { readonly paper_bgcolor?: unknown } | undefined;
  /** The trace's domain; container px. */
  readonly domain?: { readonly rect: Readonly<ViewportRect> } | undefined;
  /** The overlay viewport the trace draws in. */
  readonly viewport: {
    readonly size: Readonly<ViewportSize>;
    readonly primitives: ReadonlySet<Primitive<unknown>>;
  };
  add(primitive: Primitive<unknown>): void;
  remove(primitive: Primitive<unknown>): void;
  invalidate?(): void;
}

/** The trace view wrapper: {@link syncDomain} updates it again when captured data is missing. */
export interface DomainView {
  update(host: never, plan: never): void;
}

/** Depth of shapes without one: drawn as caps. */
const FLAT = 1e-3;
/** Overlay depth (world z) of the projected prisms: behind the overlay's plane (z = 0). */
const Z_NEAR = -1;
const Z_RANGE = 2000;
/**
 * How far projected labels, lines and fills sit in front of the prisms (overlay depth units, about
 * 2/3 px each at typical sizes): enough for a label to stay on a tilted top face across its
 * height, while a prism well in front of it hides it.
 */
const LIFT = 40;
/** Arc segments per radian. */
const ARC_STEPS = 16;

type Data = Record<string, unknown>;
type Kind = 'arc' | 'rect' | 'text' | 'fill' | 'line';

/** One extruded shape, world (overlay) px. */
export interface DomainShape {
  readonly outline: Outline;
  /** Bottom and top (px toward the viewer). */
  readonly z0: number;
  readonly z1: number;
  /** Bounding box x0, y0, x1, y1 and center. */
  readonly box: readonly [number, number, number, number];
  readonly cx: number;
  readonly cy: number;
  /** Color (sRGB RGBA, opaque: see {@link over}) and bevel radius. */
  readonly color: RGBA;
  readonly bevel: number;
  /** Transparent in the flat trace (a treemap's root): not drawn, but hovered and stacked on. */
  readonly hidden: boolean;
  /** Rect shapes (containment stacking only applies to them). */
  readonly rect: boolean;
}

/** The kind of a primitive's (merged) data, from its keys. */
function kindOf(d: Data): Kind | undefined {
  if ('labels' in d) return 'text';
  if ('outerRadius' in d || 'startAngle' in d) return 'arc';
  if ('x0' in d) return 'rect';
  if ('rings' in d) return 'fill';
  return 'x' in d ? 'line' : undefined;
}

const num = (v: unknown, dflt = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

/** A scalar input (number or per-item array) at `i`. */
function scalar(v: unknown, i: number, dflt = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : dflt;
  const a = v as ArrayLike<number> | undefined;
  return a && i < a.length ? num(a[i], dflt) : dflt;
}

/** A color input (RGBA tuple or 4 floats per item) at `i`. */
function colorOf(v: unknown, i: number): RGBA {
  const a = v as ArrayLike<number> | undefined;
  if (!a || a.length < 4) return [0.5, 0.5, 0.5, 1];
  const k = a instanceof Float32Array ? i * 4 : 0;
  return [a[k] ?? 0.5, a[k + 1] ?? 0.5, a[k + 2] ?? 0.5, a[k + 3] ?? 1];
}

/**
 * `color` (straight alpha) times `opacity` over `under` (opaque): the color the flat trace shows.
 * Prisms are drawn opaque, so they keep writing depth (translucent ones would need sorting that
 * nested and adjacent prisms defeat); what is under a shape in the flat trace is the paper or,
 * for a nested tile, its parent.
 */
export function over(color: RGBA, under: RGBA, opacity = 1): RGBA {
  const a = color[3] * opacity;
  const mix = (k: number) => color[k]! * a + under[k]! * (1 - a);
  return [mix(0), mix(1), mix(2), 1];
}

/** The paper color (`paper_bgcolor`, alpha dropped; white when unset or transparent). */
export function paperColor(paper: unknown): RGBA {
  const c = new Color(1, 1, 1);
  if (typeof paper === 'string' && paper !== 'transparent') {
    c.setStyle(
      paper.replace(/^rgba\(([^,]+),([^,]+),([^,)]+),[^)]*\)$/, 'rgb($1,$2,$3)'),
      SRGBColorSpace,
    );
  }
  return [c.r, c.g, c.b, 1];
}

/**
 * A shape's depth (px) from the trace's `depth`: a number, a percentage of `size` (`'20%'`), or
 * one number per item (`item` indexes it). At least {@link FLAT}.
 */
export function domainDepth(depth: unknown, item: number, size: number): number {
  let d = 0;
  if (typeof depth === 'number') d = depth;
  else if (typeof depth === 'string') {
    const pct = /^\s*([\d.]+)\s*%\s*$/.exec(depth);
    d = pct ? (Number(pct[1]) / 100) * size : Number.parseFloat(depth);
  } else if (Array.isArray(depth) || ArrayBuffer.isView(depth)) {
    d = Number((depth as ArrayLike<unknown>)[item]);
  }
  return Number.isFinite(d) && d > FLAT ? d : FLAT;
}

/** Whether a trace is drawn in 2.5D: a `tilt`, or a `depth` that isn't 0. */
export function domainActive(trace: Readonly<Record<string, unknown>>): boolean {
  if (num(trace['tilt']) !== 0) return true;
  const d = trace['depth'];
  if (typeof d === 'number') return d > 0;
  if (typeof d === 'string') return Number.parseFloat(d) > 0;
  if (Array.isArray(d) || ArrayBuffer.isView(d)) {
    return Array.from(d as ArrayLike<unknown>).some((v) => Number(v) > 0);
  }
  return false;
}

/** Everything a shape needs besides its outline. */
export interface ShapeStyle {
  readonly trace: Readonly<Record<string, unknown>>;
  readonly bevel: number;
  readonly segments: number;
  /** The paper color (what translucent shapes are composited over). */
  readonly paper: RGBA;
}

function styleOf(host: DomainHost): ShapeStyle {
  const trace = host.trace;
  const b = (trace['bevel'] ?? {}) as { size?: unknown; segments?: unknown };
  return {
    trace,
    bevel: num(b.size),
    segments: Math.max(1, num(b.segments, 3)),
    paper: paperColor(host.fullLayout?.paper_bgcolor),
  };
}

function shape(
  outline: Outline,
  z0: number,
  depth: number,
  color: RGBA,
  bevel: number,
  rect: boolean,
  hidden: boolean,
): DomainShape {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  outline.x.forEach((x, i) => {
    const y = outline.y[i]!;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  });
  return {
    outline,
    z0,
    z1: z0 + depth,
    box: [x0, y0, x1, y1],
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    color,
    bevel: clampBevel(bevel, x1 - x0, y1 - y0, depth),
    rect,
    hidden,
  };
}

/**
 * Pie slices (arc data, world px) as sector shapes. `items`: one entry per group of arcs (a slice
 * and its outline rims, drawn by the trace as extra arcs, which are skipped), the item its depth
 * is read at; default one group per arc.
 */
export function arcShapes(
  d: Data,
  style: ShapeStyle,
  items: ArrayLike<number> | undefined,
): DomainShape[] {
  const x = (d['x'] ?? []) as ArrayLike<number>;
  const y = (d['y'] ?? []) as ArrayLike<number>;
  const count = Math.min(x.length, y.length);
  const per = items && items.length > 0 ? Math.max(1, Math.round(count / items.length)) : 1;
  const opacity = num(d['opacity'], 1);
  const out: DomainShape[] = [];
  for (let j = 0; j < count; j += per) {
    let cx = x[j]!;
    let cy = y[j]!;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const r0 = Math.max(0, scalar(d['innerRadius'], j));
    const r1 = scalar(d['outerRadius'], j, 50);
    const s = scalar(d['startAngle'], j);
    const e = scalar(d['endAngle'], j, 2 * Math.PI);
    let a0 = Math.min(s, e);
    let a1 = Math.max(s, e);
    if (!(r1 > r0) || !(a1 > a0)) continue;
    // The outline (half its width inside each slice) becomes a gap: each slice gives up that much
    // at its outer edge and moves as far out along its bisector (so the gap stays open at the
    // center).
    const seam = scalar(d['borderWidth'], j);
    if (seam > 0 && a1 - a0 < 2 * Math.PI - 1e-6) {
      const mid = (a0 + a1) / 2;
      const inset = Math.min(seam / r1, (a1 - a0) / 4);
      a0 += inset;
      a1 -= inset;
      cx += Math.cos(mid) * seam;
      cy += Math.sin(mid) * seam;
    }
    const item = items ? num(items[j / per], j) : j;
    const depth = domainDepth(style.trace['depth'], item, r1);
    const segments = Math.max(2, Math.ceil((a1 - a0) * ARC_STEPS));
    const outline = sectorOutline(cx, cy, r0, r1, a0, a1, segments);
    const color = colorOf(d['fill'], j);
    const hidden = color[3] * opacity <= 0;
    out.push(
      shape(outline, 0, depth, over(color, style.paper, opacity), style.bevel, false, hidden),
    );
  }
  return out;
}

/**
 * Tiles (rect data, world px) as rect shapes, inset by half their outline width (the outlines
 * become gaps); a tile inside an earlier one stands on its top. `d.items`: the item of each rect.
 */
export function rectShapes(d: Data, style: ShapeStyle): DomainShape[] {
  const x0 = (d['x0'] ?? []) as ArrayLike<number>;
  const y0 = (d['y0'] ?? []) as ArrayLike<number>;
  const x1 = (d['x1'] ?? []) as ArrayLike<number>;
  const y1 = (d['y1'] ?? []) as ArrayLike<number>;
  const items = d['items'] as ArrayLike<number> | undefined;
  const count = Math.min(x0.length, y0.length, x1.length, y1.length);
  const opacity = num(d['opacity'], 1);
  const out: DomainShape[] = [];
  // Every tile's box, top and color (what a tile inside it stands on and shows over).
  const boxes: [number, number, number, number, number, RGBA][] = [];
  for (let j = 0; j < count; j++) {
    const ax = Math.min(x0[j]!, x1[j]!);
    const bx = Math.max(x0[j]!, x1[j]!);
    const ay = Math.min(y0[j]!, y1[j]!);
    const by = Math.max(y0[j]!, y1[j]!);
    if (!(bx > ax && by > ay)) continue;
    // Stacking: the latest earlier tile containing this one (its parent, in drawing order).
    let z0 = 0;
    let under = style.paper;
    for (let k = boxes.length - 1; k >= 0; k--) {
      const b = boxes[k]!;
      const e = 1e-6;
      if (ax >= b[0] - e && bx <= b[2] + e && ay >= b[1] - e && by <= b[3] + e) {
        z0 = b[4];
        under = b[5];
        break;
      }
    }
    const inset = Math.max(0, scalar(d['borderWidth'], j)) / 2;
    const w = bx - ax - 2 * inset;
    const h = by - ay - 2 * inset;
    const item = items ? num(items[j], j) : j;
    const depth = domainDepth(style.trace['depth'], item, Math.min(bx - ax, by - ay));
    const fill = colorOf(d['fill'], j);
    const hidden = fill[3] * opacity <= 0;
    const color = over(fill, under, opacity);
    boxes.push([ax, ay, bx, by, z0 + depth, hidden ? under : color]);
    if (!(w > 0 && h > 0)) continue;
    const bevel = clampBevel(style.bevel, w, h, depth);
    const radius = Math.max(bevel, Math.min(scalar(d['cornerRadius'], j), w / 2, h / 2));
    const outline = rectOutline(
      ax + inset,
      ay + inset,
      bx - inset,
      by - inset,
      radius,
      radius > 0 ? style.segments : 0,
    );
    out.push(shape(outline, z0, depth, color, style.bevel, true, hidden));
  }
  return out;
}

/** Whether `(x, y)` lies inside a closed ring (crossing test; repeated points are fine). */
function inside(o: Outline, x: number, y: number): boolean {
  let hit = false;
  const n = o.x.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = o.x[i]!;
    const yi = o.y[i]!;
    const xj = o.x[j]!;
    const yj = o.y[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A ray (world px: origin, direction) against a prism: the ray parameter, and whether a wall. */
function rayPrism(
  s: DomainShape,
  o: readonly [number, number, number],
  d: readonly [number, number, number],
): { t: number; wall: boolean } | undefined {
  let best: { t: number; wall: boolean } | undefined;
  if (Math.abs(d[2]) > 1e-12) {
    const t = (s.z1 - o[2]) / d[2];
    if (t > 0 && inside(s.outline, o[0] + t * d[0], o[1] + t * d[1])) best = { t, wall: false };
  }
  const { x, y } = s.outline;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const ax = x[i]!;
    const ay = y[i]!;
    const ex = x[(i + 1) % n]! - ax;
    const ey = y[(i + 1) % n]! - ay;
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - o[0]) * ey - (ay - o[1]) * ex) / den;
    const u = ((ax - o[0]) * d[1] - (ay - o[1]) * d[0]) / den;
    const z = o[2] + t * d[2];
    if (t > 0 && u >= 0 && u <= 1 && z >= s.z0 && z <= s.z1 && (!best || t < best.t)) {
      best = { t, wall: true };
    }
  }
  return best;
}

const v4 = new Vector4();

/**
 * A domain trace's tilted camera (see the module comment): world (overlay) px ↔ screen, and the
 * pointer onto the flat trace. Pure (three.js math only).
 */
export class DomainCamera {
  readonly camera: View3DCamera;
  readonly rect: Readonly<ViewportRect>;
  /** Figure height (overlay world y = height − container y). */
  readonly height: number;
  shapes: readonly DomainShape[] = [];
  /** World origin of the plane (the domain's bottom-left corner). */
  readonly #ox: number;
  readonly #oy: number;
  readonly #tilt: number;

  constructor(rect: Readonly<ViewportRect>, height: number, tilt: number, perspective: number) {
    this.rect = { ...rect };
    this.height = height;
    this.#tilt = tilt;
    // The trace lies like a pie on a table seen from the front: its near (bottom) edge comes
    // toward the eye and the fronts of its prisms show — the 2.5D view's camera from below.
    this.camera = view3dCamera(rect, rect, { tilt: -tilt, rotation: 0, perspective });
    this.#ox = rect.x;
    this.#oy = height - rect.y - rect.height;
  }

  /** World point `(x, y)` raised `z` px: where it is drawn (world px) and its overlay depth. */
  toScreen(x: number, y: number, z: number): [number, number, number] {
    v4.set(x - this.#ox, y - this.#oy, z, 1).applyMatrix4(this.camera.viewProjection);
    const r = this.rect;
    const sx = r.x + ((v4.x / v4.w + 1) / 2) * r.width;
    const sy = r.y + ((1 - v4.y / v4.w) / 2) * r.height;
    return [sx, this.height - sy, Z_NEAR - (v4.z / v4.w + 1) * Z_RANGE];
  }

  /**
   * The height (px) a world point is drawn at: the top of the (topmost) shape it lies on; else the
   * nearest shape's top, or its bottom in front of it (so an outside label below a slice isn't
   * drawn over the slice's front); 0 without shapes.
   */
  zAt(x: number, y: number): number {
    let z: number | undefined;
    let near = Infinity;
    let nz = 0;
    for (const s of this.shapes) {
      const [x0, y0, x1, y1] = s.box;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && inside(s.outline, x, y)) {
        z = Math.max(z ?? 0, s.z1);
      } else if (z === undefined) {
        const dist = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
        if (dist < near) [near, nz] = [dist, (y - s.cy) * this.#tilt < 0 ? s.z0 : s.z1];
      }
    }
    return z ?? nz;
  }

  /** Where the flat trace's container point `(x, y)` is drawn (on its shape's top), container. */
  project(x: number, y: number): [number, number] {
    const wy = this.height - y;
    const [sx, sy] = this.toScreen(x, wy, this.zAt(x, wy));
    return [sx, this.height - sy];
  }

  /**
   * The flat trace's container point under screen point `(x, y)` (container px): inside the prism
   * the pointer ray hits first, else on the plane.
   */
  unproject(x: number, y: number): [number, number] {
    const { origin, direction } = view3dRay(this.camera, this.rect, x, y);
    const o = [origin.x + this.#ox, origin.y + this.#oy, origin.z] as const;
    const d = [direction.x, direction.y, direction.z] as const;
    let best: { t: number; wall: boolean; s: DomainShape } | undefined;
    for (const s of this.shapes) {
      const hit = rayPrism(s, o, d);
      if (hit && (!best || hit.t < best.t)) best = { ...hit, s };
    }
    const t = best ? best.t : Math.abs(d[2]) > 1e-12 ? -o[2] / d[2] : NaN;
    let wx = o[0] + t * d[0];
    let wy = o[1] + t * d[1];
    if (best?.wall) {
      // Just inside the footprint, toward the shape's center.
      const { cx, cy } = best.s;
      const k = Math.min(1, 0.5 / (Math.hypot(cx - wx, cy - wy) || 1));
      wx += (cx - wx) * k;
      wy += (cy - wy) * k;
    }
    return [wx, this.height - wy];
  }

  /** Project `out`'s positions (world px, built by {@link buildPrisms}) in place. */
  projectPositions(out: PrismBuffers): void {
    const p = out.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      const [x, y, z] = this.toScreen(p[i]!, p[i + 1]!, p[i + 2]!);
      p[i] = x;
      p[i + 1] = y;
      p[i + 2] = z;
    }
  }
}

/** Write the prisms of `shapes` (world px) into `out`; item k is shape k. */
export function buildPrisms(out: PrismBuffers, shapes: readonly DomainShape[], segments: number) {
  shapes.forEach((s, k) => {
    if (!s.hidden)
      extrudeOutline(out, s.outline, s.z0, s.z1, s.bevel, s.bevel > 0 ? segments : 0, k);
  });
}

/** A label, line or fill point projected: on its shape's top (see the module comment). */
function projectLabel(cam: DomainCamera, l: Data): Data {
  const x = l['x'] as number;
  const y = l['y'] as number;
  const z = cam.zAt(x, y);
  const [sx, sy, depth] = cam.toScreen(x, y, z);
  const out: Data = { ...l, x: sx, y: sy, z: depth + LIFT };
  const angle = l['angle'];
  if (typeof angle === 'number' && angle !== 0 && Number.isFinite(sx)) {
    // Plotly angles: degrees, clockwise on screen (world y is up).
    const a = (angle * Math.PI) / 180;
    const [tx, ty] = cam.toScreen(x + Math.cos(a) * 10, y - Math.sin(a) * 10, z);
    let deg = (Math.atan2(sy - ty, tx - sx) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    else if (deg < -90) deg += 180;
    out['angle'] = deg;
  }
  return out;
}

function projectXY(cam: DomainCamera, d: Data): Data {
  const x = (d['x'] ?? []) as ArrayLike<number>;
  const y = (d['y'] ?? []) as ArrayLike<number>;
  const n = Math.min(x.length, y.length);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [sx, sy, depth] = cam.toScreen(x[i]!, y[i]!, cam.zAt(x[i]!, y[i]!));
    px[i] = sx;
    py[i] = sy;
    pz[i] = depth + LIFT;
  }
  return { ...d, x: px, y: py, z: pz };
}

/** A captured primitive: its own update, and its merged data (once seen). */
interface Captured {
  readonly update: (patch: Data) => void;
  data: Data | undefined;
}

/** What {@link syncDomain} keeps per trace view. */
class DomainState {
  host: DomainHost;
  items: ArrayLike<number> | undefined;
  readonly captured = new Map<Primitive<unknown>, Captured>();
  cam: DomainCamera | null = null;
  prism: ExtrusionPrimitive | undefined;
  mesh: MeshModule;
  segments = 3;
  /** Set while the view draws again for primitives whose data wasn't seen. */
  redrawing = false;

  constructor(host: DomainHost, mesh: MeshModule) {
    this.host = host;
    this.mesh = mesh;
  }

  /** Intercept `p`'s updates (see the module comment). */
  capture(p: Primitive<unknown>): void {
    if (this.captured.has(p)) return;
    const c: Captured = { update: p.update.bind(p) as Captured['update'], data: undefined };
    this.captured.set(p, c);
    p.update = (patch: unknown) => {
      const data = { ...c.data, ...(patch as Data) };
      const kind = kindOf(data);
      // A partial patch of unseen data (e.g. outline colors only) can't be drawn in 2.5D.
      c.data = kind ? data : undefined;
      if (!this.cam || kind === undefined) c.update(patch as Data);
      else if (kind === 'arc' || kind === 'rect') {
        c.update(patch as Data);
        this.draw();
      } else c.update(this.#project(kind, data));
    };
  }

  /** The live captured primitives (the view may have removed some). */
  *live(): Generator<[Primitive<unknown>, Captured, Kind | undefined]> {
    const live = this.host.viewport.primitives;
    for (const [p, c] of this.captured) {
      if (live.has(p)) yield [p, c, c.data ? kindOf(c.data) : undefined];
      else this.captured.delete(p);
    }
  }

  #project(kind: Kind, data: Data): Data {
    const cam = this.cam!;
    if (kind === 'text') {
      const labels = (data['labels'] ?? []) as Data[];
      return { ...data, labels: labels.map((l) => projectLabel(cam, l)) };
    }
    return projectXY(cam, data);
  }

  /** Rebuild the prisms from the captured shapes (the camera set); hide the flat shapes. */
  draw(): void {
    const cam = this.cam;
    const host = this.host;
    if (!cam) return;
    const style = styleOf(host);
    this.segments = style.segments;
    const shapes: DomainShape[] = [];
    let order: number | undefined;
    for (const [p, c, kind] of this.live()) {
      if (kind !== 'arc' && kind !== 'rect') continue;
      p.object.visible = false;
      order ??= p.object.renderOrder;
      const data = c.data!;
      shapes.push(
        ...(kind === 'arc' ? arcShapes(data, style, this.items) : rectShapes(data, style)),
      );
    }
    cam.shapes = shapes;
    const color = new Float32Array(shapes.length * 4);
    shapes.forEach((s, k) => color.set(s.color, k * 4));
    const patch: Partial<ExtrusionData> = {
      prisms: (out) => {
        buildPrisms(out, shapes, this.segments);
        cam.projectPositions(out);
      },
      depth: shapes.reduce((m, s) => Math.max(m, s.z1), 0),
      color,
      material: extrusionMaterialSpec(host.trace['material'], () => host.invalidate?.()),
    };
    if (this.prism) this.prism.update(patch);
    else {
      this.prism = createExtrusionPrimitive(host.primitives, patch, this.mesh);
      host.add(this.prism);
    }
    this.prism.object.renderOrder = order ?? -9;
  }

  /** Apply the camera (null: flat) to everything captured. */
  apply(wasTilted: boolean): void {
    if (this.cam) this.draw();
    else if (this.prism) {
      this.host.remove(this.prism);
      this.prism = undefined;
    }
    for (const [p, c, kind] of this.live()) {
      if (!c.data || !kind) continue;
      if (kind === 'arc' || kind === 'rect') p.object.visible = !this.cam;
      else if (this.cam) c.update(this.#project(kind, c.data));
      else if (wasTilted) c.update(c.data);
    }
  }
}

const byView = new WeakMap<object, DomainState>();
const byCalc = new WeakMap<object, DomainState>();

/**
 * The lazily loaded side of `extrudeDomain` (see the module comment): capture `added` (the
 * primitives the trace view added), set the trace's camera and draw. Returns the extrusion
 * primitive, if the trace is in 2.5D. `items`: per slice, the item its depth is read at.
 */
export function syncDomain(
  prev: ExtrusionPrimitive | undefined,
  host: DomainHost,
  view: DomainView,
  added: Iterable<Primitive<unknown>>,
  mesh: MeshModule,
  items?: ArrayLike<number>,
): ExtrusionPrimitive | undefined {
  let st = byView.get(view);
  if (!st) byView.set(view, (st = new DomainState(host, mesh)));
  st.host = host;
  st.items = items;
  st.prism = prev ?? st.prism;
  let unseen = false;
  for (const p of added) {
    st.capture(p);
    if (host.viewport.primitives.has(p) && !st.captured.get(p)!.data) unseen = true;
  }
  const rect = host.domain?.rect;
  const trace = host.trace;
  const wasTilted = st.cam !== null;
  st.cam =
    rect && domainActive(trace)
      ? new DomainCamera(
          rect,
          host.viewport.size.height,
          num(trace['tilt']),
          num(trace['perspective'], 0.5),
        )
      : null;
  const calc = host.calc as object;
  if (st.cam && unseen && !st.redrawing) {
    // Primitives created before their updates were intercepted: have the view draw them again.
    st.redrawing = true;
    try {
      view.update(host as never, {} as never);
    } finally {
      st.redrawing = false;
    }
  }
  st.apply(wasTilted);
  if (st.cam && calc) byCalc.set(calc, st);
  else if (calc) byCalc.delete(calc);
  return st.prism;
}

/** Intercept a primitive the view of a trace in 2.5D just added (see {@link syncDomain}). */
export function domainCapture(view: object, primitive: Primitive<unknown>): void {
  byView.get(view)?.capture(primitive);
}

/** A domain trace's pointer event mapped onto the flat trace; undefined when it is flat. */
export function domainPointer<E extends { x: number; y: number }>(
  view: object,
  event: E,
): E | undefined {
  const cam = byView.get(view)?.cam;
  if (!cam) return undefined;
  const [x, y] = cam.unproject(event.x, event.y);
  return { ...event, x, y };
}

interface Anchored {
  readonly px: number;
  readonly py: number;
}

/** Hover points' anchors (overlay px, bottom-left origin) where the tilted trace draws them. */
function anchors<P extends Anchored>(cam: DomainCamera, points: readonly P[]): P[] {
  const h = cam.height;
  return points.map((p) => {
    const [x, y] = cam.project(p.px, h - p.py);
    return { ...p, px: x, py: h - y };
  });
}

/**
 * A domain trace's `hoverPoints` in 2.5D: the pointer (`query.cx`, `query.cy`) mapped onto the flat
 * trace, the points' anchors onto the tilted one. Undefined when the trace is flat.
 */
export function domainHover<
  C,
  T,
  Q extends {
    readonly px: number;
    readonly py: number;
    readonly cx?: number;
    readonly cy?: number;
  },
  H,
  P extends Anchored,
>(
  hoverPoints: (calc: C, trace: T, query: Q, ctx: H) => readonly P[],
  calc: C,
  trace: T,
  query: Q,
  ctx: H,
) {
  const cam = byCalc.get(calc as object)?.cam;
  if (!cam || query.cx === undefined || query.cy === undefined) return undefined;
  const [x, y] = cam.unproject(query.cx, query.cy);
  const h = query.py + query.cy;
  const q = { ...query, cx: x, cy: y, px: x, py: h - y, xl: x, yl: h - y };
  return anchors(cam, hoverPoints(calc, trace, q, ctx));
}

/** A domain trace's `keyboardPoints` in 2.5D (anchors where drawn); undefined when flat. */
export function domainKeyboard<C, T, H, P extends Anchored>(
  keyboardPoints: (calc: C, trace: T, ctx: H) => readonly P[],
  calc: C,
  trace: T,
  ctx: H,
) {
  const cam = byCalc.get(calc as object)?.cam;
  return cam ? anchors(cam, keyboardPoints(calc, trace, ctx)) : undefined;
}
