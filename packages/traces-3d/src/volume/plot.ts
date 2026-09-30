/**
 * The `volume` view (plan E14.7): Plotly's stacked isosurfaces through `isosurface`'s mesh view
 * (`render: 'isosurfaces'`), or the ray-marched volume primitive (`render: 'raymarch'`,
 * `raymarch.ts`) with the transfer function of the trace's colorscale, `opacity` and
 * `opacityscale`, clipped to the scene's axis ranges; its CPU hover reads the same spec
 * (`raymarch-hover.ts`).
 */
import type { TracePlotContext, TraceUpdatePlan, TraceView } from '@mk7s/holochart-runtime';
import { sceneOf } from '../scene/layout-defaults.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import { sceneClip } from '../surface/hover.ts';
import { traceColorMapping } from '../mesh3d/colors.ts';
import type { IsoCalc } from '../isosurface/calc.ts';
import { IsoMeshView } from '../isosurface/plot.ts';
import { RAYMARCH_HOVER } from './raymarch-hover.ts';
import { VolumeRayMarchPrimitive, type RayMarchData } from './raymarch.ts';

type Ctx = TracePlotContext<IsoCalc>;
type Container = Record<string, unknown>;

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The ray-march primitive's data for a trace and its calc. */
export function rayMarchData(
  ctx: Pick<Ctx, 'trace' | 'fullLayout'>,
  calc: IsoCalc,
  scene: Scene3D | null,
): RayMarchData {
  const trace = ctx.trace;
  const grid = calc.grid;
  const mapping = traceColorMapping(trace, ctx.fullLayout, [calc.isomin, calc.isomax]) ?? null;
  const raymarch = (trace['raymarch'] ?? {}) as Container;
  const lighting = (trace['lighting'] ?? {}) as Container;
  const domain: [number, number] =
    grid.valueMin <= grid.valueMax ? [grid.valueMin, grid.valueMax] : [0, 1];
  return {
    grid,
    transfer: {
      domain,
      mapping,
      opacity: num(trace['opacity'], 1),
      opacityscale: (trace['opacityscale'] as [number, number][] | undefined) ?? null,
    },
    isomin: calc.isomin,
    isomax: calc.isomax,
    step: num(raymarch['step'], 0.5),
    shading: raymarch['shading'] === true,
    ambient: num(lighting['ambient'], 0.8),
    diffuse: num(lighting['diffuse'], 0.8),
    clip: scene ? sceneClip(scene.layout) : null,
  };
}

/** See the module comment. */
export class VolumeView implements TraceView<IsoCalc> {
  #mesh: IsoMeshView | null = null;
  #volume: VolumeRayMarchPrimitive | null = null;
  #scene: Scene3D | undefined;

  constructor(ctx: Ctx) {
    this.update(ctx);
  }

  update(ctx: Ctx, plan?: TraceUpdatePlan): void {
    if (ctx.trace['render'] !== 'raymarch') {
      this.#dropVolume(ctx);
      if (this.#mesh) this.#mesh.update(ctx, plan);
      else this.#mesh = new IsoMeshView(ctx);
      return;
    }
    if (this.#mesh) {
      this.#mesh.detach(ctx);
      this.#mesh.dispose();
      this.#mesh = null;
    }
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    if (scene !== this.#scene) this.#dropVolume(ctx);
    this.#scene = scene;
    const data = rayMarchData(ctx, ctx.calc, scene);
    RAYMARCH_HOVER.set(ctx.calc, data);
    if (!this.#volume) {
      this.#volume = new VolumeRayMarchPrimitive(ctx.primitives, data);
      ctx.add(this.#volume, scene.viewport);
    } else this.#volume.update(data);
    this.#volume.object.renderOrder = ctx.index;
    this.#volume.setTransform(scene.transform);
    ctx.invalidate();
  }

  dispose(): void {
    this.#mesh?.dispose();
  }

  #dropVolume(ctx: Ctx): void {
    if (!this.#volume) return;
    ctx.remove(this.#volume);
    this.#volume = null;
  }
}
