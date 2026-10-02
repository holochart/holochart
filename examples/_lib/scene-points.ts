/**
 * A dev-only 3D trace for the scene examples (M6 wave 0): plain three.js points in a scene, built
 * on the scene contract 3D traces use (`scene/index.ts` of `@mk7s/holochart-traces-3d`) until
 * `scatter3d` lands. Not part of any bundle; `registerScenePoints()` registers it as `scenepoints`.
 */
import {
  acquireScene,
  attr,
  register,
  sceneCrossTraceLayout,
  sceneExtent,
  sceneIdAttribute,
  sceneOf,
  sceneScales,
  sceneSubplotDomain,
  toRGBA,
  type CommonTraceAttributes,
  type DataColumn,
  type Scene3D,
  type SceneCalc,
  type TraceModule,
  type TracePlotContext,
} from '@mk7s/holochart';
import type { Primitive } from '@mk7s/holochart-render';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Points,
  PointsMaterial,
  SRGBColorSpace,
} from 'three';

interface PointsCalc extends SceneCalc {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
}

/** A round sprite for the points (drawn once). */
let dot: CanvasTexture | undefined;
function dotTexture(): CanvasTexture {
  if (dot) return dot;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  dot = new CanvasTexture(canvas);
  return dot;
}

class PointsPrimitive implements Primitive<never> {
  readonly object: Points<BufferGeometry, PointsMaterial>;
  constructor() {
    this.object = new Points(
      new BufferGeometry(),
      new PointsMaterial({ sizeAttenuation: false, map: dotTexture(), alphaTest: 0.5 }),
    );
    this.object.frustumCulled = false;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

class PointsView {
  readonly #points = new PointsPrimitive();
  #scene: Scene3D | undefined;

  constructor(ctx: TracePlotContext<PointsCalc>) {
    this.update(ctx);
  }

  update(ctx: TracePlotContext<PointsCalc>): void {
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    if (scene !== this.#scene) {
      if (this.#scene) ctx.remove(this.#points);
      ctx.add(this.#points, scene.viewport);
      this.#scene = scene;
    }
    const { x, y, z } = ctx.calc;
    const pos = new Float32Array(x.length * 3);
    const w: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < x.length; i++) {
      scene.toWorld(x[i]!, y[i]!, z[i]!, w);
      pos.set(w, i * 3);
    }
    const geometry = this.#points.object.geometry;
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    const material = this.#points.object.material;
    const c = toRGBA(String(ctx.trace['color'])) ?? [0.5, 0.5, 0.5, 1];
    material.color = new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace);
    material.size = Number(ctx.trace['size']) * scene.viewport.size.pixelRatio;
    material.needsUpdate = true;
    ctx.invalidate();
  }
}

/** The dev trace module (see the module comment). */
export const scenePoints: TraceModule<PointsCalc> = {
  type: 'scenepoints',
  categories: ['gl3d'],
  touchAction: 'none',
  schema: attr.object({
    scene: sceneIdAttribute,
    x: attr.dataArray({ editType: 'calc', description: 'x coordinates.' }),
    y: attr.dataArray({ editType: 'calc', description: 'y coordinates.' }),
    z: attr.dataArray({ editType: 'calc', description: 'z coordinates.' }),
    color: attr.color({ editType: 'plot', description: 'Point color.' }),
    size: attr.number({ min: 0, dflt: 5, editType: 'plot', description: 'Point size, px.' }),
  }),
  meta: { description: 'Dev only: three.js points in a 3D scene (tests the scene subplot).' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('scene');
    ctx.coerce('x');
    ctx.coerce('y');
    ctx.coerce('z');
    ctx.coerce('color', ctx.defaultColor);
    ctx.coerce('size');
  },
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc(trace, ctx) {
    const s = sceneScales(ctx.fullLayout, sceneOf(trace));
    const col = (k: string): ArrayLike<unknown> => (trace[k] as ArrayLike<unknown>) ?? [];
    const x = s.x.d2lArray(col('x'));
    const y = s.y.d2lArray(col('y'));
    const z = s.z.d2lArray(col('z'));
    return { x, y, z, sceneExtremes: { x: sceneExtent(x), y: sceneExtent(y), z: sceneExtent(z) } };
  },
  plot: { create: (ctx) => new PointsView(ctx) },
};

/** A `scenepoints` trace, as figures give it. */
export type ScenePointsTrace = CommonTraceAttributes & {
  type: 'scenepoints';
  scene?: 'scene' | `scene${number}`;
  x?: DataColumn;
  y?: DataColumn;
  z?: DataColumn;
  color?: string;
  size?: number;
};

// Figures typed against the full bundle (`Figure`) accept `scenepoints` traces once this module is
// part of the program: a plugin adds its trace type to `TraceTypes` (backlog S1.6).
declare module '@mk7s/holochart' {
  interface TraceTypes {
    scenepoints: ScenePointsTrace;
  }
}

/** Register `scenepoints` (once per page). */
export function registerScenePoints(): void {
  register(scenePoints);
}
