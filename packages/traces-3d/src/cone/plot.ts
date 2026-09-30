/**
 * The `cone` view (plan E14.5): one {@link ConeSetPrimitive} (every cone in one instanced draw
 * call) in the trace's scene, colored by the norms through the trace's colorscale, lit with
 * Plotly's model (and the scene's light rig when it sets one), hoverable through the scene's GPU
 * picking.
 */
import type { TracePlotContext, TraceUpdatePlan, TraceView } from '@mk7s/holochart-runtime';
import { sceneMeshLighting } from '../scene/lighting-attributes.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { registerScenePickable, unregisterScenePickable } from '../scene/pick.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import { traceColorMapping } from '../mesh3d/colors.ts';
import type { ConeCalc } from './calc.ts';
import { ConeSetPrimitive, type ConeSetData } from './primitive.ts';

type Ctx = TracePlotContext<ConeCalc>;

/** The primitive's data for a trace and its calc. */
export function coneData(ctx: Pick<Ctx, 'trace' | 'fullLayout'>, calc: ConeCalc): ConeSetData {
  const trace = ctx.trace;
  const mapping = traceColorMapping(trace, ctx.fullLayout, [calc.normMin, calc.normMax]);
  const opacity = Number(trace['opacity']);
  const { lighting, lightposition } = sceneMeshLighting(trace);
  return {
    x: calc.x,
    y: calc.y,
    z: calc.z,
    u: calc.u,
    v: calc.v,
    w: calc.w,
    count: calc.count,
    values: calc.norm,
    colorscale: mapping?.colorscale ?? [
      [0, [0, 0, 0, 1]],
      [1, [1, 1, 1, 1]],
    ],
    interpolation: 'rgb',
    cmin: mapping?.cmin ?? 0,
    cmax: mapping?.cmax ?? 1,
    reversescale: mapping?.reversescale ?? false,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    scale: calc.vectorScale * calc.coneScale,
    offset: calc.offset,
    lighting: lighting ?? {},
    lightposition,
  };
}

/** See the module comment. */
export class ConeView implements TraceView<ConeCalc> {
  #scene: Scene3D | undefined;
  #cones: ConeSetPrimitive | null = null;
  #offRig: (() => void) | undefined;

  constructor(ctx: Ctx) {
    this.update(ctx);
  }

  update(ctx: Ctx, _plan?: TraceUpdatePlan): void {
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    if (scene !== this.#scene) this.#detach(ctx);
    this.#scene = scene;
    const data = coneData(ctx, ctx.calc);
    if (!this.#cones) {
      this.#cones = new ConeSetPrimitive(ctx.primitives, data);
      ctx.add(this.#cones, scene.viewport);
      this.#offRig = scene.useLightRig(this.#cones);
    } else this.#cones.update(data);
    this.#cones.object.renderOrder = ctx.index;
    this.#cones.setTransform(scene.transform);
    registerScenePickable(scene, this.#cones, ctx.index);
    ctx.invalidate();
  }

  dispose(): void {
    this.#offRig?.();
    if (this.#scene && this.#cones) unregisterScenePickable(this.#scene, this.#cones);
  }

  #detach(ctx: Ctx): void {
    this.#offRig?.();
    this.#offRig = undefined;
    if (this.#cones) {
      if (this.#scene) unregisterScenePickable(this.#scene, this.#cones);
      ctx.remove(this.#cones);
      this.#cones = null;
    }
  }
}
