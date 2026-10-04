/**
 * `streamtube` calc: `normMin` / `normMax`, the smallest and largest vector norm of the field's
 * grid (the colorscale's default domain, as Plotly's colorscale calc over the norms), when some
 * vectors are missing: norms that are not finite are left out; without any, the range is 0 / 0.
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcStreamtube } from './calc.ts';
import { streamtube } from './index.ts';

const registry = createChartRegistry().register(streamtube, sceneComponent);

function calcOf(trace: Record<string, unknown>) {
  const r = supplyDefaults(
    { data: [{ type: 'streamtube', ...trace }], layout: { template: 'none' } },
    registry.core,
  );
  const full = r.fullData[0]!;
  return { trace: full, calc: calcStreamtube(full, { fullLayout: r.fullLayout } as CalcContext) };
}

/** A grid on `{0, 1, 2}² × {0, 1}` (x fastest) flowing along +y at speed `v(x)`. */
function field(v: (x: number) => unknown) {
  const out = {
    x: [] as number[],
    y: [] as number[],
    z: [] as number[],
    u: [] as number[],
    v: [] as unknown[],
    w: [] as number[],
  };
  for (const z of [0, 1]) {
    for (const y of [0, 1, 2]) {
      for (const x of [0, 1, 2]) {
        out.x.push(x);
        out.y.push(y);
        out.z.push(z);
        out.u.push(0);
        out.v.push(v(x));
        out.w.push(0);
      }
    }
  }
  return out;
}

describe('streamtube calc: the norm range of the grid', () => {
  it('spans the norms of all the vectors', () => {
    // Speeds 1, 2, 3 at x = 0, 1, 2.
    const { calc } = calcOf(field((x) => 1 + x));
    expect(calc.grid).not.toBeNull();
    expect([calc.normMin, calc.normMax]).toEqual([1, 3]);
  });

  it('leaves out vectors with a missing component', () => {
    // No speed at x = 2: the norms 1 and 2 remain.
    const { calc } = calcOf(field((x) => (x === 2 ? null : 1 + x)));
    expect(calc.grid).not.toBeNull();
    expect([calc.normMin, calc.normMax]).toEqual([1, 2]);
  });

  it('is 0 / 0 when no vector has a norm', () => {
    const { trace, calc } = calcOf(field(() => null));
    expect(trace.visible).toBe(true);
    expect(calc.grid).not.toBeNull();
    expect([calc.normMin, calc.normMax]).toEqual([0, 0]);
  });
});
