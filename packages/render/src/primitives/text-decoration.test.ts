import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { createResourceManager } from '../resources.ts';
import { UNIT_QUAD_KEY } from './common.ts';
import {
  TextDecorationLayer,
  computeDecorationRects,
  decorationInstanceColumns,
} from './text-decoration.ts';
import { parseLinePosition } from './text-style.ts';

const FONT_SIZE = 12;
const ADVANCE = FONT_SIZE * 1.2;
/** Caret bottom/top relative to the baseline, like troika's for a typical font. */
const CARET_BOTTOM = -0.24 * FONT_SIZE;
const CARET_TOP = 0.96 * FONT_SIZE;

/**
 * troika-like caret positions: every character 10 units wide, lines separated by `\n` (the newline
 * itself gets a caret at the line end), baselines `topBaseline − i·ADVANCE`.
 */
function layout(
  text: string,
  topBaseline = 0,
): { caretPositions: Float32Array; topBaseline: number } {
  const carets = new Float32Array(text.length * 4);
  let line = 0;
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    const baseline = topBaseline - line * ADVANCE;
    carets.set([x, x + 10, baseline + CARET_BOTTOM, baseline + CARET_TOP], i * 4);
    if (text[i] === '\n') {
      line++;
      x = 0;
    } else x += 10;
  }
  return { caretPositions: carets, topBaseline };
}

const metrics = { fontSize: FONT_SIZE, lineAdvance: ADVANCE };
const rectsOf = (out: number[]): number[][] =>
  Array.from({ length: out.length / 4 }, (_, i) => out.slice(i * 4, i * 4 + 4));

describe('computeDecorationRects', () => {
  it('underlines, overlines, and strikes through one line', () => {
    const out = computeDecorationRects(
      layout('ab cd'),
      'ab cd',
      parseLinePosition('under+over+through'),
      metrics,
    );
    const [under, over, through] = rectsOf(out);
    // Thickness max(1, 12/14) = 1; underline centered 0.1 em below the baseline.
    expect(under![0]).toBe(0);
    expect(under![2]).toBe(50);
    expect(under![1]).toBeCloseTo(-1.2 - 0.5);
    expect(under![3]).toBeCloseTo(-1.2 + 0.5);
    // Overline just under the ascender line (caret top).
    expect(over![1]).toBeCloseTo(CARET_TOP - 1);
    expect(over![3]).toBeCloseTo(CARET_TOP);
    // Line-through centered 0.3 em above the baseline.
    expect((through![1]! + through![3]!) / 2).toBeCloseTo(3.6);
  });

  it('draws one rect per line at each line baseline, skipping outer whitespace', () => {
    const text = '  ab  \ncdef';
    const out = computeDecorationRects(layout(text, 5), text, parseLinePosition('under'), metrics);
    const rects = rectsOf(out);
    expect(rects).toHaveLength(2);
    expect(rects[0]![0]).toBe(20);
    expect(rects[0]![2]).toBe(40);
    expect((rects[0]![1]! + rects[0]![3]!) / 2).toBeCloseTo(5 - 1.2);
    expect(rects[1]![0]).toBe(0);
    expect(rects[1]![2]).toBe(40);
    expect((rects[1]![1]! + rects[1]![3]!) / 2).toBeCloseTo(5 - ADVANCE - 1.2);
  });

  it('keeps line indices for empty lines and scales thickness with large fonts', () => {
    const big = { fontSize: 28, lineAdvance: 28 * 1.2 };
    const text = '\nx';
    const carets = new Float32Array(8);
    carets.set([0, 0, 0 - 0.24 * 28, 0.96 * 28], 0);
    carets.set([0, 16, -big.lineAdvance - 0.24 * 28, -big.lineAdvance + 0.96 * 28], 4);
    const [under] = rectsOf(
      computeDecorationRects(
        { caretPositions: carets, topBaseline: 0 },
        text,
        parseLinePosition('under'),
        big,
      ),
    );
    expect(under![3]! - under![1]!).toBeCloseTo(2); // 28 / 14
    expect((under![1]! + under![3]!) / 2).toBeCloseTo(-big.lineAdvance - 2.8);
  });

  it('honors the minimum thickness', () => {
    const world = { ...metrics, minThickness: 0 };
    const [under] = rectsOf(
      computeDecorationRects(layout('a'), 'a', parseLinePosition('under'), world),
    );
    expect(under![3]! - under![1]!).toBeCloseTo(12 / 14);
  });

  it('returns nothing without carets, lines, or a size', () => {
    const lines = parseLinePosition('under');
    expect(computeDecorationRects({ topBaseline: 0 }, 'a', lines, metrics)).toEqual([]);
    expect(computeDecorationRects(layout('a'), 'a', parseLinePosition('none'), metrics)).toEqual(
      [],
    );
    expect(computeDecorationRects(layout('a'), 'a', lines, { ...metrics, fontSize: 0 })).toEqual(
      [],
    );
    expect(computeDecorationRects(layout('   '), '   ', lines, metrics)).toEqual([]);
  });

  it('handles right-to-left carets (start > end)', () => {
    const carets = new Float32Array(8);
    carets.set([20, 10, CARET_BOTTOM, CARET_TOP], 0);
    carets.set([10, 0, CARET_BOTTOM, CARET_TOP], 4);
    const [under] = rectsOf(
      computeDecorationRects(
        { caretPositions: carets, topBaseline: 0 },
        'אב',
        parseLinePosition('under'),
        metrics,
      ),
    );
    expect([under![0], under![2]]).toEqual([0, 20]);
  });
});

describe('decorationInstanceColumns', () => {
  it('composes the member matrix with the rect', () => {
    const m = new Matrix4().compose(
      new Vector3(5, 6, 7),
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
      new Vector3(2, 2, 2),
    );
    const out = new Float32Array(12);
    decorationInstanceColumns(m.elements, 1, 2, 4, 3, out, 0);
    const corner = (u: number, v: number): number[] =>
      [0, 1, 2, 3].map((r) => out[8 + r]! + u * out[r]! + v * out[4 + r]!);
    const expected = (x: number, y: number): number[] => {
      const p = new Vector3(x, y, 0).applyMatrix4(m);
      return [p.x, p.y, p.z, 1];
    };
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const got = corner(u, v);
      const want = expected(1 + 3 * u, 2 + v);
      got.forEach((value, k) => expect(value).toBeCloseTo(want[k]!, 5));
    }
  });
});

describe('TextDecorationLayer', () => {
  it('collects instances, writes matrices and colors, and releases its resources', () => {
    const resources = createResourceManager();
    const layer = new TextDecorationLayer(resources);
    expect(layer.mesh.visible).toBe(false);
    layer.begin();
    layer.add(0, [0, 0, 10, 1], [1, 0, 0, 1]);
    layer.add(1, [0, 0, 5, 1, 0, 5, 5, 6], [0, 0, 1, 2]);
    layer.end();
    expect(layer.instanceCount).toBe(3);
    expect(layer.mesh.visible).toBe(true);
    expect(layer.mesh.frustumCulled).toBe(false);

    const matrices = [new Matrix4().makeTranslation(100, 0, 0), new Matrix4()];
    layer.place((owner) => matrices[owner]?.elements ?? null);
    const material = layer.mesh.material as unknown as {
      uniforms: Record<string, { value: unknown }>;
    };
    const texture = material.uniforms['uDecorations']!.value as {
      image: { data: Float32Array; width: number };
    };
    const data = texture.image.data;
    expect(texture.image.width).toBe(1024);
    // Instance 0: x̂·10, ŷ·1, corner (100, 0), red.
    expect(Array.from(data.subarray(0, 16))).toEqual([
      10, 0, 0, 0, 0, 1, 0, 0, 100, 0, 0, 1, 1, 0, 0, 1,
    ]);
    // Instance 2: corner (0, 5), blue with the alpha clamped.
    expect(Array.from(data.subarray(32 + 8, 32 + 16))).toEqual([0, 5, 0, 1, 0, 0, 1, 1]);

    // A missing member collapses its quads.
    layer.place((owner) => (owner === 0 ? null : matrices[owner]!.elements));
    expect(Array.from(data.subarray(0, 12)).every((v) => v === 0)).toBe(true);

    layer.begin();
    layer.end();
    expect(layer.mesh.visible).toBe(false);

    expect(resources.stats().some((s) => s.key === UNIT_QUAD_KEY)).toBe(true);
    layer.dispose();
    expect(resources.stats().some((s) => s.key === UNIT_QUAD_KEY)).toBe(false);
  });

  it('grows the data texture for many instances', () => {
    const layer = new TextDecorationLayer(createResourceManager());
    layer.begin();
    for (let i = 0; i < 300; i++) layer.add(i, [0, 0, 1, 1], [0, 0, 0, 1]);
    layer.end();
    layer.place(() => new Matrix4().elements);
    const material = layer.mesh.material as unknown as {
      uniforms: Record<string, { value: unknown }>;
    };
    const texture = material.uniforms['uDecorations']!.value as {
      image: { width: number; height: number };
    };
    // 256 instances per 1024-texel row → 2 rows.
    expect(texture.image.height).toBe(2);
    layer.dispose();
  });
});
