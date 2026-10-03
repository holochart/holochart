import { describe, expect, it, vi } from 'vitest';
import { Matrix4, type DataTexture } from 'three';
import { createResourceManager } from '../resources.ts';
import { TextDecorationLayer, computeDecorationRects } from './text-decoration.ts';
import { parseLinePosition } from './text-style.ts';

const FONT_SIZE = 12;
const metrics = { fontSize: FONT_SIZE, lineAdvance: FONT_SIZE * 1.2 };
/** Caret bottom/top relative to a baseline at 0, like troika's for a typical font. */
const BOTTOM = -0.24 * FONT_SIZE;
const TOP = 0.96 * FONT_SIZE;

function carets(...boxes: [number, number, number, number][]): Float32Array {
  const out = new Float32Array(boxes.length * 4);
  boxes.forEach((box, i) => out.set(box, i * 4));
  return out;
}

const textureOf = (layer: TextDecorationLayer): DataTexture | null =>
  (layer.mesh.material as unknown as { uniforms: { uDecorations: { value: DataTexture | null } } })
    .uniforms.uDecorations.value;

describe('computeDecorationRects: characters without a caret', () => {
  const under = parseLinePosition('under');

  it('skips a character troika recorded no caret for, without splitting the line', () => {
    // 'b' has no caret (all zeros), e.g. the second half of a ligature. Its zero bottom differs
    // from the line's caret bottom, so treating it as a caret would start a second "line".
    const info = {
      caretPositions: carets([0, 10, BOTTOM, TOP], [0, 0, 0, 0], [20, 30, BOTTOM, TOP]),
      topBaseline: 0,
    };
    const out = computeDecorationRects(info, 'abc', under, metrics);
    // One underline over a..c: 0.1 em below the baseline, max(1 px, 12/14) = 1 thick.
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(30);
    expect(out[1]).toBeCloseTo(-0.1 * FONT_SIZE - 0.5);
    expect(out[3]).toBeCloseTo(-0.1 * FONT_SIZE + 0.5);
  });

  it('draws nothing for text whose characters have no carets at all', () => {
    const info = { caretPositions: new Float32Array(8), topBaseline: 0 };
    expect(computeDecorationRects(info, 'ab', under, metrics)).toEqual([]);
  });

  it('keeps a zero-width caret at the line start (a real caret, not a missing one)', () => {
    // A zero-advance glyph at x = 0 has start = end = 0 but a real vertical extent.
    const info = {
      caretPositions: carets([0, 0, BOTTOM, TOP], [0, 10, BOTTOM, TOP]),
      topBaseline: 0,
    };
    const out = computeDecorationRects(info, '́a', parseLinePosition('over'), metrics);
    // The overline sits just under the caret top, one thickness tall.
    expect(out).toHaveLength(4);
    expect([out[0], out[2]]).toEqual([0, 10]);
    expect(out[1]).toBeCloseTo(TOP - 1);
    expect(out[3]).toBeCloseTo(TOP);
  });
});

describe('TextDecorationLayer: degenerate input', () => {
  it('draws a non-finite alpha opaque and clamps the rest to 0..1', () => {
    const layer = new TextDecorationLayer(createResourceManager());
    layer.begin();
    layer.add(0, [0, 0, 1, 1], [0.25, 0.5, 0.75, Number.NaN]);
    layer.add(0, [0, 0, 1, 1], [0.25, 0.5, 0.75, -0.5]);
    layer.end();
    layer.place(() => new Matrix4().elements);
    const data = textureOf(layer)!.image.data as Float32Array;
    // 16 floats per instance: three matrix columns, then the color.
    expect(Array.from(data.subarray(12, 16))).toEqual([0.25, 0.5, 0.75, 1]);
    expect(Array.from(data.subarray(28, 32))).toEqual([0.25, 0.5, 0.75, 0]);
    layer.dispose();
  });

  it('allocates no texture and asks for no matrices while there is nothing to draw', () => {
    const layer = new TextDecorationLayer(createResourceManager());
    const matrixOf = vi.fn(() => new Matrix4().elements);
    layer.begin();
    layer.end();
    layer.place(matrixOf);
    expect(textureOf(layer)).toBeNull();
    expect(matrixOf).not.toHaveBeenCalled();
    layer.dispose();
  });

  it('flags the texture for upload on every placement, but not once the set is empty', () => {
    const layer = new TextDecorationLayer(createResourceManager());
    const matrixOf = vi.fn(() => new Matrix4().elements);
    layer.begin();
    layer.add(0, [0, 0, 1, 1], [0, 0, 0, 1]);
    layer.end();
    layer.place(matrixOf);
    const texture = textureOf(layer)!;
    const version = texture.version;
    layer.place(matrixOf);
    expect(texture.version).toBe(version + 1);
    expect(matrixOf).toHaveBeenCalledTimes(2);

    // Emptied: the mesh is hidden, so the stale texture is left alone.
    layer.begin();
    layer.end();
    layer.place(matrixOf);
    expect(layer.mesh.visible).toBe(false);
    expect(texture.version).toBe(version + 1);
    expect(matrixOf).toHaveBeenCalledTimes(2);
    layer.dispose();
  });
});
