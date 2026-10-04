/**
 * `isosurface` calc: the value range drawn (plotly.js `isosurface/calc.js` `_vMin` / `_vMax`:
 * `isomin` / `isomax` where given, else the smallest / largest value of the data), which is also
 * the colorscale's automatic domain and so the colorbar's range. The field below is
 * `x + y + z` on `{0, 1, 2}³`: values 0 … 6.
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcIso, isoColorValues, isoRange } from './calc.ts';
import { isosurface } from './index.ts';

const registry = createChartRegistry().register(isosurface, sceneComponent);

function defaults(trace: Record<string, unknown>) {
  const r = supplyDefaults(
    { data: [{ type: 'isosurface', ...trace }], layout: { template: 'none' } },
    registry.core,
  );
  return { trace: r.fullData[0]!, fullLayout: r.fullLayout };
}

function calcOf(trace: Record<string, unknown>) {
  const d = defaults(trace);
  return { ...d, calc: calcIso(d.trace, { fullLayout: d.fullLayout } as CalcContext) };
}

/** Flattened columns of `x + y + z` on `{0, 1, 2}³`, x fastest. */
function field() {
  const out = { x: [] as number[], y: [] as number[], z: [] as number[], value: [] as unknown[] };
  for (const z of [0, 1, 2]) {
    for (const y of [0, 1, 2]) {
      for (const x of [0, 1, 2]) {
        out.x.push(x);
        out.y.push(y);
        out.z.push(z);
        out.value.push(x + y + z);
      }
    }
  }
  return out;
}

describe('isosurface calc: the value range', () => {
  it('is the data extent, with isomin and isomax each replacing its end', () => {
    const range = (extra: Record<string, unknown>) => {
      const { trace, calc } = calcOf({ ...field(), ...extra });
      // The trace-level range (colors) and the calc's agree.
      expect(isoRange(trace)).toEqual([calc.isomin, calc.isomax]);
      return [calc.isomin, calc.isomax];
    };
    expect(range({})).toEqual([0, 6]);
    expect(range({ isomax: 4 })).toEqual([0, 4]);
    expect(range({ isomin: 2 })).toEqual([2, 6]);
    expect(range({ isomin: 1, isomax: 5 })).toEqual([1, 5]);
    // Plotly's defaults drop an isomin above isomax: the data extent again.
    expect(range({ isomin: 5, isomax: 1 })).toEqual([0, 6]);
  });

  it('skips values that are not numbers', () => {
    const f = field();
    // The smallest (0, first) and the largest (6, last) are missing: 1 … 5 remain.
    f.value[0] = null;
    f.value[26] = 'n/a';
    const { trace, calc } = calcOf(f);
    expect([calc.isomin, calc.isomax]).toEqual([1, 5]);
    expect(isoRange(trace)).toEqual([1, 5]);
  });

  it('has no range without any number: NaN in calc, nothing extracted, no color domain', () => {
    const f = field();
    const { trace, fullLayout, calc } = calcOf({ ...f, value: f.value.map(() => null) });
    expect(trace.visible).toBe(true);
    expect(calc.isomin).toBeNaN();
    expect(calc.isomax).toBeNaN();
    expect(calc.mesh!.triangles).toHaveLength(0);
    expect(isoRange(trace)).toBeUndefined();
    expect(isoColorValues(trace)).toBeUndefined();
    expect(isosurface.colorbar!(trace, { fullLayout })).toBeNull();
  });
});

describe('isosurface colorscale domain', () => {
  it('is [isomin, isomax], and the colorbar spans it', () => {
    const { trace, fullLayout } = defaults({ ...field(), isomax: 4 });
    expect(isoColorValues(trace)).toEqual([0, 4]);
    const bar = isosurface.colorbar!(trace, { fullLayout })!;
    expect([bar.cmin, bar.cmax]).toEqual([0, 4]);
    // Asked again (every redraw asks): the same answer for the same data.
    expect(isoColorValues(trace)).toEqual([0, 4]);
    const open = defaults(field());
    const openBar = isosurface.colorbar!(open.trace, { fullLayout: open.fullLayout })!;
    expect([openBar.cmin, openBar.cmax]).toEqual([0, 6]);
  });

  it('is undefined for a hidden trace (no values), which has no colorbar', () => {
    const { trace, fullLayout } = defaults({ ...field(), value: [] });
    expect(trace.visible).toBe(false);
    expect(isoColorValues(trace)).toBeUndefined();
    expect(isosurface.colorbar!(trace, { fullLayout })).toBeNull();
  });
});
