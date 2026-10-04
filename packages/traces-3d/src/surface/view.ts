/**
 * The `surface` view (plan E14.3): the surface primitive (`primitive.ts`) in the trace's scene, the
 * projected contour lines (`projections.ts`) and the highlight lines of the hovered point.
 *
 * - **Updates**: a new calc rewrites the grid textures; everything else (colorscale, opacity,
 *   lighting, contours, wireframe, clipping to the axis box) is uniforms. Projections are
 *   recomputed on the CPU only when the grid or their levels change, and move to the far walls when
 *   the camera turns.
 * - **Highlight** (`contours.*.highlight`, Plotly's dynamic contours): on pointer moves the view
 *   asks the same hit as hover (`surfaceHitAt`) and draws the lines of constant x, y and z through
 *   the hovered grid point; they go when the pointer leaves the surface.
 * - **three.js materials** (`material.type` other than `plotly` / `flat`, E8.7): drawn with the mesh
 *   primitive instead (positions on the CPU, lit by the scene's lights, shadows), without the
 *   in-shader lines (contours, highlights, wireframe); projections still draw.
 */
import { isPlainObject, toRGBA, type RGBAColor } from '@mk7s/holochart-core';
import {
  createLazyMeshPrimitive,
  type LazyMeshPrimitive,
  type MeshInput,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { mapColor } from '@mk7s/holochart-traces-basic';
import { sceneScale, sceneTicks } from '../scene/axes.ts';
import { sceneMeshLighting } from '../scene/lighting-attributes.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { registerScenePickable, scenePicking, unregisterScenePickable } from '../scene/pick.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import type { SurfaceCalc } from './calc.ts';
import { surfaceColorMapping, type SurfaceColorMapping } from './colors.ts';
import {
  contourLevels,
  contourLines,
  levelValues,
  MAX_CONTOUR_LEVELS,
  type ContourLevels,
  type ContourPolylines,
} from './contours.ts';
import { gridX, gridY, type SurfaceGrid } from './grid.ts';
import { gridPoint, sceneClip, sceneHovers, surfaceHitAt } from './hover.ts';
import { gridNormals } from './normals.ts';
import { opacityscaleTable, SurfacePrimitive, type SurfaceData } from './primitive.ts';
import { farWalls, ProjectionLines, type ProjectionSpec } from './projections.ts';

type Vec3 = [number, number, number];
type Container = Record<string, unknown>;

const LETTERS = ['x', 'y', 'z'] as const;
const BLACK: RGBAColor = [0, 0, 0, 1];

/** Most levels projected per axis (each is a CPU pass over the grid). */
const MAX_PROJECTED_LEVELS = 256;

function obj(v: unknown): Container {
  return isPlainObject(v) ? v : {};
}

function color(v: unknown): RGBAColor {
  return (typeof v === 'string' ? toRGBA(v) : null) ?? BLACK;
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The linear tick values of scene axis `a` (the default contour levels, Plotly's). */
function axisTicks(scene: Scene3D, a: 0 | 1 | 2): number[] {
  const axis = scene.layout.axes[a];
  const scale = sceneScale(axis.full);
  scale.setRange(axis.range[0], axis.range[1]);
  // A nominal on-screen length (the drawn axes' ticks follow the camera; the levels don't).
  const r = scene.layout.rect;
  const ticks = sceneTicks(scale, axis.full, Math.min(r.width, r.height) * 0.75);
  return ticks.map((t) => t.l).sort((p, q) => p - q);
}

/** Per grid point values of coordinate `a` (vectors expanded). */
function fieldOf(grid: SurfaceGrid, a: 0 | 1 | 2): ArrayLike<number> {
  if (a === 2) return grid.z;
  if ((a === 0 && grid.xMatrix) || (a === 1 && grid.yMatrix)) return a === 0 ? grid.x : grid.y;
  const out = new Float64Array(grid.nx * grid.ny);
  for (let j = 0; j < grid.ny; j++) {
    for (let i = 0; i < grid.nx; i++) {
      out[j * grid.nx + i] = a === 0 ? gridX(grid, i, j) : gridY(grid, i, j);
    }
  }
  return out;
}

/** Positions (RTC), triangles and per-vertex values of a grid, for the mesh primitive. */
function gridMesh(grid: SurfaceGrid): Pick<MeshInput, 'positions' | 'origin' | 'indices'> {
  const { nx, ny } = grid;
  const center = (v: ArrayLike<number>): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < v.length; i++) {
      const x = v[i]!;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    return lo <= hi ? (lo + hi) / 2 : 0;
  };
  const origin: Vec3 = [center(grid.x), center(grid.y), center(grid.z)];
  const positions = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const p = gridPoint(grid, i, j);
      for (let a = 0; a < 3; a++) {
        positions[k * 3 + a] = Number.isFinite(p[a]!) ? p[a]! - origin[a]! : 3.0e38;
      }
    }
  }
  const indices = new Uint32Array(Math.max(0, (nx - 1) * (ny - 1) * 6));
  let t = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      indices.set([k, k + 1, k + nx + 1, k, k + nx + 1, k + nx], t);
      t += 6;
    }
  }
  return { positions, origin, indices };
}

/** See the module comment. */
export class SurfaceView implements TraceView<SurfaceCalc> {
  #ctx: TracePlotContext<SurfaceCalc>;
  #scene: Scene3D | undefined;
  #surface: SurfacePrimitive | null = null;
  #mesh: LazyMeshPrimitive | null = null;
  #projections: ProjectionLines;
  #calc: SurfaceCalc | null = null;
  #meshCalc: SurfaceCalc | null = null;
  #meshScale: Vec3 | null = null;
  #offCamera: (() => void) | undefined;
  #offRig: (() => void) | undefined;
  /** Projected lines by (axis, levels, grid): recomputed when that changes. */
  readonly #lineCache = new Map<string, { calc: SurfaceCalc; lines: ContourPolylines }>();
  #highlight: Vec3 | null = null;
  #mapping: SurfaceColorMapping | undefined;

  constructor(ctx: TracePlotContext<SurfaceCalc>) {
    this.#ctx = ctx;
    this.#projections = new ProjectionLines(ctx.primitives);
    this.update(ctx);
  }

  update(ctx: TracePlotContext<SurfaceCalc>, _plan?: TraceUpdatePlan): void {
    this.#ctx = ctx;
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    if (scene !== this.#scene) this.#attach(ctx, scene);
    const trace = ctx.trace;
    const calc = ctx.calc;
    const material = sceneMeshLighting(trace).material;
    const three = material !== null && material.type !== 'flat';
    this.#useMesh(ctx, scene, three);
    this.#mapping = surfaceColorMapping(trace, ctx.fullLayout);
    if (three) this.#updateMesh(scene, calc);
    else this.#updateSurface(scene, calc);
    this.#updateProjections(scene, calc);
    // Hover picks the drawn surface (a hidden one, `hidesurface`, is not hovered).
    const drawn = this.#surface ?? this.#mesh;
    if (drawn && ctx.trace['hidesurface'] !== true) registerScenePickable(scene, drawn, ctx.index);
    else if (drawn) unregisterScenePickable(scene, drawn);
    scenePicking(scene).invalidate();
    ctx.invalidate();
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const scene = this.#scene;
    const calc = this.#calc;
    if (!scene || !calc || !this.#surface) return false;
    if (event.type !== 'move' && event.type !== 'leave') return false;
    let point: Vec3 | null = null;
    if (
      event.type === 'move' &&
      this.#highlights() &&
      this.#ctx.trace['hidesurface'] !== true &&
      sceneHovers(this.#ctx.fullLayout, scene)
    ) {
      const hit = calc.grid ? surfaceHitAt(calc, scene, event.x, event.y) : null;
      if (hit && calc.grid) point = gridPoint(calc.grid, hit.i, hit.j);
    }
    const prev = this.#highlight;
    const same =
      prev === point || (prev !== null && point !== null && prev.every((v, a) => v === point![a]));
    if (!same) {
      this.#highlight = point;
      this.#surface.setHighlight(point);
    }
    return false;
  }

  dispose(): void {
    this.#offCamera?.();
    this.#offRig?.();
    this.#unregister();
  }

  #unregister(): void {
    const scene = this.#scene;
    if (!scene) return;
    if (this.#surface) unregisterScenePickable(scene, this.#surface);
    if (this.#mesh) unregisterScenePickable(scene, this.#mesh);
  }

  // -------------------------------------------------------------------------------------------

  #attach(ctx: TracePlotContext<SurfaceCalc>, scene: Scene3D): void {
    this.#offCamera?.();
    this.#offRig?.();
    this.#offRig = undefined;
    if (this.#scene) {
      this.#unregister();
      if (this.#surface) ctx.remove(this.#surface);
      if (this.#mesh) ctx.remove(this.#mesh);
      // Removed primitives are disposed: new ones for the new scene.
      ctx.remove(this.#projections);
      this.#projections = new ProjectionLines(ctx.primitives);
      this.#lineCache.clear();
      this.#surface = null;
      this.#mesh = null;
      this.#calc = this.#meshCalc = null;
    }
    this.#scene = scene;
    ctx.add(this.#projections, scene.viewport);
    this.#offCamera = scene.onCameraChange(() => this.#placeProjections());
  }

  /** Switch between the surface primitive and the mesh primitive (three.js materials). */
  #useMesh(ctx: TracePlotContext<SurfaceCalc>, scene: Scene3D, mesh: boolean): void {
    if (mesh && !this.#mesh) {
      this.#unregister();
      if (this.#surface) ctx.remove(this.#surface);
      this.#surface = null;
      this.#calc = null;
      this.#offRig?.();
      this.#mesh = createLazyMeshPrimitive(ctx.primitives, { positions: new Float32Array(0) });
      ctx.add(this.#mesh, scene.viewport);
      this.#offRig = scene.useLightRig(this.#mesh);
    } else if (!mesh && !this.#surface) {
      this.#unregister();
      if (this.#mesh) ctx.remove(this.#mesh);
      this.#mesh = null;
      this.#meshCalc = null;
      this.#meshScale = null;
      this.#offRig?.();
      this.#surface = new SurfacePrimitive(ctx.primitives);
      ctx.add(this.#surface, scene.viewport);
      this.#offRig = scene.useLightRig(this.#surface);
    }
  }

  #highlights(): boolean {
    const c = obj(this.#ctx.trace['contours']);
    return LETTERS.some((l) => obj(c[l])['highlight'] === true);
  }

  #colorDomain(): { cmin: number; cmax: number } {
    const m = this.#mapping;
    return { cmin: m?.cmin ?? 0, cmax: m?.cmax ?? 1 };
  }

  #updateSurface(scene: Scene3D, calc: SurfaceCalc): void {
    const surface = this.#surface!;
    const trace = this.#ctx.trace;
    const patch: Partial<SurfaceData> = {};
    if (calc !== this.#calc) {
      this.#calc = calc;
      patch.grid = calc.grid;
      patch.color = calc.color;
      if (this.#highlight) {
        this.#highlight = null;
        surface.setHighlight(null);
      }
    }
    const lighting = sceneMeshLighting(trace);
    const contours = obj(trace['contours']);
    const lines = LETTERS.map((l, a) => {
      const c = obj(contours[l]);
      const levels = c['show'] === true ? contourLevels(c, axisTicks(scene, a as 0 | 1 | 2)) : null;
      return levels
        ? {
            levels,
            color: color(c['color']),
            width: num(c['width'], 2),
            usecolormap: c['usecolormap'] === true,
          }
        : null;
    });
    const highlight = LETTERS.map((l) => {
      const c = obj(contours[l]);
      return c['highlight'] === true
        ? { color: color(c['highlightcolor']), width: num(c['highlightwidth'], 2) }
        : null;
    });
    const w = obj(trace['wireframe']);
    const m = this.#mapping;
    surface.update({
      ...patch,
      ...this.#colorDomain(),
      ...(m ? { colorscale: m.colorscale } : {}),
      interpolation: 'rgb',
      reversescale: m?.reversescale ?? false,
      opacity: num(trace['opacity'], 1),
      opacityscale: (trace['opacityscale'] as [number, number][] | undefined) ?? null,
      hidesurface: trace['hidesurface'] === true,
      lighting: lighting.lighting ?? {},
      lightposition: lighting.lightposition,
      unlit: lighting.material?.type === 'flat',
      contours: lines as unknown as SurfaceData['contours'],
      highlight: highlight as unknown as SurfaceData['highlight'],
      wireframe:
        w['show'] === true
          ? { color: color(w['color']), width: num(w['width'], 1), step: num(w['step'], 1) }
          : null,
      clip: sceneClip(scene.layout),
    });
    surface.setTransform(scene.transform);
    // Keep the hovered point's lines with the new styles.
    surface.setHighlight(this.#highlight);
  }

  #updateMesh(scene: Scene3D, calc: SurfaceCalc): void {
    const mesh = this.#mesh!;
    const trace = this.#ctx.trace;
    const grid = calc.grid;
    const m = this.#mapping;
    const patch: Partial<MeshInput> = {};
    const t = scene.transform;
    const scale: Vec3 = [t.scaleX, t.scaleY, t.scaleZ];
    const rescaled = !this.#meshScale || this.#meshScale.some((v, a) => v !== scale[a]);
    if (calc !== this.#meshCalc) {
      this.#meshCalc = calc;
      Object.assign(patch, grid ? gridMesh(grid) : { positions: new Float32Array(0) });
    }
    // The shader's normals (world units), so both paths shade alike.
    if (grid && (rescaled || 'positions' in patch)) {
      this.#meshScale = scale;
      patch.normals = gridNormals(grid, scale, true);
    }
    const values = calc.color ?? grid?.z ?? null;
    const { cmin, cmax } = this.#colorDomain();
    const stops = trace['opacityscale'] as [number, number][] | undefined;
    let alpha: Float32Array | null = null;
    if (stops && values) {
      const table = opacityscaleTable(stops);
      alpha = new Float32Array(values.length);
      for (let k = 0; k < values.length; k++) {
        const t = Math.min(1, Math.max(0, (values[k]! - cmin) / (cmax - cmin || 1)));
        alpha[k] = Number.isFinite(t) ? table[Math.round(t * 255)]! : 1;
      }
    }
    mesh.update({
      ...patch,
      intensity: values,
      ...(m ? { colorscale: m.colorscale } : {}),
      interpolation: 'rgb',
      cmin,
      cmax,
      reversescale: m?.reversescale ?? false,
      opacity: trace['hidesurface'] === true ? 0 : num(trace['opacity'], 1),
      alpha,
      ...sceneMeshLighting(trace, () => this.#ctx.invalidate()),
      clip: sceneClip(scene.layout),
    });
    mesh.setTransform(scene.transform);
  }

  /** The projected contour lines (`contours.*.project`). */
  #updateProjections(scene: Scene3D, calc: SurfaceCalc): void {
    const grid = calc.grid;
    const trace = this.#ctx.trace;
    const contours = obj(trace['contours']);
    const specs: ProjectionSpec[] = [];
    const keep = new Set<string>();
    if (grid) {
      for (let a = 0 as 0 | 1 | 2; a < 3; a = (a + 1) as 0 | 1 | 2) {
        const c = obj(contours[LETTERS[a]]);
        const project = obj(c['project']);
        const walls = ([0, 1, 2] as const).filter((w) => project[LETTERS[w]] === true);
        if (c['show'] !== true || walls.length === 0) continue;
        const levels = contourLevels(c, axisTicks(scene, a));
        if (!levels) continue;
        const lines = this.#lines(calc, grid, a, levels);
        keep.add(String(a));
        const colors = c['usecolormap'] === true ? this.#lineColors(lines) : null;
        for (const w of walls) {
          specs.push({
            key: `${a}${w}`,
            wall: w,
            lines,
            color: colors ?? color(c['color']),
            width: num(c['width'], 2),
            opacity: num(trace['opacity'], 1),
          });
        }
      }
    }
    for (const key of this.#lineCache.keys()) if (!keep.has(key[0]!)) this.#lineCache.delete(key);
    this.#projections.setLines(specs);
    this.#placeProjections();
  }

  /** Contour lines of axis `a` at `levels`, cached per grid and levels. */
  #lines(calc: SurfaceCalc, grid: SurfaceGrid, a: 0 | 1 | 2, levels: ContourLevels) {
    const count = Math.min(levels.count, MAX_PROJECTED_LEVELS, MAX_CONTOUR_LEVELS);
    const key = `${a}:${levels.start}:${levels.size}:${count}`;
    const hit = this.#lineCache.get(key);
    if (hit && hit.calc === calc) return hit.lines;
    for (const k of this.#lineCache.keys()) if (k[0] === String(a)) this.#lineCache.delete(k);
    const lines = contourLines(
      {
        nx: grid.nx,
        ny: grid.ny,
        x: fieldOf(grid, 0),
        y: fieldOf(grid, 1),
        z: grid.z,
        field: fieldOf(grid, a),
        value: calc.color ?? grid.z,
      },
      levelValues({ ...levels, count }),
    );
    this.#lineCache.set(key, { calc, lines });
    return lines;
  }

  /** Per-point colors of projected lines colored by the colorscale (`usecolormap`). */
  #lineColors(lines: ContourPolylines): Float32Array | null {
    const m = this.#mapping;
    const v = lines.v;
    if (!m || !v) return null;
    const out = new Float32Array(v.length * 4);
    for (let k = 0; k < v.length; k++) out.set(mapColor(v[k]!, m), k * 4);
    return out;
  }

  /** Move the projections to the far walls of the current camera. */
  #placeProjections(): void {
    const scene = this.#scene;
    if (!scene) return;
    const cam = scene.camera;
    const toward: Vec3 =
      scene.projection === 'orthographic'
        ? [cam.eye[0] - cam.center[0], cam.eye[1] - cam.center[1], cam.eye[2] - cam.center[2]]
        : [cam.eye[0], cam.eye[1], cam.eye[2]];
    this.#projections.setScene(scene.transform, farWalls(toward, [0, 0, 0], scene.layout.aspect));
  }
}
