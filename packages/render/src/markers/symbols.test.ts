import { describe, expect, it } from 'vitest';
import {
  AREA_CIRCLE,
  AREA_NONE,
  AREA_POLYGON,
  buildSymbolTable,
  createSymbolTexture,
  MARKER_SYMBOLS,
  resolveSymbol,
  SYMBOL_COUNT,
  SYMBOL_TEXTURE_WIDTH,
  symbolName,
} from './symbols.ts';

/** Plotly's symbol order (plotly.js src/components/drawing/symbol_defs.js). */
const PLOTLY_ORDER = [
  'circle', 'square', 'diamond', 'cross', 'x', 'triangle-up', 'triangle-down', 'triangle-left',
  'triangle-right', 'triangle-ne', 'triangle-se', 'triangle-sw', 'triangle-nw', 'pentagon',
  'hexagon', 'hexagon2', 'octagon', 'star', 'hexagram', 'star-triangle-up', 'star-triangle-down',
  'star-square', 'star-diamond', 'diamond-tall', 'diamond-wide', 'hourglass', 'bowtie',
  'circle-cross', 'circle-x', 'square-cross', 'square-x', 'diamond-cross', 'diamond-x',
  'cross-thin', 'x-thin', 'asterisk', 'hash', 'y-up', 'y-down', 'y-left', 'y-right', 'line-ew',
  'line-ns', 'line-ne', 'line-nw', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
  'arrow-bar-up', 'arrow-bar-down', 'arrow-bar-left', 'arrow-bar-right', 'arrow', 'arrow-wide',
]; // prettier-ignore

/** CPU mirror of the shader's sdPolygon (even-odd sign). */
function sdPolygon(p: [number, number], verts: readonly (readonly [number, number])[]): number {
  let d = Infinity;
  let s = 1;
  let vj = verts[verts.length - 1]!;
  for (const vi of verts) {
    const ex = vj[0] - vi[0];
    const ey = vj[1] - vi[1];
    const wx = p[0] - vi[0];
    const wy = p[1] - vi[1];
    const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c = [p[1] >= vi[1], p[1] < vj[1], ex * wy > ey * wx];
    if (c.every(Boolean) || c.every((v) => !v)) s = -s;
    vj = vi;
  }
  return s * Math.sqrt(d);
}

describe('symbol table', () => {
  it('follows Plotly symbol order', () => {
    expect(SYMBOL_COUNT).toBe(55);
    expect(MARKER_SYMBOLS.map((s) => s.name)).toEqual(PLOTLY_ORDER);
    MARKER_SYMBOLS.forEach((s, i) => expect(s.code).toBe(i));
  });

  it('resolves names, variants, numeric codes, and numeric strings', () => {
    expect(resolveSymbol('circle')).toBe(0);
    expect(resolveSymbol('square-open')).toBe(101);
    expect(resolveSymbol('diamond-dot')).toBe(202);
    expect(resolveSymbol('star-triangle-up-open-dot')).toBe(319);
    expect(resolveSymbol('arrow-wide')).toBe(54);
    expect(resolveSymbol(' Hexagon2 ')).toBe(15);
    expect(resolveSymbol(117)).toBe(117);
    expect(resolveSymbol('205')).toBe(205);
  });

  it('falls back to circle for unknown symbols', () => {
    expect(resolveSymbol('nope')).toBe(0);
    expect(resolveSymbol(55)).toBe(0);
    expect(resolveSymbol(400)).toBe(0);
    expect(resolveSymbol(-1)).toBe(0);
    expect(resolveSymbol(1.5)).toBe(0);
    expect(resolveSymbol('')).toBe(0);
  });

  it('round-trips every code through its name', () => {
    for (let v = 0; v < 4; v++) {
      for (let b = 0; b < SYMBOL_COUNT; b++) {
        const code = b + 100 * v;
        expect(resolveSymbol(symbolName(code))).toBe(code);
      }
    }
  });

  it('gives every symbol drawable geometry with a sane extent', () => {
    for (const s of MARKER_SYMBOLS) {
      expect(s.area !== null || s.segments.length > 0).toBe(true);
      expect(s.extent).toBeGreaterThan(0.5);
      expect(s.extent).toBeLessThanOrEqual(2);
      if (s.noFill) expect(s.area).toBeNull();
    }
  });

  it('contains the anchor point for centered area symbols', () => {
    const offCenter = /^(arrow|hourglass|bowtie)/;
    for (const s of MARKER_SYMBOLS) {
      if (!Array.isArray(s.area) || offCenter.test(s.name)) continue;
      expect(sdPolygon([0, 0], s.area), s.name).toBeLessThan(0);
      expect(sdPolygon([3, 3], s.area), s.name).toBeGreaterThan(0);
    }
  });

  it('points triangles and arrows the right way', () => {
    const area = (name: string) =>
      MARKER_SYMBOLS.find((s) => s.name === name)!.area as [number, number][];
    expect(sdPolygon([0, 0.8], area('triangle-up'))).toBeLessThan(0);
    expect(sdPolygon([0, -0.8], area('triangle-down'))).toBeLessThan(0);
    expect(sdPolygon([-0.8, 0], area('triangle-left'))).toBeLessThan(0);
    expect(sdPolygon([0.8, 0], area('triangle-right'))).toBeLessThan(0);
    // Arrow tips sit on the anchor, bodies trail behind.
    expect(sdPolygon([0, -1], area('arrow-up'))).toBeLessThan(0);
    expect(sdPolygon([0, 1], area('arrow-down'))).toBeLessThan(0);
    expect(sdPolygon([1, 0], area('arrow-left'))).toBeLessThan(0);
    expect(sdPolygon([-1, 0], area('arrow-right'))).toBeLessThan(0);
  });

  it('treats self-intersecting hourglass/bowtie with the even-odd rule', () => {
    const hourglass = MARKER_SYMBOLS[25]!.area as [number, number][];
    expect(sdPolygon([0, 0.8], hourglass)).toBeLessThan(0);
    expect(sdPolygon([0.8, 0], hourglass)).toBeGreaterThan(0);
    const bowtie = MARKER_SYMBOLS[26]!.area as [number, number][];
    expect(sdPolygon([0.8, 0], bowtie)).toBeLessThan(0);
    expect(sdPolygon([0, 0.8], bowtie)).toBeGreaterThan(0);
  });

  it('bends star-* edges inward', () => {
    const starSquare = MARKER_SYMBOLS[21]!.area as [number, number][];
    // The straight edge midpoint (0, -1.1) lies outside the concave shape.
    expect(sdPolygon([0, -1.05], starSquare)).toBeGreaterThan(0);
    expect(sdPolygon([1.05, 1.05], starSquare)).toBeLessThan(0.05);
  });
});

describe('symbol texture', () => {
  it('packs info, meta, and geometry rows', () => {
    const table = buildSymbolTable();
    const W = SYMBOL_TEXTURE_WIDTH;
    expect(table.width).toBe(W);
    expect(table.data.length).toBe(W * table.height * 4);
    const region = (i: number) => table.data.subarray((2 * W + i) * 4, (2 * W + i) * 4 + 4);
    MARKER_SYMBOLS.forEach((s, i) => {
      const [polyStart, polyCount, segStart, segCount] = table.data.subarray(i * 4, i * 4 + 4);
      const [kind, extent, noDot, noFill] = table.data.subarray((W + i) * 4, (W + i) * 4 + 4);
      expect(kind).toBe(s.area === 'circle' ? AREA_CIRCLE : s.area ? AREA_POLYGON : AREA_NONE);
      expect(extent).toBeCloseTo(s.extent, 5);
      expect(noDot).toBe(+s.noDot);
      expect(noFill).toBe(+s.noFill);
      if (Array.isArray(s.area)) {
        expect(polyCount).toBe(s.area.length);
        s.area.forEach(([x, y], k) => {
          expect(region(polyStart! + k)[0]).toBeCloseTo(x, 5);
          expect(region(polyStart! + k)[1]).toBeCloseTo(y, 5);
        });
      }
      expect(segCount).toBe(s.segments.length);
      s.segments.forEach((seg, k) => {
        expect([...region(segStart! + k)].map((v) => +v.toFixed(5))).toEqual(
          seg.map((v) => +v.toFixed(5)),
        );
      });
    });
  });

  it('creates a float nearest-filtered texture', () => {
    const t = createSymbolTexture();
    expect(t.image.width).toBe(SYMBOL_TEXTURE_WIDTH);
    expect(t.generateMipmaps).toBe(false);
    t.dispose();
  });
});
