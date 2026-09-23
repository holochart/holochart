import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  markerDefines,
  mergeStyleSummary,
  normalizeSymbolCode,
  SPECIALIZATION_DEFINES,
  summarizeStyle,
  type StyleSummary,
} from './specialize.ts';
import {
  buildSymbolTable,
  MARKER_SYMBOLS,
  resolveSymbol,
  SYMBOL_COUNT,
  symbolLayout,
} from './symbols.ts';

/** Pack items as the `aStyle` attribute does: lineWidth, symbol, opacity, angle. */
function style(items: [lw: number, symbol: number, angle: number][]): Float32Array {
  const out = new Float32Array(items.length * 4);
  items.forEach(([lw, symbol, angle], i) => out.set([lw, symbol, 1, angle], i * 4));
  return out;
}

describe('summarizeStyle', () => {
  it('finds the shared symbol, rotation, stroke, and open usage', () => {
    const s = summarizeStyle(
      style([
        [0, 0, 0],
        [0, 0, 0],
      ]),
      0,
      2,
    );
    expect(s).toEqual({ symbol: 0, anyAngle: false, anyStroke: false, anyOpen: false });
    const mixed = summarizeStyle(
      style([
        [1, 0, 0],
        [0, 105, 30],
      ]),
      0,
      2,
    );
    expect(mixed).toEqual({ symbol: null, anyAngle: true, anyStroke: true, anyOpen: true });
  });

  it('normalizes invalid codes to circle like the vertex shader', () => {
    expect(normalizeSymbolCode(SYMBOL_COUNT)).toBe(0);
    expect(normalizeSymbolCode(400)).toBe(0);
    expect(normalizeSymbolCode(301.2)).toBe(301);
    expect(
      summarizeStyle(
        style([
          [0, 0, 0],
          [0, 999, 0],
        ]),
        0,
        2,
      ).symbol,
    ).toBe(0);
  });

  it('only scans the requested range', () => {
    const s = style([
      [0, 0, 0],
      [2, 5, 45],
      [0, 0, 0],
    ]);
    expect(summarizeStyle(s, 2, 3)).toEqual({
      symbol: 0,
      anyAngle: false,
      anyStroke: false,
      anyOpen: false,
    });
  });
});

describe('mergeStyleSummary', () => {
  const base: StyleSummary = { symbol: 3, anyAngle: false, anyStroke: false, anyOpen: false };

  it('stays specialized when a patch agrees, and goes generic when it does not', () => {
    expect(mergeStyleSummary(base, { ...base })).toEqual(base);
    expect(mergeStyleSummary(base, { ...base, symbol: 4 }).symbol).toBeNull();
    expect(mergeStyleSummary(base, { ...base, anyAngle: true }).anyAngle).toBe(true);
  });

  it('is conservative: merging never claims more uniformity than a full rescan', () => {
    const item = fc.tuple(
      fc.constantFrom(0, 1),
      fc.constantFrom(0, 2, 102, 203, 301),
      fc.constantFrom(0, 15),
    );
    fc.assert(
      fc.property(
        fc.array(item, { minLength: 1, maxLength: 12 }),
        fc.nat(),
        fc.nat(),
        (items, a, b) => {
          const s = style(items);
          const n = items.length;
          const start = a % n;
          const end = start + 1 + (b % (n - start));
          // Before the patch the set was summarized in full; the patch rewrote [start, end).
          const merged = mergeStyleSummary(summarizeStyle(s, 0, n), summarizeStyle(s, start, end));
          const full = summarizeStyle(s, 0, n);
          if (merged.symbol !== null) expect(merged.symbol).toBe(full.symbol);
          if (full.anyAngle) expect(merged.anyAngle).toBe(true);
          if (full.anyStroke) expect(merged.anyStroke).toBe(true);
          if (full.anyOpen) expect(merged.anyOpen).toBe(true);
        },
      ),
    );
  });
});

describe('markerDefines', () => {
  it('bakes the same layout the symbol texture holds', () => {
    const table = buildSymbolTable();
    const W = table.width;
    for (const def of MARKER_SYMBOLS) {
      for (const variant of [0, 1, 2, 3]) {
        const code = def.code + 100 * variant;
        const d = markerDefines({
          symbol: code,
          anyAngle: false,
          anyStroke: false,
          anyOpen: false,
        });
        const info = table.data.slice(def.code * 4, def.code * 4 + 4);
        const meta = table.data.slice((W + def.code) * 4, (W + def.code) * 4 + 4);
        expect(d.MARKER_SYMBOL).toBe(String(code));
        expect(d.SYM_VARIANT).toBe(String(variant));
        expect(
          [d.SYM_POLY_START, d.SYM_POLY_COUNT, d.SYM_SEG_START, d.SYM_SEG_COUNT].map(Number),
        ).toEqual([...info]);
        expect(Number(d.SYM_AREA)).toBe(meta[0]);
        expect(Math.fround(Number(d.SYM_EXTENT))).toBe(meta[1]);
        expect([Number(d.SYM_NO_DOT), Number(d.SYM_NO_FILL)]).toEqual([meta[2], meta[3]]);
        expect(d.SYM_EXTENT).toMatch(/[.eE]/); // a GLSL float literal
      }
    }
  });

  it('adds NO_ROTATION / NO_STROKE only when every item allows it', () => {
    const circle = resolveSymbol('circle');
    const plain = markerDefines({
      symbol: circle,
      anyAngle: false,
      anyStroke: false,
      anyOpen: false,
    });
    expect('NO_ROTATION' in plain && 'NO_STROKE' in plain).toBe(true);
    expect(
      markerDefines({ symbol: circle, anyAngle: true, anyStroke: false, anyOpen: false }),
    ).not.toHaveProperty('NO_ROTATION');
    expect(
      markerDefines({ symbol: circle, anyAngle: false, anyStroke: true, anyOpen: false }),
    ).not.toHaveProperty('NO_STROKE');
    // Open variants draw a 1 px stroke even at lineWidth 0.
    const open = resolveSymbol('circle-open');
    expect(
      markerDefines({ symbol: open, anyAngle: false, anyStroke: false, anyOpen: true }),
    ).not.toHaveProperty('NO_STROKE');
  });

  it('only emits known define names, and none for a mixed, rotated, stroked set', () => {
    const generic = markerDefines({
      symbol: null,
      anyAngle: true,
      anyStroke: true,
      anyOpen: false,
    });
    expect(generic).toEqual({});
    const all = markerDefines({ symbol: 2, anyAngle: false, anyStroke: false, anyOpen: false });
    for (const name of Object.keys(all)) expect(SPECIALIZATION_DEFINES).toContain(name);
  });

  it('shares the texture layout with symbolLayout', () => {
    expect(symbolLayout().entries).toHaveLength(SYMBOL_COUNT);
  });
});
