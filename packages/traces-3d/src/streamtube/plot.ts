/**
 * The `streamtube` view (plan E14.6): the tubes as one mesh (render's lazily loaded mesh
 * primitive) in the trace's scene — a ring of vertices per sample (`tube.ts`), smooth normals,
 * the sample norms as per-vertex intensity through the trace's colorscale (sampled per fragment),
 * lit with Plotly's model (`lighting`, `lightposition`; `material`; the scene's light rig when it
 * sets one) and picked per vertex for hover. The rings are round in scene units, so the geometry
 * is rebuilt when the scene's axis scales change (aspect ratio, ranges), not on camera moves.
 */
import {
  createLazyMeshPrimitive,
  type LazyMeshPrimitive,
  type MeshInput,
  type Vec3,
} from '@mk7s/holochart-render';
import type { TracePlotContext, TraceUpdatePlan, TraceView } from '@mk7s/holochart-runtime';
import { traceColorMapping } from '../mesh3d/colors.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { sceneMeshLighting } from '../scene/lighting-attributes.ts';
import { registerScenePickable, unregisterScenePickable } from '../scene/pick.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import type { StreamtubeCalc } from './calc.ts';
import { tubeGeometry, TUBE_FACETS } from './tube.ts';

type Ctx = TracePlotContext<StreamtubeCalc>;

/** Per-vertex intensity: each sample's norm on its ring's vertices. */
export function tubeIntensity(calc: StreamtubeCalc): Float32Array {
  const out = new Float32Array(calc.count * TUBE_FACETS);
  for (let i = 0; i < calc.count; i++) {
    out.fill(calc.norm[i]!, i * TUBE_FACETS, (i + 1) * TUBE_FACETS);
  }
  return out;
}

/** The mesh fields that don't depend on the geometry: colors, opacity, lighting. */
export function streamtubeStyle(
  ctx: Pick<Ctx, 'trace' | 'fullLayout'>,
  calc: StreamtubeCalc,
  onTextureLoad?: () => void,
): Omit<MeshInput, 'positions'> {
  const trace = ctx.trace;
  const mapping = traceColorMapping(trace, ctx.fullLayout, [calc.normMin, calc.normMax]);
  const opacity = Number(trace['opacity']);
  return {
    color: [1, 1, 1, 1],
    colorscale: mapping?.colorscale ?? [
      [0, [0, 0, 0, 1]],
      [1, [1, 1, 1, 1]],
    ],
    interpolation: 'rgb',
    cmin: mapping?.cmin ?? calc.normMin,
    cmax: mapping?.cmax ?? calc.normMax,
    reversescale: mapping?.reversescale ?? false,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    ...sceneMeshLighting(trace, onTextureLoad),
  };
}

/** See the module comment. */
export class StreamtubeView implements TraceView<StreamtubeCalc> {
  #ctx: Ctx;
  #scene: Scene3D | undefined;
  #mesh: LazyMeshPrimitive | null = null;
  #offRig: (() => void) | undefined;
  #calc: StreamtubeCalc | null = null;
  #world: Vec3 = [NaN, NaN, NaN];

  constructor(ctx: Ctx) {
    this.#ctx = ctx;
    this.update(ctx);
  }

  update(ctx: Ctx, _plan?: TraceUpdatePlan): void {
    this.#ctx = ctx;
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    if (scene !== this.#scene) this.#detach(ctx);
    this.#scene = scene;
    const calc = ctx.calc;
    const t = scene.transform;
    const world: Vec3 = [t.scaleX, t.scaleY, t.scaleZ];
    const rebuild =
      !this.#mesh || calc !== this.#calc || world.some((w, a) => w !== this.#world[a]);
    const style = streamtubeStyle(ctx, calc, () => this.#ctx.invalidate());
    if (rebuild) {
      const g = tubeGeometry(calc.streams, calc.radius, calc.dataScale, world);
      const data: MeshInput = {
        ...style,
        positions: g.positions,
        origin: g.origin,
        normals: g.normals,
        indices: g.indices,
        intensity: tubeIntensity(calc),
        intensityMode: 'vertex',
      };
      if (!this.#mesh) {
        this.#mesh = createLazyMeshPrimitive(ctx.primitives, data);
        ctx.add(this.#mesh, scene.viewport);
        this.#offRig = scene.useLightRig(this.#mesh);
      } else this.#mesh.update(data);
      this.#calc = calc;
      this.#world = world;
    } else this.#mesh!.update(style);
    const mesh = this.#mesh!;
    mesh.object.renderOrder = ctx.index;
    mesh.setTransform(scene.transform);
    registerScenePickable(scene, mesh, ctx.index);
    ctx.invalidate();
  }

  dispose(): void {
    this.#offRig?.();
    if (this.#scene && this.#mesh) unregisterScenePickable(this.#scene, this.#mesh);
  }

  #detach(ctx: Ctx): void {
    this.#offRig?.();
    this.#offRig = undefined;
    if (this.#mesh) {
      if (this.#scene) unregisterScenePickable(this.#scene, this.#mesh);
      ctx.remove(this.#mesh);
      this.#mesh = null;
    }
  }
}
