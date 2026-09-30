/** Test doubles for the scene tests (not exported): a minimal 3D trace and its registry. */
import { attr, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type TraceModule } from '@mk7s/holochart-runtime';
import { scatter } from '@mk7s/holochart-traces-basic';
import { sceneExtent, sceneScales } from '../axes.ts';
import { sceneComponent } from '../component.ts';
import { sceneIdAttribute } from '../layout-attributes.ts';
import { sceneOf } from '../layout-defaults.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain, type SceneCalc } from '../layout.ts';

export interface PointsCalc extends SceneCalc {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
}

/** A 3D trace with `x`, `y`, `z` and no view. */
export const points3d: TraceModule<PointsCalc> = {
  type: 'points3d',
  categories: ['gl3d'],
  schema: attr.object({
    scene: sceneIdAttribute,
    x: attr.dataArray({ editType: 'calc' }),
    y: attr.dataArray({ editType: 'calc' }),
    z: attr.dataArray({ editType: 'calc' }),
  }),
  meta: { description: 'Test 3D points.' },
  supplyDefaults(_in, _out: FullTrace, ctx) {
    for (const k of ['scene', 'x', 'y', 'z']) ctx.coerce(k);
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
};

export const registry = createChartRegistry().register(points3d, scatter, sceneComponent);

/** Supply defaults with the Plotly look (`template: 'none'` unless given). */
export function defaults(data: unknown[], layout: Record<string, unknown> = {}) {
  return supplyDefaults(
    {
      data: data.map((t) => ({ type: 'points3d', ...(t as object) })),
      layout: { template: 'none', ...layout },
    },
    registry.core,
  );
}
