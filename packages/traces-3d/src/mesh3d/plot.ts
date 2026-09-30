/**
 * The `mesh3d` view (plan E14.4): the mesh primitive (render's lazily loaded `MeshPrimitive`) in
 * the trace's scene, and the hover contour.
 *
 * - **Geometry**: the vertices relative to a float64 origin (their box center), the triangles of
 *   calc, normals computed by the primitive with Plotly's epsilons on Plotly's scaled coordinates
 *   (`normalScale`: 1 / data span per axis). Triangles with a missing vertex are dropped.
 * - **Colors** (Plotly's precedence): `intensity` → the colorscale sampled per fragment
 *   (`intensitymode: 'cell'`: one value per triangle); else `vertexcolor` (interpolated), else
 *   `facecolor`, else `color`. Per-triangle values expand the geometry (three vertices per
 *   triangle), as does `flatshading` (face normals); the mesh then picks triangles.
 * - **Lighting**: `lighting`, `lightposition` and `material` through the scene's lighting
 *   attributes (`scene/lighting-attributes.ts`), and the scene's light rig when it sets one.
 * - **Hover contour** (`contour.show`): hover (`hover.ts`) tells the view which vertex or triangle
 *   it shows; the view draws the level set through it with a 3D line (render's lazily loaded
 *   `Line3D`, `contour.color`, `contour.width` px), and removes it when hover moves off the mesh.
 */
import { isArrayLike, toRGBA } from '@mk7s/holochart-core';
import {
  createLazyMeshPrimitive,
  loadLinesMarkers3D,
  type LazyMeshPrimitive,
  type Line3D,
  type MeshInput,
  type RGBA,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { sceneMeshLighting } from '../scene/lighting-attributes.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { registerScenePickable, unregisterScenePickable } from '../scene/pick.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import type { Mesh3dCalc } from './calc.ts';
import { cssColors, numbersOf, traceColorMapping } from './colors.ts';
import {
  contourField,
  contourLevel,
  isoSegments,
  MESH_HOVER_LISTENERS,
  type MeshHit,
} from './hover.ts';

type Vec3 = [number, number, number];
type Ctx = TracePlotContext<Mesh3dCalc>;

const HIDDEN = 3.0e38;

/** Positions relative to the center of the vertices' box (the primitive's float64 origin). */
export function meshPositions(calc: Mesh3dCalc): { positions: Float32Array; origin: Vec3 } {
  const n = calc.count;
  const cols = [calc.x, calc.y, calc.z];
  const origin = cols.map((c) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = c[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return lo <= hi ? (lo + hi) / 2 : 0;
  }) as Vec3;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const v = cols[a]![i]!;
      positions[i * 3 + a] = Number.isFinite(v) ? v - origin[a]! : HIDDEN;
    }
  }
  return { positions, origin };
}

/** The color fields of the mesh primitive for a defaulted trace (Plotly's precedence). */
export function meshColors(
  ctx: Pick<Ctx, 'trace' | 'fullLayout'>,
  calc: Mesh3dCalc,
): Pick<
  MeshInput,
  | 'color'
  | 'faceColor'
  | 'intensity'
  | 'intensityMode'
  | 'colorscale'
  | 'interpolation'
  | 'cmin'
  | 'cmax'
  | 'reversescale'
> {
  const trace = ctx.trace;
  const triangles = calc.triangles.length / 3;
  const none = { faceColor: null, intensity: null, intensityMode: 'vertex' as const };
  if (isArrayLike(trace['intensity'])) {
    const cell = trace['intensitymode'] === 'cell';
    const values = numbersOf(trace['intensity'], cell ? triangles : calc.count);
    const mapping = traceColorMapping(trace, ctx.fullLayout, values);
    if (mapping) {
      return {
        ...none,
        color: [1, 1, 1, 1],
        intensity: values,
        intensityMode: cell ? 'cell' : 'vertex',
        colorscale: mapping.colorscale,
        interpolation: 'rgb',
        cmin: mapping.cmin,
        cmax: mapping.cmax,
        reversescale: mapping.reversescale,
      };
    }
  }
  if (isArrayLike(trace['vertexcolor'])) {
    return { ...none, color: cssColors(trace['vertexcolor'], calc.count) };
  }
  if (isArrayLike(trace['facecolor'])) {
    return { ...none, color: [1, 1, 1, 1], faceColor: cssColors(trace['facecolor'], triangles) };
  }
  const rgba: RGBA = (typeof trace['color'] === 'string' ? toRGBA(trace['color']) : null) ?? [
    0, 0, 0, 1,
  ];
  return { ...none, color: rgba };
}

/** See the module comment. */
export class Mesh3dView implements TraceView<Mesh3dCalc> {
  #ctx: Ctx;
  #scene: Scene3D | undefined;
  #mesh: LazyMeshPrimitive | null = null;
  #offRig: (() => void) | undefined;
  #calc: Mesh3dCalc | null = null;
  #contour: Line3D | null = null;
  #contourLoading = false;
  #hit: MeshHit | null = null;
  #field: Float64Array | null = null;
  #disposed = false;

  constructor(ctx: Ctx) {
    this.#ctx = ctx;
    this.update(ctx);
  }

  update(ctx: Ctx, plan?: TraceUpdatePlan): void {
    this.#ctx = ctx;
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    const calc = ctx.calc;
    if (scene !== this.#scene) this.#detach(ctx);
    this.#scene = scene;
    const full = !this.#mesh || !plan || plan.calc || plan.plot || calc !== this.#calc;
    if (!this.#mesh) {
      this.#mesh = createLazyMeshPrimitive(ctx.primitives, this.#meshData(calc));
      this.#mesh.object.renderOrder = ctx.index;
      ctx.add(this.#mesh, scene.viewport);
      this.#offRig = scene.useLightRig(this.#mesh);
    } else if (full || plan?.style) this.#mesh.update(this.#meshData(calc));
    this.#mesh.object.renderOrder = ctx.index;
    this.#mesh.setTransform(scene.transform);
    registerScenePickable(scene, this.#mesh, ctx.index);
    if (calc !== this.#calc) {
      if (this.#calc) MESH_HOVER_LISTENERS.delete(this.#calc);
      this.#calc = calc;
      this.#field = null;
      this.#hit = null;
    }
    MESH_HOVER_LISTENERS.set(calc, (hit) => this.#hover(hit));
    this.#updateContour();
    ctx.invalidate();
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    if (event.type === 'leave') this.#hover(null);
    return false;
  }

  dispose(): void {
    this.#disposed = true;
    this.#offRig?.();
    if (this.#scene && this.#mesh) unregisterScenePickable(this.#scene, this.#mesh);
    if (this.#calc) MESH_HOVER_LISTENERS.delete(this.#calc);
  }

  // -------------------------------------------------------------------------------------------

  /** Drop what lives in the previous scene (the trace moved to another scene). */
  #detach(ctx: Ctx): void {
    this.#offRig?.();
    this.#offRig = undefined;
    if (this.#mesh) {
      if (this.#scene) unregisterScenePickable(this.#scene, this.#mesh);
      ctx.remove(this.#mesh);
      this.#mesh = null;
    }
    if (this.#contour) {
      ctx.remove(this.#contour);
      this.#contour = null;
    }
  }

  #meshData(calc: Mesh3dCalc): MeshInput {
    const ctx = this.#ctx;
    const trace = ctx.trace;
    const { positions, origin } = meshPositions(calc);
    const opacity = Number(trace['opacity']);
    return {
      positions,
      origin,
      indices: calc.triangles,
      normals: null,
      normalScale: [...calc.dataScale],
      ...meshColors(ctx, calc),
      opacity: Number.isFinite(opacity) ? opacity : 1,
      shading: trace['flatshading'] === true ? 'flat' : 'smooth',
      ...sceneMeshLighting(trace, () => this.#ctx.invalidate()),
    };
  }

  #contourStyle(): { color: RGBA; width: number } | null {
    const c = this.#ctx.trace['contour'] as Record<string, unknown> | undefined;
    if (!c || c['show'] !== true) return null;
    const color = (typeof c['color'] === 'string' ? toRGBA(c['color']) : null) ?? [0, 0, 0, 1];
    const width = Number(c['width']);
    return { color: [color[0], color[1], color[2], 1], width: width > 0 ? width : 2 };
  }

  #hover(hit: MeshHit | null): void {
    const prev = this.#hit;
    if (prev === hit || (prev && hit && prev.kind === hit.kind && prev.index === hit.index)) {
      return;
    }
    this.#hit = hit;
    if (this.#contourStyle()) {
      this.#updateContour();
      this.#ctx.invalidate();
    }
  }

  /** Draw (or clear) the hover contour through the hovered point. */
  #updateContour(): void {
    const style = this.#contourStyle();
    const scene = this.#scene;
    const calc = this.#calc;
    if (!style || !scene || !calc) {
      this.#contour?.update({ x: [], y: [], z: [] });
      return;
    }
    if (!this.#contour) {
      if (!this.#contourLoading) this.#loadContour();
      return;
    }
    const hit = this.#hit;
    let line: { x: ArrayLike<number>; y: ArrayLike<number>; z: ArrayLike<number> } = {
      x: [],
      y: [],
      z: [],
    };
    if (hit) {
      this.#field ??= contourField(this.#ctx.trace, calc);
      line = isoSegments(calc, this.#field, contourLevel(this.#field, calc, hit));
    }
    this.#contour.update({ ...line, color: style.color, width: style.width });
    this.#contour.setTransform(scene.transform);
    this.#contour.object.renderOrder = this.#ctx.index;
  }

  #loadContour(): void {
    this.#contourLoading = true;
    void loadLinesMarkers3D().then((m) => {
      this.#contourLoading = false;
      const scene = this.#scene;
      if (this.#disposed || this.#contour || !scene) return;
      const line = m.createLine3D(this.#ctx.primitives, { x: [], y: [], z: [] });
      // Over the triangles it lies on (a slight depth bias instead of z-fighting).
      line.material.polygonOffset = true;
      line.material.polygonOffsetFactor = -2;
      line.material.polygonOffsetUnits = -2;
      this.#contour = line;
      this.#ctx.add(line, scene.viewport);
      this.#updateContour();
      this.#ctx.invalidate();
    });
  }
}
