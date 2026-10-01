/**
 * Extrusion primitive (plan E8.9, E2.7's `depth`): 2D shapes — rects (bars, funnel and waterfall
 * steps, heatmap cells, treemap and icicle tiles), annular sectors (pie and sunburst slices) and
 * polygons (area fills) — as lit prisms standing out of the plot plane (z = 0) toward the viewer,
 * with rounded bevels, per-shape colors and the mesh primitive's shading: Plotly's lighting model
 * or a three.js material (`material`, E8.7). Part of render's lazily loaded 2.5D chunk
 * (`extrusion-lazy.ts`), which only charts with `depth` or `layout.view3d` load.
 *
 * ## Design
 *
 * - **One draw call per trace**: every shape's prism (`extrusion-geometry.ts`) goes into one
 *   indexed mesh, drawn by the mesh primitive (`mesh.ts`, loaded with this chunk), so materials,
 *   lighting, translucency sorting and the clip box come from there.
 * - **Geometry in world px**: depth and bevels are CSS px, so prisms are built in the viewport's
 *   world (px) for the current data → world transform. A pan only moves the mesh (and its clip
 *   box); a zoom rebuilds the prisms (cheap for bar-sized counts).
 * - **Clipped to the plot area** in x and y (the axis ranges, as a data-space clip box) at any
 *   height: extruded shapes are not stencil-clipped to the flat plot area by the 2.5D view.
 * - **Lighting**: {@link EXTRUSION_LIGHTING}, a light rig fixed to the chart (from the upper left,
 *   in front) with which a front face shows exactly its color (flat view), tops a little darker
 *   and sides darker still; three.js material types get the rig's lights added to the scene.
 * - **Hover**: {@link ExtrusionPrimitive.raycast} intersects a pointer ray with the prisms' boxes
 *   on the CPU (plan: "ray-cast against extruded geometry"); the 2.5D view's projector uses it to
 *   map the pointer to the shape under it.
 */
import {
  Color,
  Group,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import type { DataTransform, Primitive, PrimitiveContext, RGBA, ViewportSize } from '../types.ts';
import {
  clampBevel,
  extrudeOutline,
  PrismBuffers,
  rectOutline,
  type Outline,
} from './extrusion-geometry.ts';
import type { LightingSpec, LightRig } from './lighting.ts';
import type { MeshPrimitive } from './mesh.ts';
import type { MeshModule } from './mesh-loader.ts';
import type { MeshMaterialSpec, MeshMaterialType } from './mesh-material.ts';
import type { RectData } from './rect.ts';

/**
 * Lights of extruded 2D shapes: ambient light and one light fixed to the chart, from the upper
 * left in front. With Plotly's `lighting` defaults (ambient 0.8, diffuse 0.8) a face toward the
 * viewer shows its color exactly, tops ~87 %, left sides ~80 %, right sides and bottoms ~64 %.
 */
export const EXTRUSION_LIGHTING: Readonly<LightingSpec> = Object.freeze({
  ambient: { intensity: 0.8 },
  directional: [
    {
      position: [-0.4, 0.6, 1] as [number, number, number],
      space: 'scene' as const,
      intensity: 0.6,
    },
  ],
});

/**
 * The same lights for three.js material types, which take their intensities as physical light
 * (brighter than Plotly's model at the same numbers): less ambient light, so faces keep their
 * shading and toon bands show.
 */
export const EXTRUSION_THREE_LIGHTING: Readonly<LightingSpec> = Object.freeze({
  ambient: { intensity: 0.45 },
  directional: [
    {
      position: [-0.4, 0.6, 1] as [number, number, number],
      space: 'scene' as const,
      intensity: 0.8,
    },
  ],
});

/** Data of an {@link ExtrusionPrimitive}. */
export interface ExtrusionData {
  /**
   * Rects: corners in data space (the transform maps them to world px); NaN skips a rect. The
   * count is the shortest array. Ignored when {@link outlines} is set.
   */
  x0: ArrayLike<number>;
  y0: ArrayLike<number>;
  x1: ArrayLike<number>;
  y1: ArrayLike<number>;
  /**
   * Other shapes: outlines in data space (e.g. `sectorOutline`, `polygonOutline`), mapped through
   * the transform (their points; normals are rescaled). Null: the rects.
   */
  outlines: readonly Outline[] | null;
  /** Depth in CSS px: one for all shapes or one per shape. */
  depth: number | ArrayLike<number>;
  /** Bevel radius (CSS px) and segments of the rounded edges. */
  bevel: number;
  segments: number;
  /** sRGB colors: one, or 4 floats per shape. */
  color: RGBA | Float32Array;
  /** Multiplies alpha. */
  opacity: number;
  /** `material` (E8.7): null for Plotly's lighting model. */
  material: MeshMaterialSpec | null;
  /** Visible data ranges (the plot area): prisms are cut at their edges. Null: no clipping. */
  clip: { readonly x: readonly [number, number]; readonly y: readonly [number, number] } | null;
  /**
   * The axis whose labels belong in front of the shapes in the 2.5D view (bars: the position
   * axis, `'y'` for horizontal bars), so they are not hidden behind them. Default `'x'`.
   */
  front: 'x' | 'y';
  /**
   * Other prisms (area fills, `extrusion-cartesian.ts`): writes them in world px for a data →
   * world transform (their items index {@link color}). Null: the rects or {@link outlines}. Set
   * {@link depth} to their largest depth.
   */
  prisms: ((out: PrismBuffers, t: DataTransform) => void) | null;
  /**
   * The ray test of {@link prisms} (world ray, current transform, world clip box x0, y0, x1, y1);
   * null: the shapes' boxes.
   */
  hit:
    | ((
        origin: Vector3,
        direction: Vector3,
        t: DataTransform,
        clip: readonly [number, number, number, number],
      ) => ExtrusionHit | undefined)
    | null;
}

const DEFAULTS: ExtrusionData = {
  x0: [],
  y0: [],
  x1: [],
  y1: [],
  outlines: null,
  depth: 0,
  bevel: 0,
  segments: 3,
  color: [0.5, 0.5, 0.5, 1],
  opacity: 1,
  material: null,
  clip: null,
  front: 'x',
  prisms: null,
  hit: null,
};

/** A pointer ray's hit on an extruded shape: the ray parameter and the world point (x, y). */
export interface ExtrusionHit {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  /** The shape hit. */
  readonly index: number;
}

/** Object flag of {@link EXTRUSION_THREE_LIGHTING}'s lights (one set per scene). */
const THREE_LIGHTS = 'hcExtrusionLights';

/** Object flag: the 2.5D view does not clip this object to the flat plot area (`view3d.ts`). */
export const UNCLIPPED = 'hcUnclipped';

const rectCountOf = (d: ExtrusionData): number =>
  Math.min(d.x0.length, d.y0.length, d.x1.length, d.y1.length);

function depthAt(depth: ExtrusionData['depth'], i: number): number {
  const v = typeof depth === 'number' ? depth : depth[i];
  return typeof v === 'number' && v > 0 ? v : 0;
}

/** World box of rect `i` (sorted corners), or undefined for a missing or empty rect. */
function worldRect(
  d: ExtrusionData,
  t: DataTransform,
  i: number,
): [number, number, number, number] | undefined {
  const a = d.x0[i]! * t.scaleX + t.offsetX;
  const b = d.x1[i]! * t.scaleX + t.offsetX;
  const c = d.y0[i]! * t.scaleY + t.offsetY;
  const e = d.y1[i]! * t.scaleY + t.offsetY;
  if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(e))) {
    return undefined;
  }
  if (a === b || c === e) return undefined;
  return [Math.min(a, b), Math.min(c, e), Math.max(a, b), Math.max(c, e)];
}

/** World clip box of the data ranges (x0, y0, x1, y1), or infinite. */
function worldClip(d: ExtrusionData, t: DataTransform): [number, number, number, number] {
  if (!d.clip) return [-Infinity, -Infinity, Infinity, Infinity];
  const [x0, x1] = d.clip.x.map((v) => v * t.scaleX + t.offsetX) as [number, number];
  const [y0, y1] = d.clip.y.map((v) => v * t.scaleY + t.offsetY) as [number, number];
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

/** Map an outline from data space to world px (normals rescaled for non-uniform scales). */
function worldOutline(o: Outline, t: DataTransform): Outline {
  const map = (xs: readonly number[], s: number, off: number) => xs.map((v) => v * s + off);
  const nx: number[] = [];
  const ny: number[] = [];
  const ox: number[] = [];
  const oy: number[] = [];
  for (let i = 0; i < o.x.length; i++) {
    const ax = o.nx[i]! / t.scaleX;
    const ay = o.ny[i]! / t.scaleY;
    const l = Math.hypot(ax, ay) || 1;
    nx.push(ax / l);
    ny.push(ay / l);
    ox.push(o.ox[i]! * Math.sign(t.scaleX));
    oy.push(o.oy[i]! * Math.sign(t.scaleY));
  }
  const flipped = t.scaleX * t.scaleY < 0;
  const order = (xs: number[]) => (flipped ? xs.reverse() : xs);
  let cap = o.cap;
  if (flipped) {
    const n = o.x.length;
    cap = o.cap?.map((i) => n - 1 - i);
  }
  return {
    x: order(map(o.x, t.scaleX, t.offsetX)),
    y: order(map(o.y, t.scaleY, t.offsetY)),
    nx: order(nx),
    ny: order(ny),
    ox: order(ox),
    oy: order(oy),
    ...(cap ? { cap } : {}),
  };
}

/** Whether a material type is drawn with a three.js material (lit by the rig's three.js lights). */
function threeType(type: MeshMaterialType | undefined): boolean {
  return type !== undefined && type !== 'plotly' && type !== 'flat';
}

/** See the module comment. */
export class ExtrusionPrimitive implements Primitive<ExtrusionData> {
  readonly object = new Group();
  readonly #context: PrimitiveContext;
  readonly #mesh: MeshPrimitive;
  readonly #rig: LightRig;
  /** The lights of three.js material types, added to the scene with the prisms. */
  readonly #threeRig: LightRig;
  #d: ExtrusionData;
  // This chunk imports nothing from render's entry (not even `IDENTITY_TRANSFORM`): its bundles'
  // chunks stay as without it.
  #transform: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  /** The transform the prisms were built for (null: rebuild). */
  #built: DataTransform | null = null;
  #maxDepth = 0;
  #disposed = false;

  /** `meshModule`: the loaded mesh module (`loadMeshModule`), which draws the prisms. */
  constructor(context: PrimitiveContext, data: Partial<ExtrusionData>, meshModule: MeshModule) {
    this.#context = context;
    this.#d = { ...DEFAULTS, ...data };
    this.#rig = meshModule.createLightRig(EXTRUSION_LIGHTING);
    this.#threeRig = meshModule.createLightRig(EXTRUSION_THREE_LIGHTING);
    // One set of these lights per scene (three.js lights add up): the first extrusion's in it.
    const lights = this.#threeRig.object;
    lights.userData[THREE_LIGHTS] = true;
    const update = lights.updateMatrixWorld.bind(lights);
    lights.updateMatrixWorld = (force?: boolean) => {
      let root: Object3D = this.object;
      while (root.parent) root = root.parent;
      let first: Object3D | undefined;
      root.traverse((o) => {
        if (!first && o.userData[THREE_LIGHTS] === true) first = o;
      });
      lights.visible = first === lights;
      update(force);
    };
    this.#mesh = meshModule.createMeshPrimitive(context, {
      positions: new Float32Array(0),
      side: 'front',
    });
    this.#mesh.setLightRig(this.#rig);
    const mesh = this.#mesh.object;
    mesh.userData[UNCLIPPED] = true;
    mesh.frustumCulled = false;
    this.object.add(mesh);
    this.object.name = 'holochart:extrusion';
    this.#build();
  }

  /** The resolved data. */
  get data(): Readonly<ExtrusionData> {
    return this.#d;
  }

  /** The largest depth drawn (px). */
  get maxDepth(): number {
    return this.#maxDepth;
  }

  /** The mesh primitive drawing the prisms (tests, shader access). */
  get mesh(): MeshPrimitive {
    return this.#mesh;
  }

  update(patch: Partial<ExtrusionData>): void {
    if (this.#disposed) return;
    this.#d = { ...this.#d, ...patch };
    this.#build();
  }

  setTransform(transform: DataTransform): void {
    if (this.#disposed) return;
    this.#transform = { ...transform };
    const b = this.#built;
    if (!b || b.scaleX !== transform.scaleX || b.scaleY !== transform.scaleY) {
      this.#build();
      return;
    }
    this.#place();
    this.#context.invalidate();
  }

  setViewport(size: ViewportSize): void {
    this.#mesh.setViewport(size);
  }

  /**
   * The nearest extruded shape a world-space ray (`origin + t · direction`, t ≥ 0) hits, inside
   * the clip box: its box for rects, its outline's bounding box for other shapes. The hit point
   * is moved just inside the shape's footprint, so the flat shape under it contains it.
   */
  raycast(origin: Vector3, direction: Vector3): ExtrusionHit | undefined {
    const d = this.#d;
    const t = this.#transform;
    const clip = worldClip(d, t);
    if (d.hit) return d.hit(origin, direction, t, clip);
    const [cx0, cy0, cx1, cy1] = clip;
    let best: ExtrusionHit | undefined;
    const count = d.outlines ? d.outlines.length : rectCountOf(d);
    for (let i = 0; i < count; i++) {
      const depth = depthAt(d.depth, i);
      if (depth <= 0) continue;
      const box = d.outlines ? outlineBox(d.outlines[i]!, t) : worldRect(d, t, i);
      if (!box) continue;
      const lo: Vec3 = [Math.max(box[0], cx0), Math.max(box[1], cy0), 0];
      const hi: Vec3 = [Math.min(box[2], cx1), Math.min(box[3], cy1), depth];
      if (!(lo[0] < hi[0] && lo[1] < hi[1])) continue;
      const hit = slab(origin, direction, lo, hi);
      if (!hit || (best && best.t <= hit.t)) continue;
      // Inside the footprint; a hit on a side is moved to the middle of the shape across that side
      // (hover ranks shapes by the distance to their center line).
      const cx = (lo[0] + hi[0]) / 2;
      const cy = (lo[1] + hi[1]) / 2;
      const ex = (hi[0] - lo[0]) * 1e-6;
      const ey = (hi[1] - lo[1]) * 1e-6;
      const hx = origin.x + hit.t * direction.x;
      const hy = origin.y + hit.t * direction.y;
      const x = hit.axis === 0 ? cx : Math.min(Math.max(hx, lo[0] + ex), hi[0] - ex);
      const y = hit.axis === 1 ? cy : Math.min(Math.max(hy, lo[1] + ey), hi[1] - ey);
      best = { t: hit.t, x, y, index: i };
    }
    return best;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#mesh.dispose();
    this.#rig.dispose();
    this.#threeRig.dispose();
    this.object.removeFromParent();
    this.object.clear();
  }

  /** Rebuild every prism for the current transform. */
  #build(): void {
    const d = this.#d;
    const t = this.#transform;
    const out = new PrismBuffers();
    this.#maxDepth = maxDepth(typeof d.depth === 'number' ? d.depth : Float32Array.from(d.depth));
    if (d.prisms) d.prisms(out, t);
    else if (d.outlines) {
      d.outlines.forEach((o, i) => {
        const depth = depthAt(d.depth, i);
        if (depth <= 0) return;
        const w = worldOutline(o, t);
        const [x0, y0, x1, y1] = outlineBox(o, t) ?? [0, 0, 0, 0];
        const bevel = clampBevel(d.bevel, x1 - x0, y1 - y0, depth);
        extrudeOutline(out, w, 0, depth, bevel, d.segments, i);
      });
    } else {
      const n = rectCountOf(d);
      for (let i = 0; i < n; i++) {
        const depth = depthAt(d.depth, i);
        const r = depth > 0 ? worldRect(d, t, i) : undefined;
        if (!r) continue;
        const bevel = clampBevel(d.bevel, r[2] - r[0], r[3] - r[1], depth);
        const outline = rectOutline(r[0], r[1], r[2], r[3], bevel, bevel > 0 ? d.segments : 0);
        extrudeOutline(out, outline, 0, depth, bevel, d.segments, i);
      }
    }
    const nv = out.vertexCount;
    const color = new Float32Array(nv * 4);
    const perItem = d.color instanceof Float32Array;
    for (let v = 0; v < nv; v++) {
      const k = perItem ? out.items[v]! * 4 : 0;
      for (let c = 0; c < 4; c++) color[v * 4 + c] = d.color[k + c] ?? 1;
    }
    const three = threeType(d.material?.type);
    if (three) this.object.add(this.#threeRig.object);
    else this.#threeRig.object.removeFromParent();
    this.#mesh.update({
      positions: new Float32Array(out.positions),
      normals: new Float32Array(out.normals),
      indices: new Uint32Array(out.indices),
      color,
      opacity: d.opacity,
      material: d.material,
    });
    this.#built = { ...t };
    this.#place();
    this.#context.invalidate();
  }

  /** Move the prisms (built for `#built`) to the current transform, and set the clip box. */
  #place(): void {
    const b = this.#built!;
    const t = this.#transform;
    const dx = t.offsetX - b.offsetX;
    const dy = t.offsetY - b.offsetY;
    const dz = (t.offsetZ ?? 0) - (b.offsetZ ?? 0);
    this.#mesh.setTransform({
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      offsetX: dx,
      offsetY: dy,
      offsetZ: dz,
    });
    const [x0, y0, x1, y1] = worldClip(this.#d, t);
    this.#mesh.update({
      clip: this.#d.clip ? { min: [x0 - dx, y0 - dy, -1e9], max: [x1 - dx, y1 - dy, 1e9] } : null,
    });
  }
}

/** World bounding box of an outline (x0, y0, x1, y1). */
function outlineBox(o: Outline, t: DataTransform): [number, number, number, number] | undefined {
  if (o.x.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < o.x.length; i++) {
    const x = o.x[i]! * t.scaleX + t.offsetX;
    const y = o.y[i]! * t.scaleY + t.offsetY;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return Number.isFinite(x0 + y0 + x1 + y1) ? [x0, y0, x1, y1] : undefined;
}

type Vec3 = [number, number, number];

/**
 * Where a ray enters an axis-aligned box (slab test): the ray parameter and the axis of the face
 * it enters through (0 x, 1 y, 2 z; -1 when it starts inside), or undefined.
 */
function slab(
  o: Vector3,
  d: Vector3,
  lo: Readonly<Vec3>,
  hi: Readonly<Vec3>,
): { t: number; axis: number } | undefined {
  let t0 = 0;
  let t1 = Infinity;
  let axis = -1;
  const os = [o.x, o.y, o.z];
  const ds = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    const oa = os[a]!;
    const da = ds[a]!;
    if (Math.abs(da) < 1e-12) {
      if (oa < lo[a]! || oa > hi[a]!) return undefined;
      continue;
    }
    let near = (lo[a]! - oa) / da;
    let far = (hi[a]! - oa) / da;
    if (near > far) [near, far] = [far, near];
    if (near > t0) {
      t0 = near;
      axis = a;
    }
    t1 = Math.min(t1, far);
    if (t0 > t1) return undefined;
  }
  return { t: t0, axis };
}

/** Create an {@link ExtrusionPrimitive} drawn with the loaded mesh module (`loadMeshModule`). */
export function createExtrusionPrimitive(
  context: PrimitiveContext,
  data: Partial<ExtrusionData>,
  mesh: MeshModule,
): ExtrusionPrimitive {
  return new ExtrusionPrimitive(context, data, mesh);
}

// ---------------------------------------------------------------------------------------------
// Trace attributes → extrusion data
// ---------------------------------------------------------------------------------------------

/** Material attribute → three.js material property (only where the names differ). */
const THREE_PARAM_NAMES: Readonly<Record<string, string>> = {
  emissiveintensity: 'emissiveIntensity',
  clearcoatroughness: 'clearcoatRoughness',
  sheencolor: 'sheenColor',
  sheenroughness: 'sheenRoughness',
  envmapintensity: 'envMapIntensity',
};

const textures = new Map<string, Texture>();

/**
 * The mesh material spec of a defaulted `material` attribute (core `litMaterialAttributes`):
 * null for Plotly's model; CSS colors become sRGB tuples, a `matcap` URL a texture
 * (`onTextureLoad` is called once it has loaded).
 */
export function extrusionMaterialSpec(
  material: unknown,
  onTextureLoad?: () => void,
): MeshMaterialSpec | null {
  if (typeof material !== 'object' || material === null) return null;
  const m = material as Record<string, unknown>;
  const type = m['type'] as MeshMaterialType | undefined;
  if (!type || type === 'plotly') return null;
  const spec: MeshMaterialSpec = { type };
  const color = new Color();
  for (const [key, value] of Object.entries(m)) {
    if (key === 'type' || key === 'castshadow' || key === 'receiveshadow' || value == null) {
      continue;
    }
    if (key === 'matcap') {
      if (typeof value !== 'string' || !value) continue;
      let texture = textures.get(value);
      if (!texture) {
        texture = new TextureLoader().load(value, () => onTextureLoad?.());
        texture.colorSpace = SRGBColorSpace;
        textures.set(value, texture);
      }
      spec['matcap'] = texture;
      continue;
    }
    const name = THREE_PARAM_NAMES[key] ?? key;
    if (typeof value === 'string') {
      color.setStyle(value, SRGBColorSpace);
      spec[name] = [color.r, color.g, color.b, 1];
    } else spec[name] = value;
  }
  return spec;
}

/**
 * `depth` per shape in px: a number (px), a percentage string of the shape's width (`'60%'`),
 * or an array of numbers (px). `widths(i)`: shape i's width in px.
 */
export function extrusionDepths(
  depth: unknown,
  count: number,
  widths: (i: number) => number,
): number | Float32Array {
  if (typeof depth === 'number') return Number.isFinite(depth) && depth > 0 ? depth : 0;
  if (typeof depth === 'string') {
    const pct = /^\s*([\d.]+)\s*%\s*$/.exec(depth);
    if (!pct) return Math.max(0, Number.parseFloat(depth) || 0);
    const f = Number(pct[1]) / 100;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = Math.max(0, f * widths(i));
    return out;
  }
  if (Array.isArray(depth) || ArrayBuffer.isView(depth)) {
    const src = depth as ArrayLike<unknown>;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const v = Number(src[i]);
      out[i] = Number.isFinite(v) && v > 0 ? v : 0;
    }
    return out;
  }
  return 0;
}

/** The largest depth of {@link extrusionDepths}' result. */
function maxDepth(depth: number | Float32Array): number {
  if (typeof depth === 'number') return depth;
  let max = 0;
  for (const v of depth) if (v > max) max = v;
  return max;
}

/** What a trace view hands to {@link syncExtrudedRects} (the runtime's plot context fits). */
export interface ExtrusionHost {
  readonly primitives: PrimitiveContext;
  readonly trace: Readonly<Record<string, unknown>>;
  readonly transform: Readonly<DataTransform>;
  readonly xaxis?: { readonly scale: { readonly range: readonly [number, number] } } | undefined;
  readonly yaxis?: { readonly scale: { readonly range: readonly [number, number] } } | undefined;
  add(primitive: Primitive<unknown>): void;
  remove(primitive: Primitive<unknown>): void;
  invalidate?(): void;
  /** More primitives to lift with the trace's own (the connectors of bar-like traces). */
  readonly lift?: readonly LiftedPrimitive[] | undefined;
}

/** Primitives drawn over extruded shapes (labels, error bars), or layers of them. */
export type LiftedPrimitive =
  | { setTransform(t: DataTransform): void; readonly object: { userData: Record<string, unknown> } }
  | {
      setTransform(t: DataTransform): void;
      readonly primitives: readonly { readonly object: { userData: Record<string, unknown> } }[];
    }
  | undefined;

/**
 * Draw a trace's rects extruded when it has `depth` (plan E9.10; see `extrudeRects` in
 * `extrusion-loader.ts`, which calls this once the chunk has loaded): creates, updates or (for a
 * flat trace) removes the extrusion primitive and returns it. The flat rects are hidden while
 * extruded; `lift` (labels, error bars) moves to the front faces and out of the 2.5D view's
 * clipping. `rects`' data gives the shapes and colors (`fill`, `opacity`); the trace gives
 * `depth` (widths along the position axis, `orientation`), `bevel` and `material`.
 */
export function syncExtrudedRects(
  prev: ExtrusionPrimitive | undefined,
  host: ExtrusionHost,
  rects: { readonly object: Object3D },
  data: Partial<RectData>,
  lift: readonly LiftedPrimitive[],
  mesh: MeshModule,
): ExtrusionPrimitive | undefined {
  const t = host.trace;
  const tf = host.transform;
  const x0 = data.x0 ?? [];
  const y0 = data.y0 ?? [];
  const x1 = data.x1 ?? [];
  const y1 = data.y1 ?? [];
  const count = Math.min(x0.length, y0.length, x1.length, y1.length);
  const horizontal = t['orientation'] === 'h';
  const depth = extrusionDepths(t['depth'], count, (i) =>
    horizontal ? Math.abs((y1[i]! - y0[i]!) * tf.scaleY) : Math.abs((x1[i]! - x0[i]!) * tf.scaleX),
  );
  const top = maxDepth(depth);
  const flag = (on: boolean) => {
    for (const l of lift) {
      if (!l) continue;
      for (const p of 'primitives' in l ? l.primitives : [l]) {
        if (on) p.object.userData[UNCLIPPED] = true;
        else delete p.object.userData[UNCLIPPED];
      }
    }
  };
  rects.object.visible = top <= 0;
  if (top <= 0) {
    if (prev) host.remove(prev);
    flag(false);
    return undefined;
  }
  const bevel = (t['bevel'] ?? {}) as { size?: unknown; segments?: unknown };
  const xr = host.xaxis?.scale.range;
  const yr = host.yaxis?.scale.range;
  const patch: Partial<ExtrusionData> = {
    x0,
    y0,
    x1,
    y1,
    depth,
    bevel: typeof bevel.size === 'number' ? bevel.size : 0,
    segments: typeof bevel.segments === 'number' ? bevel.segments : 3,
    color: (data.fill as RGBA | Float32Array | undefined) ?? DEFAULTS.color,
    opacity: data.opacity ?? 1,
    material: extrusionMaterialSpec(t['material'], () => host.invalidate?.()),
    clip: xr && yr ? { x: [xr[0], xr[1]], y: [yr[0], yr[1]] } : null,
    front: horizontal ? 'y' : 'x',
  };
  let p = prev;
  if (p) p.update(patch);
  else {
    p = createExtrusionPrimitive(host.primitives, patch, mesh);
    host.add(p);
  }
  p.object.renderOrder = rects.object.renderOrder;
  p.setTransform(tf);
  // Labels and error bars in front of the front faces (in the flat view too: the prisms write
  // depth), not clipped to the flat plot area.
  const lifted = { ...tf, offsetZ: (tf.offsetZ ?? 0) + top + 0.5 };
  for (const l of lift) l?.setTransform(lifted);
  flag(true);
  return p;
}
