import type { Vector2, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createMarkerMatrix, type MarkerMatrixCell } from './matrix.ts';

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

function uniform<T>(cell: MarkerMatrixCell, name: string): T {
  return cell.material.uniforms[name]!.value as T;
}

function offset(cell: MarkerMatrixCell): number[] {
  return uniform<Vector3>(cell, 'uOffset').toArray();
}

describe('MarkerMatrix columns', () => {
  it('counts its columns and rejects a column index it does not have', () => {
    const m = createMarkerMatrix(context(), [
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(m.columnCount).toBe(3);
    expect(m.column(2).origin).toBe(5.5);
    expect(() => m.column(3)).toThrow(RangeError);
    expect(() => m.column(3)).toThrow('no column 3 (of 3)');
    expect(() => m.column(-1)).toThrow(RangeError);
  });

  it('draws the points every column has, and centers each column on those', () => {
    const m = createMarkerMatrix(context(), [
      new Float64Array([0, 2, 4, 1000, 2000]),
      new Float64Array([10, 20, 30]),
    ]);
    expect(m.count).toBe(3);
    // The origin of the long column is the center of its first three values, not of all five.
    expect(m.column(0).origin).toBe(2);
    expect(Array.from(m.column(0).attribute.array)).toEqual([-2, 0, 2]);
    expect(m.createCell(0, 1).geometry.instanceCount).toBe(3);
  });

  it('starts empty: cells draw nothing until columns arrive', () => {
    const m = createMarkerMatrix(context());
    expect(m.count).toBe(0);
    expect(m.columnCount).toBe(0);
    const cell = m.createCell(0, 1);
    expect(cell.geometry.instanceCount).toBe(0);
    // The program still needs both attributes.
    expect(cell.geometry.getAttribute('aX')).toBeDefined();
    expect(cell.geometry.getAttribute('aY')).toBeDefined();
    // Without columns there is no origin to add.
    cell.setTransform({ scaleX: 2, scaleY: 3, offsetX: 5, offsetY: 7 });
    expect(offset(cell)).toEqual([5, 7, 0]);

    m.setColumns([
      [10, 30],
      [100, 300],
    ]);
    expect(m.count).toBe(2);
    expect(cell.geometry.instanceCount).toBe(2);
    expect(cell.geometry.getAttribute('aX')).toBe(m.column(0).attribute);
    expect(cell.geometry.getAttribute('aY')).toBe(m.column(1).attribute);
  });
});

describe('MarkerMatrixCell', () => {
  it('re-points one axis at another column and re-bases its offset', () => {
    const m = createMarkerMatrix(context(), [
      [10, 30],
      [100, 300],
      [1000, 3000],
    ]);
    const cell = m.createCell(0, 1);
    cell.setTransform({ scaleX: 2, scaleY: 3, offsetX: 5, offsetY: 7 });
    // offset + origin × scale: column 0 is centered on 20, column 1 on 200.
    expect(offset(cell)).toEqual([5 + 20 * 2, 7 + 200 * 3, 0]);

    cell.update({ x: 2 });

    expect(cell.columns).toEqual({ x: 2, y: 1 });
    expect(cell.geometry.getAttribute('aX')).toBe(m.column(2).attribute);
    expect(cell.geometry.getAttribute('aY')).toBe(m.column(1).attribute);
    expect(offset(cell)).toEqual([5 + 2000 * 2, 7 + 200 * 3, 0]);
  });

  it('has its own viewport uniforms, kept usable for a degenerate viewport', () => {
    const m = createMarkerMatrix(context(), [
      [0, 1],
      [0, 1],
    ]);
    const a = m.createCell(0, 1);
    const b = m.createCell(1, 0);
    a.setViewport({ width: 300, height: 200, pixelRatio: 2 });
    expect(uniform<Vector2>(a, 'uResolution').toArray()).toEqual([300, 200]);
    expect(uniform<number>(a, 'uPixelRatio')).toBe(2);
    // Cells sit in viewports of their own.
    expect(uniform<Vector2>(b, 'uResolution').toArray()).toEqual([1, 1]);
    expect(uniform<number>(b, 'uPixelRatio')).toBe(1);

    a.setViewport({ width: 0, height: 0, pixelRatio: 0 });
    expect(uniform<Vector2>(a, 'uResolution').toArray()).toEqual([1, 1]);
    expect(uniform<number>(a, 'uPixelRatio')).toBe(1);
  });

  it('follows the shared style’s shader specialization, both ways', () => {
    const m = createMarkerMatrix(
      context(),
      [
        [0, 1, 2],
        [0, 1, 2],
      ],
      { symbol: 'diamond' },
    );
    const cell = m.createCell(0, 1);
    const defines = cell.material.defines as Record<string, string>;
    expect(defines.MARKER_SYMBOL).toBe('2');
    expect(defines).toHaveProperty('NO_ROTATION');

    // Mixed symbols, rotated: the generic program.
    let version = cell.material.version;
    m.update({ symbol: ['diamond', 'square', 'x'], angle: 30 });
    expect(defines).not.toHaveProperty('MARKER_SYMBOL');
    expect(defines).not.toHaveProperty('NO_ROTATION');
    expect(cell.material.version).toBeGreaterThan(version);

    version = cell.material.version;
    m.update({ symbol: 'square', angle: 0 });
    expect(defines.MARKER_SYMBOL).toBe('1');
    expect(defines).toHaveProperty('NO_ROTATION');
    expect(cell.material.version).toBeGreaterThan(version);

    // Nothing changed: no recompile.
    version = cell.material.version;
    m.update({ opacity: 0.5 });
    expect(cell.material.version).toBe(version);
  });
});

describe('MarkerMatrix.dispose', () => {
  it('releases its resources once', () => {
    const ctx = context();
    const other = createMarkerMatrix(ctx, [[0, 1]]);
    const m = createMarkerMatrix(ctx, [[0, 1]]);
    const cell = m.createCell(0, 0);
    const materialDispose = vi.spyOn(cell.material, 'dispose');
    const refs = () => ctx.resources.stats().map((s) => s.refs);
    expect(refs()).toEqual([2]);

    m.dispose();
    m.dispose();

    // The second dispose must not take the other matrix' reference to the symbol texture.
    expect(refs()).toEqual([1]);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(() => m.setColumns([[1]])).toThrow('disposed');
    expect(() => m.update({ size: 3 })).toThrow('disposed');
    other.dispose();
    expect(ctx.resources.stats()).toEqual([]);
  });
});
