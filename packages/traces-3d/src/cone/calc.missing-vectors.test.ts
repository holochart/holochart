/**
 * `cone` calc with incomplete data: vector components that are numeric strings or not numbers,
 * fields without any usable vector, and an axis without positions. Expected values follow the
 * sizing the module documents (plotly.js `cone/convert.js` + gl-cone3d):
 *
 *   vectorScale = min over successive points of 2 |Δp| / (|u₀| + |u₁|) in scaled coordinates
 *                 (each axis divided by its data span), 1 when no pair is usable;
 *   pad = span(anchor) · vectorScale · coneScale · max norm   (span 0.75 for `cm`, the default).
 */
import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcCone } from './calc.ts';
import { cone } from './index.ts';

const registry = createChartRegistry().register(cone, sceneComponent);

function calcOf(trace: Record<string, unknown>) {
  const r = supplyDefaults(
    { data: [{ type: 'cone', ...trace }], layout: { template: 'none' } },
    registry.core,
  );
  const full = r.fullData[0]!;
  return { trace: full, calc: calcCone(full, { fullLayout: r.fullLayout } as CalcContext) };
}

describe('cone calc: vectors that are not plain numbers', () => {
  it('reads numeric strings; blanks, text and nulls are NaN and stay out of the norm range', () => {
    const { calc } = calcOf({
      x: [0, 1, 2, 3],
      y: [0, 0, 0, 0],
      z: [0, 0, 0, 0],
      u: [3, '4', null, ''],
      v: [4, '3', 0, 'east'],
      w: ['0', 0, 0, 0],
    });
    expect(Array.from(calc.u)).toEqual([3, 4, NaN, NaN]);
    expect(Array.from(calc.v)).toEqual([4, 3, 0, NaN]);
    expect(Array.from(calc.w)).toEqual([0, 0, 0, 0]);
    // 3-4-5 triangles, then no norm.
    expect(Array.from(calc.norm)).toEqual([5, 5, NaN, NaN]);
    expect([calc.normMin, calc.normMax]).toEqual([5, 5]);
    // Scaled coordinates: x and u divided by the x span (3); y and z have no span (÷ 1).
    // Only the first pair has two vectors: 2 · (1/3) / (|(1, 4)| + |(4/3, 3)|).
    const vectorScale = (2 * (1 / 3)) / (Math.hypot(1, 4) + Math.hypot(4 / 3, 3));
    expect(calc.vectorScale).toBeCloseTo(vectorScale, 12);
    expect(calc.coneScale).toBe(0.5);
    const pad = 0.75 * vectorScale * 0.5 * 5;
    expect(calc.sceneExtremes.x![0]).toBeCloseTo(-pad, 12);
    expect(calc.sceneExtremes.x![1]).toBeCloseTo(3 + pad, 12);
    expect(calc.sceneExtremes.y![0]).toBeCloseTo(-pad, 12);
    expect(calc.sceneExtremes.y![1]).toBeCloseTo(pad, 12);
  });

  it('without any usable vector: norm range 0 / 0, vectorScale 1, the positions unpadded', () => {
    const { trace, calc } = calcOf({
      x: [0, 1, 2],
      y: [5, 6, 7],
      z: [-1, -1, -1],
      u: [null, null, null],
      v: ['', 'x', null],
      w: [null, null, null],
    });
    expect(trace.visible).toBe(true);
    expect(calc.count).toBe(3);
    expect(Array.from(calc.norm)).toEqual([NaN, NaN, NaN]);
    expect([calc.normMin, calc.normMax]).toEqual([0, 0]);
    expect(calc.vectorScale).toBe(1);
    expect(calc.coneScale).toBe(0.5);
    // pad = 0.75 · 1 · 0.5 · 0.
    expect(calc.sceneExtremes).toEqual({ x: [0, 2], y: [5, 7], z: [-1, -1] });
  });
});

describe('cone calc: an axis without positions', () => {
  it('has no range on that axis; the others are padded with vectorScale 1', () => {
    const { calc } = calcOf({
      x: [0, 1, 2],
      y: [0, 0, 0],
      z: [null, null, null],
      u: [1, 2, 1],
      v: [0, 0, 0],
      w: [0, 0, 0],
    });
    expect(Array.from(calc.z)).toEqual([NaN, NaN, NaN]);
    expect([calc.normMin, calc.normMax]).toEqual([1, 2]);
    // No distance between successive points is known: no pair is usable.
    expect(calc.vectorScale).toBe(1);
    // pad = 0.75 · 1 · 0.5 · 2.
    expect(calc.sceneExtremes.x).toEqual([-0.75, 2.75]);
    expect(calc.sceneExtremes.y).toEqual([-0.75, 0.75]);
    expect(calc.sceneExtremes.z).toBeUndefined();
  });
});
