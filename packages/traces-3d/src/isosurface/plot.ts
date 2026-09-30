/**
 * The mesh view of `isosurface` and stacked `volume` (plan E14.7, E14.8): the extracted triangles
 * (`extract.ts`) in render's lazily loaded mesh primitive, in the trace's scene.
 *
 * - **Geometry**: vertices relative to the grid's center (the primitive's float64 origin), normals
 *   computed by the primitive with Plotly's epsilons (`facenormalsepsilon` 0 by default) on
 *   Plotly's scaled coordinates (`normalScale`: 1 / grid span per axis); `flatshading` (on by
 *   default) draws face normals. Positions are uploaded again only for a new calc.
 * - **Colors**: the vertex values through the colorscale (domain `cmin` / `cmax`, automatically
 *   `[isomin, isomax]`), sampled per fragment; `opacity`, and for `volume` the per-vertex alpha of
 *   `opacityscale` ({@link isoOpacityscaleAlpha}); translucent meshes sort their triangles.
 * - **Clipping**: fragments outside the scene's axis ranges are discarded, as in Plotly.
 * - **Lighting**: `lighting`, `lightposition`, `material` and the scene's light rig.
 */
import {
  createLazyMeshPrimitive,
  type LazyMeshPrimitive,
  type MeshInput,
} from '@mk7s/holochart-render';
import type { TracePlotContext, TraceUpdatePlan, TraceView } from '@mk7s/holochart-runtime';
import { opacityscaleTable } from '../surface/primitive.ts';
import { sceneClip } from '../surface/hover.ts';
import { sceneMeshLighting } from '../scene/lighting-attributes.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { registerScenePickable, unregisterScenePickable } from '../scene/pick.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import { traceColorMapping } from '../mesh3d/colors.ts';
import type { IsoCalc } from './calc.ts';
import type { IsoMesh } from './extract.ts';

type Vec3 = [number, number, number];
type Ctx = TracePlotContext<IsoCalc>;

/** Positions relative to the mesh's box center (the primitive's float64 origin). */
export function isoPositions(mesh: IsoMesh): { positions: Float32Array; origin: Vec3 } {
  const cols = [mesh.x, mesh.y, mesh.z];
  const origin = cols.map((c) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < mesh.count; i++) {
      const v = c[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return lo <= hi ? (lo + hi) / 2 : 0;
  }) as Vec3;
  const positions = new Float32Array(mesh.count * 3);
  for (let i = 0; i < mesh.count; i++) {
    for (let a = 0; a < 3; a++) positions[i * 3 + a] = cols[a]![i]! - origin[a]!;
  }
  return { positions, origin };
}

/**
 * Per-vertex alpha of a volume's `opacityscale` (null without one), as gl-mesh3d draws it: the
 * scale at the vertex value's position in the color domain, applied twice (the vertex alpha and
 * the colormap's alpha, which gl-mesh3d both take from `opacityscale`), so a stop of 0.5 draws at
 * 0.25 of `opacity`.
 */
export function isoOpacityscaleAlpha(
  values: ArrayLike<number>,
  stops: readonly (readonly [number, number])[] | undefined,
  cmin: number,
  cmax: number,
): Float32Array | null {
  if (!stops || stops.length < 2) return null;
  const table = opacityscaleTable(stops);
  const out = new Float32Array(values.length);
  const span = cmax - cmin || 1;
  for (let i = 0; i < values.length; i++) {
    const t = Math.min(1, Math.max(0, (values[i]! - cmin) / span));
    const a = Number.isFinite(t) ? table[Math.round(t * 255)]! : 1;
    out[i] = a * a;
  }
  return out;
}

const POSITIONS = new WeakMap<IsoMesh, { positions: Float32Array; origin: Vec3 }>();

/** The mesh primitive's data for a trace and its calc (`geometry`: include the positions). */
export function isoMeshInput(
  ctx: Pick<Ctx, 'trace' | 'fullLayout'>,
  calc: IsoCalc,
  scene: Scene3D | null,
  geometry: boolean,
  onTextureLoad?: () => void,
): Partial<MeshInput> {
  const trace = ctx.trace;
  const mesh = calc.mesh!;
  const mapping = traceColorMapping(trace, ctx.fullLayout, [calc.isomin, calc.isomax]);
  const cmin = mapping?.cmin ?? calc.isomin;
  const cmax = mapping?.cmax ?? calc.isomax;
  const stops = trace['opacityscale'] as [number, number][] | undefined;
  const opacity = Number(trace['opacity']);
  let geo: Partial<MeshInput> = {};
  if (geometry) {
    let p = POSITIONS.get(mesh);
    if (!p) POSITIONS.set(mesh, (p = isoPositions(mesh)));
    geo = { ...p, indices: mesh.triangles, normals: null, normalScale: [...calc.dataScale] };
  }
  return {
    ...geo,
    color: [1, 1, 1, 1],
    faceColor: null,
    intensity: mesh.value,
    intensityMode: 'vertex',
    ...(mapping ? { colorscale: mapping.colorscale } : {}),
    interpolation: 'rgb',
    cmin,
    cmax,
    reversescale: mapping?.reversescale ?? false,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    alpha: isoOpacityscaleAlpha(mesh.value, stops, cmin, cmax),
    shading: trace['flatshading'] === false ? 'smooth' : 'flat',
    clip: scene ? sceneClip(scene.layout) : null,
    ...sceneMeshLighting(trace, onTextureLoad),
  };
}

/** See the module comment. */
export class IsoMeshView implements TraceView<IsoCalc> {
  #ctx: Ctx;
  #scene: Scene3D | undefined;
  #mesh: LazyMeshPrimitive | null = null;
  #offRig: (() => void) | undefined;
  #calc: IsoCalc | null = null;
  #shading: unknown;

  constructor(ctx: Ctx) {
    this.#ctx = ctx;
    this.update(ctx);
  }

  update(ctx: Ctx, plan?: TraceUpdatePlan): void {
    this.#ctx = ctx;
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    if (scene !== this.#scene) this.detach(ctx);
    this.#scene = scene;
    const calc = ctx.calc;
    if (!calc.mesh) {
      this.detach(ctx);
      return;
    }
    const geometry = !this.#mesh || calc.mesh !== this.#calc?.mesh;
    const data = isoMeshInput(ctx, calc, scene, geometry, () => this.#ctx.invalidate());
    this.#calc = calc;
    // Shading rebuilds the geometry: only send it when it changes.
    if (!geometry && data.shading === this.#shading) delete data.shading;
    else this.#shading = data.shading;
    if (!this.#mesh) {
      this.#mesh = createLazyMeshPrimitive(ctx.primitives, data as MeshInput);
      ctx.add(this.#mesh, scene.viewport);
      this.#offRig = scene.useLightRig(this.#mesh);
    } else if (!plan || geometry || plan.calc || plan.plot || plan.style) this.#mesh.update(data);
    else this.#mesh.update({ clip: data.clip ?? null });
    this.#mesh.object.renderOrder = ctx.index;
    this.#mesh.setTransform(scene.transform);
    registerScenePickable(scene, this.#mesh, ctx.index);
    ctx.invalidate();
  }

  dispose(): void {
    this.#offRig?.();
    if (this.#scene && this.#mesh) unregisterScenePickable(this.#scene, this.#mesh);
  }

  /** Drop the mesh (the trace moved to another scene, has nothing to draw, or draws otherwise). */
  detach(ctx: Ctx): void {
    this.#offRig?.();
    this.#offRig = undefined;
    if (this.#mesh) {
      if (this.#scene) unregisterScenePickable(this.#scene, this.#mesh);
      ctx.remove(this.#mesh);
      this.#mesh = null;
    }
    this.#calc = null;
  }
}
