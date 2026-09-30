import { holochartTemplate, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createResourceManager, type PrimitiveContext } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type CalcContext,
  type DomainInfo,
  type DomainTraceEntry,
} from '@mk7s/holochart-runtime';
import fc from 'fast-check';
import { Matrix4, MeshStandardMaterial, PerspectiveCamera, ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { sceneCrossTraceLayout, type SceneCalc } from '../scene/layout.ts';
import {
  BAR3D_FILL,
  barExtents,
  calcBar3d,
  minSpacing,
  stackBar3d,
  type Bar3dCalc,
} from './calc.ts';
import { bar3dHoverFlags } from './hover.ts';
import { bar3d } from './index.ts';
import { bar3dColors, bar3dData } from './plot.ts';
import { Bar3DPrimitive, boxTemplate, srgbToLinear } from './primitive.ts';

const registry = createChartRegistry().register(bar3d, sceneComponent);

function defaults(traces: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const r = supplyDefaults(
    { data: traces.map((t) => ({ type: 'bar3d', ...t })), layout: { template: 'none', ...layout } },
    registry.core,
  );
  return { traces: r.fullData, fullLayout: r.fullLayout };
}

function calcAll(traces: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const d = defaults(traces, layout);
  const calcs = d.traces.map((t, index) =>
    calcBar3d(t, { fullLayout: d.fullLayout, index } as CalcContext),
  );
  return { ...d, calcs };
}

function entries(traces: readonly FullTrace[], calcs: Bar3dCalc[]): DomainTraceEntry<SceneCalc>[] {
  return traces.map((trace, index) => ({
    trace,
    index,
    calc: calcs[index]!,
    domain: {} as DomainInfo,
  }));
}

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: () => {} };
}

const GRID = { x: ['a', 'b', 'a', 'b'], y: ['p', 'p', 'q', 'q'], z: [1, 2, 3, 4] };

describe('bar3d defaults', () => {
  it('needs x, y and z, non-empty', () => {
    expect(defaults([GRID]).traces[0]!.visible).toBe(true);
    expect(defaults([{ ...GRID, z: [] }]).traces[0]!.visible).toBe(false);
    expect(defaults([{ ...GRID, y: undefined }]).traces[0]!.visible).toBe(false);
  });

  it('defaults colors, edges, lighting and hover', () => {
    const t = defaults([GRID]).traces[0]!;
    const marker = t['marker'] as Record<string, unknown>;
    expect(marker['color']).toBe('rgb(31, 119, 180)');
    expect(marker['opacity']).toBe(1);
    expect(marker['line']).toEqual({ width: 1, color: 'rgb(68, 68, 68)' });
    expect(t['stackgroup']).toBe('');
    expect(t['hoverinfo']).toBe('all');
    expect(t['lighting']).toMatchObject({ ambient: 0.55, diffuse: 0.6 });
    expect(t['lightposition']).toEqual({ x: 1e5, y: 1e5, z: 0 });
    expect(marker['colorscale']).toBeUndefined();
    const noEdges = defaults([{ ...GRID, marker: { line: { width: 0 } } }]).traces[0]!;
    expect((noEdges['marker'] as Record<string, unknown>)['line']).toEqual({ width: 0 });
  });

  it('colors by z when a colorscale is asked for without a color array', () => {
    const t = defaults([{ ...GRID, marker: { colorscale: 'Viridis' } }]).traces[0]!;
    const marker = t['marker'] as Record<string, unknown>;
    expect(marker['color']).toEqual([1, 2, 3, 4]);
    expect(marker['cauto']).toBe(true);
    const own = defaults([{ ...GRID, marker: { color: [4, 3, 2, 1], colorscale: 'Viridis' } }]);
    expect((own.traces[0]!['marker'] as Record<string, unknown>)['color']).toEqual([4, 3, 2, 1]);
    const axis = defaults([{ ...GRID, marker: { coloraxis: 'coloraxis' } }]);
    expect((axis.traces[0]!['marker'] as Record<string, unknown>)['color']).toEqual([1, 2, 3, 4]);
  });

  it('takes the default template: background-colored edges', () => {
    const r = supplyDefaults(
      { data: [{ type: 'bar3d', ...GRID }], layout: { template: holochartTemplate } },
      registry.core,
    );
    const marker = r.fullData[0]!['marker'] as Record<string, unknown>;
    expect(marker['line']).toEqual({ width: 1, color: 'rgb(10, 10, 15)' });
  });
});

describe('bar3d calc', () => {
  it('places categorical bars on category indices, 0.8 of a cell wide', () => {
    const { calcs } = calcAll([GRID]);
    const c = calcs[0]!;
    expect([...c.x]).toEqual([0, 1, 0, 1]);
    expect([...c.y]).toEqual([0, 0, 1, 1]);
    expect([...c.width]).toEqual([0.8, 0.8, 0.8, 0.8]);
    expect([...c.depth]).toEqual([0.8, 0.8, 0.8, 0.8]);
    expect([...c.bottom]).toEqual([0, 0, 0, 0]);
    expect([...c.top]).toEqual([1, 2, 3, 4]);
    // Footprints and the base (0) are in range.
    expect(c.sceneExtremes.x![0]).toBeCloseTo(-0.4, 12);
    expect(c.sceneExtremes.x![1]).toBeCloseTo(1.4, 12);
    expect(c.sceneExtremes.z).toEqual([0, 4]);
  });

  it('sizes numeric bars from the smallest spacing, or width / depth', () => {
    expect(minSpacing([0, 2, 3, 3, 7])).toBe(1);
    expect(minSpacing([5])).toBe(Infinity);
    expect([...barExtents(undefined, Float64Array.from([0, 10]))]).toEqual([8, 8]);
    expect([...barExtents(undefined, Float64Array.from([4]))]).toEqual([BAR3D_FILL]);
    expect([...barExtents([1, -1, 'x'], Float64Array.from([0, 2, 4]))]).toEqual([1, 1.6, 1.6]);
    const { calcs } = calcAll([{ x: [0, 0.5], y: [0, 0], z: [1, 1], width: 0.2, depth: [3, 1] }]);
    expect([...calcs[0]!.width]).toEqual([0.2, 0.2]);
    expect([...calcs[0]!.depth]).toEqual([3, 1]);
  });

  it('starts bars at base; negative heights go down', () => {
    const { calcs } = calcAll([{ ...GRID, z: [1, -2, 3, 4], base: [10, 10, NaN, 10] }]);
    const c = calcs[0]!;
    expect([...c.bottom]).toEqual([10, 10, 0, 10]);
    expect([...c.top]).toEqual([11, 8, 3, 14]);
    expect([...c.hasBase]).toEqual([1, 1, 0, 1]);
    expect(c.sceneExtremes.z).toEqual([0, 14]);
  });

  it('uses the shortest of x, y, z; missing heights draw nothing and leave the range', () => {
    const { calcs } = calcAll([{ x: [1, 2, 3], y: [1, 2, 3], z: [5, null] }]);
    expect(calcs[0]!.count).toBe(2);
    expect(calcs[0]!.sceneExtremes.x![1]).toBeCloseTo(1.4, 12);
  });
});

describe('bar3d stacking (stackgroup)', () => {
  it('stacks traces of a group in trace order at each position', () => {
    const { traces, calcs } = calcAll([
      { ...GRID, stackgroup: 's', base: 1 },
      { ...GRID, z: [10, 10, 10, 10], stackgroup: 's', base: 100 },
      { ...GRID, z: [5, 5, 5, 5] },
    ]);
    stackBar3d(entries(traces, calcs), {} as never, 'scene');
    // The first trace starts at its own base; the second on its tops (its base unused).
    expect([...calcs[0]!.bottom]).toEqual([1, 1, 1, 1]);
    expect([...calcs[1]!.bottom]).toEqual([2, 3, 4, 5]);
    expect([...calcs[1]!.top]).toEqual([12, 13, 14, 15]);
    expect([calcs[0]!.stacked, calcs[1]!.stacked]).toEqual([false, true]);
    // Not in the group: not stacked.
    expect([...calcs[2]!.bottom]).toEqual([0, 0, 0, 0]);
    expect(calcs[1]!.sceneExtremes.z).toEqual([2, 15]);
    // Idempotent.
    stackBar3d(entries(traces, calcs), {} as never, 'scene');
    expect([...calcs[1]!.bottom]).toEqual([2, 3, 4, 5]);
  });

  it('runs in the scenes cross-trace layout, so autorange covers the stack totals', () => {
    const { traces, calcs, fullLayout } = calcAll([
      { ...GRID, stackgroup: 's' },
      { ...GRID, stackgroup: 's' },
    ]);
    sceneCrossTraceLayout(entries(traces, calcs), {
      fullLayout,
      width: 400,
      height: 300,
      plotArea: { x: 0, y: 0, width: 400, height: 300 },
    });
    const z = calcs[1]!.scene!.axes[2].range;
    expect(Math.max(...z)).toBeGreaterThan(8);
    expect([...calcs[1]!.top]).toEqual([2, 4, 6, 8]);
  });

  it('property: every stack top is its base plus the sum of the heights below', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(fc.double({ min: -50, max: 50, noNaN: true }), { minLength: 3, maxLength: 3 }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.double({ min: -10, max: 10, noNaN: true }),
        (heights, base) => {
          const { traces, calcs } = calcAll(
            heights.map((z) => ({ x: [0, 1, 0], y: [0, 0, 1], z, base, stackgroup: 'g' })),
          );
          stackBar3d(entries(traces, calcs), {} as never, 'scene');
          for (let i = 0; i < 3; i++) {
            let sum = base;
            for (let t = 0; t < heights.length; t++) {
              expect(calcs[t]!.bottom[i]).toBeCloseTo(sum, 9);
              sum += heights[t]![i]!;
              expect(calcs[t]!.top[i]).toBeCloseTo(sum, 9);
            }
          }
        },
      ),
    );
  });
});

describe('bar3d primitive', () => {
  it('builds a unit box with outward, counter-clockwise faces', () => {
    const t = boxTemplate();
    expect(t.position.length / 3).toBe(24);
    expect(t.index).toHaveLength(36);
    const p = (i: number) => [0, 1, 2].map((k) => t.position[i * 3 + k]!);
    for (let f = 0; f < 36; f += 3) {
      const [a, b, c] = [t.index[f]!, t.index[f + 1]!, t.index[f + 2]!].map(p);
      const u = [0, 1, 2].map((k) => b![k]! - a![k]!);
      const v = [0, 1, 2].map((k) => c![k]! - a![k]!);
      const cross = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const n = [0, 1, 2].map((k) => t.normal[t.index[f]! * 3 + k]!);
      expect(cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]!).toBeGreaterThan(0);
      // The face lies on its side of the box.
      const axis = n.findIndex((v) => v !== 0);
      expect(a![axis]).toBe(n[axis]! > 0 ? 1 : 0);
    }
  });

  it('packs one instance per bar (min corner, size, color), gaps and flat bars hidden', () => {
    const bars = new Bar3DPrimitive(context(), {
      x: [10, 12, NaN, 14],
      y: [0, 2, 1, 1],
      z: [5, 5, 5, 5],
      dx: [1, 1, 1, 1],
      dy: [2, 2, 2, 2],
      dz: [3, 1, 1, 0],
      count: 4,
      color: Float32Array.from([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]),
    });
    const inst = bars.instances;
    expect(bars.origin).toEqual([12.5, 2, 6.5]);
    expect([...inst['aPos']!.subarray(0, 6)]).toEqual([-2.5, -2, -1.5, -0.5, 0, -1.5]);
    expect([...inst['aSize']!.subarray(0, 6)]).toEqual([1, 2, 3, 1, 2, 1]);
    expect(inst['aSize']![6]).toBeGreaterThan(1e37);
    expect(inst['aSize']![9]).toBeGreaterThan(1e37);
    expect([...inst['color']!.subarray(0, 8)]).toEqual([1, 0, 0, 1, 0, 1, 0, 1]);
    expect([...inst['aIndex']!.subarray(0, 4)]).toEqual([0, 1, 2, 3]);
    expect(bars.object.geometry).toMatchObject({ instanceCount: 4 });
    bars.dispose();
  });

  it("uses the mesh chunk's shaders, or a three.js material with linear colors", async () => {
    const bars = new Bar3DPrimitive(context(), {
      x: [0],
      y: [0],
      z: [0],
      dx: [1],
      dy: [1],
      dz: [1],
      count: 1,
      color: [0.5, 0.5, 0.5, 1],
      edgeWidth: 1,
    });
    await bars.ready;
    expect(bars.material).toBeInstanceOf(ShaderMaterial);
    const shader = bars.material as ShaderMaterial;
    expect(shader.fragmentShader).toContain('hcEdge(vBox)');
    expect(shader.defines).toMatchObject({ HC_COLOR: '' });
    expect(bars.instances['color']![0]).toBe(0.5);
    bars.update({ material: { type: 'standard', roughness: 0.2 } });
    expect(bars.material).toBeInstanceOf(MeshStandardMaterial);
    expect((bars.material as MeshStandardMaterial).roughness).toBe(0.2);
    expect(bars.material!.customProgramCacheKey()).toBe('holochart-bar3d');
    expect(bars.instances['color']![0]).toBeCloseTo(srgbToLinear(0.5), 6);
    expect(bars.pickCount).toBe(1);
    bars.update({ material: { type: 'flat' } });
    expect((bars.material as ShaderMaterial).defines).toMatchObject({ HC_UNLIT: '' });
    bars.dispose();
  });

  it('draws translucent bars back to front, front faces only', async () => {
    const bars = new Bar3DPrimitive(context(), {
      x: [0, 0, 0],
      y: [0, 0, 0],
      z: [-3, 3, 0],
      dx: [1, 1, 1],
      dy: [1, 1, 1],
      dz: [1, 1, 1],
      count: 3,
      opacity: 0.5,
    });
    await bars.ready;
    expect(bars.translucent).toBe(true);
    expect(bars.material!.depthWrite).toBe(false);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(new Matrix4().copy(camera.matrixWorld).invert());
    const renderer = { getPixelRatio: () => 1 };
    bars.object.onBeforeRender(
      renderer as never,
      null as never,
      camera,
      null as never,
      null as never,
      null as never,
    );
    // Farthest (z = -3) first.
    expect([...bars.instances['aIndex']!.subarray(0, 3)]).toEqual([0, 2, 1]);
    bars.update({ opacity: 1 });
    expect([...bars.instances['aIndex']!.subarray(0, 3)]).toEqual([0, 1, 2]);
    expect(bars.material!.depthWrite).toBe(true);
    bars.dispose();
  });

  it('maps a trace to boxes: footprints around the centers, bottom → top', () => {
    const { traces, calcs, fullLayout } = calcAll([
      { ...GRID, z: [1, -2, 3, 4], marker: { color: ['red', 'blue', 'lime', 'black'] } },
    ]);
    const d = bar3dData({ trace: traces[0]!, fullLayout }, calcs[0]!, [0, 10]);
    expect(Array.from(d.x!, (v) => +v.toFixed(6))).toEqual([-0.4, 0.6, -0.4, 0.6]);
    expect(Array.from(d.z!)).toEqual([0, -2, 0, 0]);
    expect(Array.from(d.dz!)).toEqual([1, 2, 3, 4]);
    expect(d.edgeWidth).toBe(1);
    expect([...(d.color as Float32Array).subarray(0, 8)]).toEqual([1, 0, 0, 1, 0, 0, 1, 1]);
  });

  it('maps numeric colors through the colorscale', () => {
    const { traces, fullLayout } = calcAll([
      {
        ...GRID,
        marker: {
          colorscale: [
            [0, 'black'],
            [1, 'white'],
          ],
          cmin: 1,
          cmax: 4,
        },
      },
    ]);
    const colors = bar3dColors(traces[0]!, 4, fullLayout) as Float32Array;
    expect(colors[0]).toBeCloseTo(0, 6);
    expect(colors[12]).toBeCloseTo(1, 6);
  });
});

describe('bar3d hover', () => {
  it('reads the hoverinfo flags (with base)', () => {
    expect([...bar3dHoverFlags('all')]).toEqual(['x', 'y', 'z', 'base', 'text', 'name']);
    expect([...bar3dHoverFlags('z+base')]).toEqual(['z', 'base']);
  });

  it('reports base and top in event data', () => {
    const { traces, calcs } = calcAll([{ ...GRID, base: 2 }]);
    expect(bar3d.eventData!(calcs[0]!, traces[0]!, 1)).toEqual({ base: 2, top: 4 });
  });

  it('draws a bar glyph in the legend', () => {
    const { traces } = calcAll([{ ...GRID, marker: { color: 'red' } }]);
    expect(bar3d.legendIcon!(traces[0]!)).toEqual({
      kind: 'bar',
      fill: { color: 'rgb(255, 0, 0)', lineColor: 'rgb(68, 68, 68)', lineWidth: 1 },
    });
  });
});
