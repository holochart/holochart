/**
 * A dev-only 3D mesh trace for the lighting and material examples (M6 wave 1, plan E8.7): a torus,
 * sphere or ground tile drawn with the mesh primitive, declaring Plotly's `lighting` /
 * `lightposition` (mesh3d defaults) and the Holochart `material` through the shared builders of
 * `@mk7s/holochart-traces-3d` (`scene/lighting-attributes.ts`), and lit by the scene's rig
 * (`scene.useLightRig`). Not part of any bundle; `registerSceneMesh()` registers it as `scenemesh`.
 */
import {
  acquireScene,
  attr,
  register,
  sceneCrossTraceLayout,
  sceneIdAttribute,
  sceneLightingAttributes,
  sceneMaterialAttributes,
  sceneMeshLighting,
  sceneOf,
  sceneSubplotDomain,
  supplySceneLightingDefaults,
  toRGBA,
  type Scene3D,
  type SceneCalc,
  type TraceModule,
  type TracePlotContext,
} from '@mk7s/holochart';
import { createLazyMeshPrimitive, type LazyMeshPrimitive } from '@mk7s/holochart-render';
import { sphere, surfaceGrid, torus, type MeshShape } from './mesh3d.ts';

interface MeshCalc extends SceneCalc {
  /** Positions in linear data coordinates. */
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

function shapeOf(kind: unknown, size: number): MeshShape {
  if (kind === 'sphere') return sphere(size, [0, 0, 0], 48, 24);
  if (kind === 'tile') return surfaceGrid(8, () => 0);
  return torus(size, size * 0.4, 64, 24);
}

class MeshView {
  #mesh: LazyMeshPrimitive | undefined;
  #scene: Scene3D | undefined;
  #stop: (() => void) | undefined;

  constructor(ctx: TracePlotContext<MeshCalc>) {
    this.update(ctx);
  }

  update(ctx: TracePlotContext<MeshCalc>): void {
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    const color = toRGBA(String(ctx.trace['color'])) ?? [0.5, 0.5, 0.5, 1];
    const data = {
      positions: ctx.calc.positions,
      indices: ctx.calc.indices,
      color,
      ...sceneMeshLighting(ctx.trace, () => ctx.invalidate()),
    };
    if (!this.#mesh || scene !== this.#scene) {
      this.#stop?.();
      if (this.#mesh) ctx.remove(this.#mesh);
      this.#mesh = createLazyMeshPrimitive(ctx.primitives, data);
      ctx.add(this.#mesh, scene.viewport);
      this.#stop = scene.useLightRig(this.#mesh);
      this.#scene = scene;
    } else this.#mesh.update(data);
    this.#mesh.setTransform(scene.transform);
    ctx.invalidate();
  }

  /** The runtime disposes the mesh; stop taking the scene's lights. */
  dispose(): void {
    this.#stop?.();
  }
}

/** The dev trace module (see the module comment). */
export const sceneMesh: TraceModule<MeshCalc> = {
  type: 'scenemesh',
  categories: ['gl3d'],
  touchAction: 'none',
  schema: attr.object({
    scene: sceneIdAttribute,
    shape: attr.enumerated({
      values: ['torus', 'sphere', 'tile'],
      dflt: 'torus',
      editType: 'calc',
      description: 'The shape.',
    }),
    x: attr.number({ dflt: 0, editType: 'calc', description: 'Center x.' }),
    y: attr.number({ dflt: 0, editType: 'calc', description: 'Center y.' }),
    z: attr.number({ dflt: 0, editType: 'calc', description: 'Center z.' }),
    size: attr.number({
      min: 0,
      dflt: 1,
      editType: 'calc',
      description: 'Radius (tile: half-width).',
    }),
    color: attr.color({ editType: 'calc', description: 'Surface color.' }),
    ...sceneLightingAttributes('mesh3d'),
    ...sceneMaterialAttributes,
  }),
  meta: { description: 'Dev only: a lit mesh in a 3D scene (tests materials and lighting).' },
  supplyDefaults(_in, _out, ctx) {
    for (const k of ['scene', 'shape', 'x', 'y', 'z', 'size']) ctx.coerce(k);
    ctx.coerce('color', ctx.defaultColor);
    supplySceneLightingDefaults(ctx);
  },
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc(trace) {
    const size = Number(trace['size']);
    const shape = shapeOf(trace['shape'], size);
    const c = [Number(trace['x']), Number(trace['y']), Number(trace['z'])];
    const k = trace['shape'] === 'tile' ? size : 1;
    const positions = shape.positions.map((v, i) => v * k + c[i % 3]!);
    const axis = (i: number): [number, number] => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = i; j < positions.length; j += 3) {
        lo = Math.min(lo, positions[j]!);
        hi = Math.max(hi, positions[j]!);
      }
      return [lo, hi];
    };
    return {
      positions,
      indices: shape.indices,
      sceneExtremes: { x: axis(0), y: axis(1), z: axis(2) },
    };
  },
  plot: { create: (ctx) => new MeshView(ctx) },
};

/** Register `scenemesh` (once per page). */
export function registerSceneMesh(): void {
  register(sceneMesh);
}
