import { supplyDefaults } from '@mk7s/holochart-core';
import { createResourceManager, type PrimitiveContext } from '@mk7s/holochart-render';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { Matrix4, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcCone, coneScale, coneVectorScale, CONE_OFFSET, CONE_SPAN } from './calc.ts';
import { coneHoverFlags } from './hover.ts';
import { cone } from './index.ts';
import { coneData } from './plot.ts';
import { ConeSetPrimitive, coneTemplate } from './primitive.ts';

const registry = createChartRegistry().register(cone, sceneComponent);

function defaults(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const r = supplyDefaults(
    { data: [{ type: 'cone', ...trace }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  return { trace: r.fullData[0]!, fullLayout: r.fullLayout };
}

function calcOf(trace: Record<string, unknown>) {
  const d = defaults(trace);
  return { ...d, calc: calcCone(d.trace, { fullLayout: d.fullLayout } as CalcContext) };
}

const LINE = { x: [0, 1, 2], y: [0, 0, 0], z: [0, 0, 0], u: [1, 2, 1], v: [0, 0, 0], w: [0, 0, 0] };

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: () => {} };
}

describe('cone defaults (plotly.js cone/defaults.js)', () => {
  it('needs all six arrays, non-empty', () => {
    expect(defaults(LINE).trace.visible).toBe(true);
    expect(defaults({ ...LINE, w: [] }).trace.visible).toBe(false);
    expect(defaults({ ...LINE, u: undefined }).trace.visible).toBe(false);
  });

  it('defaults sizing, anchor, colorscale, lighting and hoverinfo like Plotly', () => {
    const t = defaults(LINE).trace;
    expect(t['sizemode']).toBe('scaled');
    expect(t['sizeref']).toBe(0.5);
    expect(defaults({ ...LINE, sizemode: 'raw' }).trace['sizeref']).toBe(1);
    expect(defaults({ ...LINE, sizemode: 'absolute' }).trace['sizeref']).toBe(0.5);
    expect(t['anchor']).toBe('cm');
    expect(t['showscale']).toBe(true);
    expect(t['autocolorscale']).toBe(true);
    expect(t['hoverinfo']).toBe('x+y+z+norm+text+name');
    expect(t['lightposition']).toEqual({ x: 1e5, y: 1e5, z: 0 });
    expect(t['lighting']).toMatchObject({ ambient: 0.8, diffuse: 0.8, specular: 0.05 });
    expect(t['showlegend']).toBe(false);
  });
});

describe('cone sizing (plotly.js cone/convert.js, gl-cone3d)', () => {
  it('vectorScale: the smallest successive travel time 2 |Δp| / (|u₀| + |u₁|)', () => {
    const p = [
      [0, 1, 3],
      [0, 0, 0],
      [0, 0, 0],
    ] as const;
    const u = [
      [1, 3, 1],
      [0, 0, 0],
      [0, 0, 0],
    ] as const;
    // Pairs: 2·1/(1+3) = 0.5, 2·2/(3+1) = 1.
    expect(coneVectorScale(p, u, 3)).toBe(0.5);
    // Coinciding points are skipped without advancing the previous point.
    const q = [
      [0, 0, 2],
      [0, 0, 0],
      [0, 0, 0],
    ] as const;
    expect(
      coneVectorScale(
        q,
        [
          [1, 1, 1],
          [0, 0, 0],
          [0, 0, 0],
        ],
        3,
      ),
    ).toBe(2);
    // Zero vectors apart (q = ∞) change nothing; nothing usable → 1.
    expect(
      coneVectorScale(
        p,
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        3,
      ),
    ).toBe(1);
    expect(coneVectorScale(p, u, 1)).toBe(1);
  });

  it('coneScale per sizemode', () => {
    expect(coneScale('scaled', 0.5, 4)).toBe(0.5);
    expect(coneScale('scaled', 0, 4)).toBe(0.5);
    expect(coneScale('absolute', 2, 4)).toBe(0.5);
    expect(coneScale('absolute', 2, 0)).toBe(0.5);
    expect(coneScale('absolute', 3, 4)).toBe(0.75);
    expect(coneScale('raw', 2, 4)).toBe(2);
    expect(coneScale('raw', 0, 4)).toBe(1);
  });

  it('computes the norms, scales and autorange pad in calc', () => {
    const { calc } = calcOf(LINE);
    expect([...calc.norm]).toEqual([1, 2, 1]);
    expect([calc.normMin, calc.normMax]).toEqual([1, 2]);
    // Scaled coordinates: x / 2 (the x span), u / 2 too: 2·0.5/(0.5+1) = 2/3.
    expect(calc.vectorScale).toBeCloseTo(2 / 3, 12);
    expect(calc.coneScale).toBe(0.5);
    expect(calc.offset).toBe(0.25);
    // Plotly's _pad: 0.75 · vectorScale · coneScale · max norm.
    const pad = 0.75 * (2 / 3) * 0.5 * 2;
    expect(calc.sceneExtremes.x![0]).toBeCloseTo(-pad, 12);
    expect(calc.sceneExtremes.x![1]).toBeCloseTo(2 + pad, 12);
    expect(calc.sceneExtremes.y![1]).toBeCloseTo(pad, 12);
    const raw = calcOf({ ...LINE, sizemode: 'raw', sizeref: 2, anchor: 'tail' }).calc;
    expect([raw.vectorScale, raw.coneScale, raw.offset]).toEqual([1, 2, 0]);
    expect(raw.sceneExtremes.x).toEqual([-4, 6]);
    const absolute = calcOf({ ...LINE, sizemode: 'absolute', sizeref: 1, anchor: 'tip' }).calc;
    expect(absolute.coneScale).toBe(0.5);
    expect(absolute.offset).toBe(1);
  });

  it('uses the shortest of the six arrays', () => {
    const { calc } = calcOf({ ...LINE, w: [0, 0] });
    expect(calc.count).toBe(2);
    expect(calc.norm).toHaveLength(2);
  });

  it('anchors: where the point sits along the cone, and how far the cone reaches', () => {
    expect(CONE_OFFSET).toEqual({ tip: 1, tail: 0, cm: 0.25, center: 0.5 });
    expect(CONE_SPAN).toEqual({ tip: 1, tail: 1, cm: 0.75, center: 0.5 });
  });
});

describe('cone primitive', () => {
  it("builds gl-cone3d's cone: 8 segments, length 1, base radius 0.25", () => {
    const t = coneTemplate();
    expect(t.position.length / 3).toBe(48);
    let tip = 0;
    for (let i = 0; i < 48; i++) {
      const [x, y, z] = [t.position[i * 3]!, t.position[i * 3 + 1]!, t.position[i * 3 + 2]!];
      if (z === 1) tip++;
      else {
        expect(z).toBe(0);
        const r = Math.hypot(x, y);
        expect(r === 0 || Math.abs(r - 0.25) < 1e-6).toBe(true);
      }
      const n = [t.normal[i * 3]!, t.normal[i * 3 + 1]!, t.normal[i * 3 + 2]!];
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    }
    expect(tip).toBe(8);
  });

  it('packs one instance per cone, relative to the origin, with gaps hidden', () => {
    const cones = new ConeSetPrimitive(context(), {
      x: [10, 12, NaN],
      y: [0, 2, 1],
      z: [5, 5, 5],
      u: [1, 0, 1],
      v: [0, NaN, 0],
      w: [0, 1, 0],
      count: 3,
      values: [1, 1, 1],
    });
    const inst = cones.instances;
    expect(cones.origin).toEqual([11, 1, 5]);
    expect([...inst['aPos']!.subarray(0, 6)]).toEqual([-1, -1, 0, 1, 1, 0]);
    expect(inst['aPos']![6]).toBeGreaterThan(1e37);
    // The second vector has a missing component: no cone.
    expect([...inst['aVec']!.subarray(0, 9)]).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0]);
    expect([...inst['aIndex']!.subarray(0, 3)]).toEqual([0, 1, 2]);
    expect(cones.object.geometry).toMatchObject({ instanceCount: 3 });
    cones.dispose();
  });

  it('draws translucent cones back to front, keeping their pick ids', async () => {
    const cones = new ConeSetPrimitive(context(), {
      x: [0, 0, 0],
      y: [0, 0, 0],
      z: [-1, 1, 0],
      u: [1, 1, 1],
      v: [0, 0, 0],
      w: [0, 0, 0],
      count: 3,
      values: [0, 1, 2],
      opacity: 0.5,
    });
    await cones.ready;
    expect(cones.translucent).toBe(true);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(new Matrix4().copy(camera.matrixWorld).invert());
    cones.object.onBeforeRender(
      null as never,
      null as never,
      camera,
      null as never,
      null as never,
      null as never,
    );
    // Farthest (z = -1) first.
    expect([...cones.instances['aIndex']!.subarray(0, 3)]).toEqual([0, 2, 1]);
    cones.update({ opacity: 1 });
    expect([...cones.instances['aIndex']!.subarray(0, 3)]).toEqual([0, 1, 2]);
    cones.dispose();
  });

  it('maps the trace to the primitive: norms, domain, scale, anchor', () => {
    const { trace, fullLayout, calc } = calcOf({ ...LINE, cmin: 0, cmax: 4, anchor: 'center' });
    const d = coneData({ trace, fullLayout }, calc);
    expect(Array.from(d.values)).toEqual([1, 2, 1]);
    expect([d.cmin, d.cmax]).toEqual([0, 4]);
    expect(d.scale).toBeCloseTo(calc.vectorScale * calc.coneScale, 12);
    expect(d.offset).toBe(0.5);
    expect(d.lightposition).toEqual([1e5, 1e5, 0]);
  });
});

describe('cone hover', () => {
  it("reads Plotly's cone hoverinfo flags", () => {
    expect([...coneHoverFlags('all')]).toEqual([
      'x',
      'y',
      'z',
      'u',
      'v',
      'w',
      'norm',
      'text',
      'name',
    ]);
    expect([...coneHoverFlags('u+norm')]).toEqual(['u', 'norm']);
  });

  it('reports the norm in event data', () => {
    const { calc, trace } = calcOf(LINE);
    expect(cone.eventData!(calc, trace, 1)).toEqual({ norm: 2 });
  });
});
