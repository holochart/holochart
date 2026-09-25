import type { BufferGeometry, InstancedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HIDDEN_POSITION } from '../precision.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { MARKER_VERTEX } from './markers.glsl.ts';
import { createMarkerMatrix, MARKER_MATRIX_VERTEX } from './matrix.ts';

const HIDDEN = Math.fround(HIDDEN_POSITION);

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

function columns(d: number, n: number): Float64Array[] {
  return Array.from({ length: d }, (_, k) =>
    Float64Array.from({ length: n }, (_, i) => k * 100 + i),
  );
}

/** Attribute names still attached when the geometry is disposed. */
function onDispose(geometry: BufferGeometry): string[] {
  const seen: string[] = [];
  geometry.addEventListener('dispose', () => seen.push(...Object.keys(geometry.attributes)));
  return seen;
}

describe('MarkerMatrix', () => {
  it('uploads each column once and shares it with every cell', () => {
    const d = 4;
    const m = createMarkerMatrix(context(), columns(d, 5), { size: 4 });
    const cells = [];
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cells.push(m.createCell(i, j));
    expect(m.columnUploads).toBe(d);
    expect(cells).toHaveLength(16);
    for (const cell of cells) {
      const { x, y } = cell.columns;
      expect(cell.geometry.getAttribute('aX')).toBe(m.column(x).attribute);
      expect(cell.geometry.getAttribute('aY')).toBe(m.column(y).attribute);
      expect(cell.geometry.instanceCount).toBe(5);
    }
    // One version bump per column: three.js uploads each buffer once.
    for (let i = 0; i < d; i++) expect(m.column(i).attribute.version).toBe(1);
    // Style buffers are shared too.
    const size = cells[0]!.geometry.getAttribute('aSize');
    for (const cell of cells) expect(cell.geometry.getAttribute('aSize')).toBe(size);
  });

  it('RTC-encodes columns against their own origin and hides non-finite values', () => {
    const m = createMarkerMatrix(context(), [
      new Float64Array([10, 20, 30]),
      new Float64Array([1e12, NaN, 1e12 + 2]),
    ]);
    expect(m.column(0).origin).toBe(20);
    expect(Array.from(m.column(0).attribute.array)).toEqual([-10, 0, 10]);
    expect(m.column(1).origin).toBe(1e12 + 1);
    expect(Array.from(m.column(1).attribute.array)).toEqual([-1, HIDDEN, 1]);
  });

  it('offsets each cell by the origins of its columns', () => {
    const m = createMarkerMatrix(context(), [
      new Float64Array([10, 30]),
      new Float64Array([1000, 3000]),
    ]);
    const cell = m.createCell(1, 0);
    cell.setTransform({ scaleX: 2, scaleY: 3, offsetX: 5, offsetY: 7 });
    const u = cell.material.uniforms as Record<string, { value: { toArray(): number[] } }>;
    expect(u['uScale']!.value.toArray()).toEqual([2, 3, 1]);
    // offset + origin * scale, per axis (x: column 1, origin 2000; y: column 0, origin 20).
    expect(u['uOffset']!.value.toArray()).toEqual([5 + 2000 * 2, 7 + 20 * 3, 0]);
  });

  it('shares style updates (selection opacity) across cells without new column uploads', () => {
    const m = createMarkerMatrix(context(), columns(3, 4), { opacity: 1 });
    const a = m.createCell(0, 1);
    const b = m.createCell(2, 0);
    const style = a.geometry.getAttribute('aStyle') as InstancedBufferAttribute;
    const before = style.version;
    m.update({ opacity: new Float32Array([1, 0.2, 0.2, 1]) });
    expect(b.geometry.getAttribute('aStyle')).toBe(style);
    expect(style.version).toBeGreaterThan(before);
    expect(Array.from(style.array).filter((_, k) => k % 4 === 2)).toEqual([
      1,
      Math.fround(0.2),
      Math.fround(0.2),
      1,
    ]);
    expect(m.columnUploads).toBe(3);
  });

  it('relinks cells when the color mode reallocates the style buffers', () => {
    const m = createMarkerMatrix(context(), columns(2, 3), { color: [1, 0, 0, 1] });
    const cell = m.createCell(0, 1);
    const old = cell.geometry;
    expect(old.getAttribute('aFill')).toBeDefined();
    const disposed = onDispose(old);
    m.update({
      colorValues: new Float64Array([0, 1, 2]),
      colorscale: [
        [0, [0, 0, 0, 1]],
        [1, [1, 1, 1, 1]],
      ],
      cmin: 0,
      cmax: 2,
    });
    expect(m.colorscaleMode).toBe(true);
    expect(cell.geometry).not.toBe(old);
    expect(cell.geometry.getAttribute('aValue')).toBeDefined();
    expect(cell.geometry.getAttribute('aFill')).toBeUndefined();
    expect(cell.material.defines).toHaveProperty('USE_COLORSCALE');
    // The old geometry was released with only the buffers nothing uses any more (the columns
    // stayed, the reallocated style buffers were freed with it).
    expect(disposed).not.toContain('aX');
    expect(disposed).not.toContain('aY');
    expect(disposed).toContain('aFill');
  });

  it('frees shared buffers only with the last drawn cell', () => {
    const m = createMarkerMatrix(context(), columns(2, 3));
    const a = m.createCell(0, 1);
    const b = m.createCell(1, 0);
    // Simulate a render of both.
    for (const c of [a, b]) {
      c.object.onBeforeRender(
        {
          getCurrentViewport: (v: { set(...n: number[]): void }) => v.set(0, 0, 10, 10),
          getRenderTarget: () => null,
          getPixelRatio: () => 1,
        } as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
      );
    }
    const first = onDispose(a.geometry);
    a.dispose();
    expect(first).toEqual([]);
    const last = onDispose(b.geometry);
    b.dispose();
    expect(last).toEqual(expect.arrayContaining(['aX', 'aY', 'aSize', 'aStyle']));
    expect(m.cells.size).toBe(0);
  });

  it('draws nothing for a missing column and replaces columns in place', () => {
    const m = createMarkerMatrix(context(), columns(2, 3));
    const cell = m.createCell(0, 5);
    expect(cell.geometry.instanceCount).toBe(0);
    cell.update({ y: 1 });
    expect(cell.geometry.instanceCount).toBe(3);
    const attribute = m.column(0).attribute;
    m.setColumns(columns(2, 3).map((c) => c.map((v) => v * 2)));
    // Same length: same buffer, rewritten once.
    expect(m.column(0).attribute).toBe(attribute);
    expect(m.columnUploads).toBe(4);
    m.setColumns(columns(2, 6));
    expect(m.count).toBe(6);
    expect(cell.geometry.getAttribute('aX')).toBe(m.column(0).attribute);
    expect(cell.geometry.instanceCount).toBe(6);
  });

  it('builds the matrix shader from the marker shader', () => {
    expect(MARKER_MATRIX_VERTEX).not.toMatch(/in vec3 aPos;/);
    expect(MARKER_MATRIX_VERTEX).toMatch(/in float aX;/);
    expect(MARKER_MATRIX_VERTEX).toMatch(/#define aPos vec3\(aX, aY, 0\.0\)/);
    // Everything else is the marker shader.
    expect(MARKER_MATRIX_VERTEX.length).toBeGreaterThan(MARKER_VERTEX.length - 40);
  });

  it('disposes its cells and style', () => {
    const ctx = context();
    const m = createMarkerMatrix(ctx, columns(2, 2));
    const cell = m.createCell(0, 1);
    m.dispose();
    expect(m.cells.size).toBe(0);
    expect(() => cell.update({ x: 1 })).toThrow();
    expect(() => m.createCell(0, 0)).toThrow();
    expect(ctx.resources.stats().filter((s) => s.refs > 0)).toEqual([]);
  });
});
