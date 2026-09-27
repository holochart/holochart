import fc from 'fast-check';
import type { InstancedBufferGeometry, ShaderMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext, RGBA } from '../types.ts';
import { ARC_FRAGMENT_SHADER, ARC_VERTEX_SHADER } from './arc.glsl.ts';
import { createArcPrimitive } from './arc.ts';
import { FILL_FRAGMENT_GLSL, FILL_VERTEX_GLSL } from './fill.glsl.ts';
import { createLazyFillPrimitive } from './fill-loader.ts';
import { createFillPrimitive } from './fill.ts';
import { PATTERN_SHAPES, patternsReady, withPatterns, type PatternFill } from './pattern.ts';
import { contrastOf, patternShader, resolvePattern } from './pattern-code.ts';
import { patternCoverage, patternDotRadius, patternLineWidth } from './pattern-coverage.ts';
import { RECT_FRAGMENT_SHADER, RECT_VERTEX_SHADER } from './rect.glsl.ts';
import { createRectPrimitive } from './rect.ts';

/**
 * Pattern fills (plan E8.10): the shader math (through its CPU mirror), Plotly's per-item rules,
 * the hook injection and the lazy loading. The tests share the loader's module state (vitest
 * isolates it per file) and run in order: the first ones see the pattern code not loaded yet.
 */

function context(): PrimitiveContext & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

const code = (shape: string): number => PATTERN_SHAPES.indexOf(shape as never);

/** Mean coverage over the square `[0, extent)²`, sampled on an n × n grid (cell centers). */
function meanCoverage(shape: number, size: number, solidity: number, extent: number, n = 160) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = ((i + 0.5) / n) * extent;
      const y = ((j + 0.5) / n) * extent;
      sum += patternCoverage(x, y, shape, size, solidity, 0.05);
    }
  }
  return sum / (n * n);
}

const RED: RGBA = [1, 0, 0, 1];
const COLORS: Record<string, RGBA> = {
  '#fff': [1, 1, 1, 1],
  '#000': [0, 0, 0, 1],
  blue: [0, 0, 1, 1],
};
const parse = (css: string): RGBA | null => COLORS[css] ?? null;

describe('pattern loading', () => {
  it('loads the pattern code on first use; patternsReady covers it, then work runs at once', async () => {
    const order: string[] = [];
    withPatterns(() => order.push('first'));
    expect(order).toEqual([]);
    await patternsReady();
    expect(order).toEqual(['first']);
    withPatterns(() => order.push('second'));
    expect(order).toEqual(['first', 'second']);
  });
});

describe('pattern tile geometry (Plotly Drawing.pattern)', () => {
  it('maps solidity to line widths and dot radii like plotly.js', () => {
    expect(patternLineWidth(code('/'), 8, 0.3)).toBeCloseTo(2.4);
    expect(patternLineWidth(code('|'), 10, 0.5)).toBeCloseTo(5);
    // Crossed shapes: two families of thinner lines, the union still covers `solidity`.
    expect(patternLineWidth(code('x'), 8, 0.75)).toBeCloseTo(4);
    expect(patternLineWidth(code('+'), 8, 0.75)).toBeCloseTo(4);
    expect(patternDotRadius(8, 0.3)).toBeCloseTo(Math.sqrt((0.3 * 64) / Math.PI));
    expect(patternDotRadius(8, Math.PI / 4)).toBeCloseTo(4);
    expect(patternDotRadius(8, 1)).toBeCloseTo(8 / Math.SQRT2);
  });

  it('orients the lines: / rises to the right (y down), \\ falls, - and | through tile middles', () => {
    const at = (x: number, y: number, shape: string): number =>
      patternCoverage(x, y, code(shape), 8, 0.3, 0.05);
    // x + y ≡ 0: up and to the right in y-down screen space.
    expect(at(4, -4, '/')).toBe(1);
    expect(at(4, -4, '\\')).toBe(0);
    expect(at(4, 4, '\\')).toBe(1);
    expect(at(4, 4, '/')).toBe(0);
    // Diagonals pass through tile corners and are `size` apart across the lines.
    expect(at(0, 0, '/')).toBe(1);
    expect(at(8 * Math.SQRT2, 0, '/')).toBe(1);
    expect(at(4, 0, '-')).toBe(0);
    expect(at(1, 4, '-')).toBe(1);
    expect(at(4, 1, '|')).toBe(1);
    expect(at(4, 4, '+')).toBe(1);
    expect(at(4, 4, '.')).toBe(1);
    expect(at(0, 0, '.')).toBe(0);
    expect(at(4, 4, '')).toBe(0);
  });

  it('covers the solidity fraction of the area, for every shape', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        fc.double({ min: 4, max: 16, noNaN: true }),
        fc.double({ min: 0, max: 0.95, noNaN: true }),
        (shape, size, solidity) => {
          // Dots touch the tile sides at π/4; beyond it Plotly grows the radius linearly to the
          // tile corners, which only approximates the solidity.
          if (shape === 7 && solidity > Math.PI / 4) return true;
          // Four tiles (diagonal tiles are size·√2 wide, but any window of whole line periods
          // averages the same).
          const mean = meanCoverage(shape, size, solidity, 4 * size);
          return Math.abs(mean - solidity) < 0.03;
        },
      ),
      { numRuns: 60 },
    );
  });

  it('shows only the background at solidity 0 and only the foreground at 1', () => {
    for (let shape = 1; shape <= 7; shape++) {
      expect(meanCoverage(shape, 8, 0, 16, 40)).toBe(0);
      expect(meanCoverage(shape, 8, 1, 16, 40)).toBeGreaterThan(0.99);
    }
  });

  it('keeps the intensity of lines and dots thinner than a pixel (box-filter anti-aliasing)', () => {
    // A 0.4 px line (8 px apart) at one device pixel of AA: dimmer, never lost or doubled.
    let sum = 0;
    const n = 800;
    for (let i = 0; i < n; i++) sum += patternCoverage((i / n) * 8, 0, code('|'), 8, 0.05, 1);
    expect(sum / n).toBeCloseTo(0.05, 3);
    // At DPR 2 the ramp is half a CSS px: the same line is sharper, with the same intensity.
    let peak1 = 0;
    let peak2 = 0;
    for (let i = 0; i < n; i++) {
      peak1 = Math.max(peak1, patternCoverage((i / n) * 8, 0, code('|'), 8, 0.05, 1));
      peak2 = Math.max(peak2, patternCoverage((i / n) * 8, 0, code('|'), 8, 0.05, 0.5));
    }
    expect(peak2).toBeCloseTo(2 * peak1, 3);
    // Tiny dots keep their area.
    expect(meanCoverage(code('.'), 8, 0.004, 16, 320)).toBeCloseTo(0.004, 3);
  });

  it('never leaves [0, 1] and repeats with the tile', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 7 }),
        fc.double({ min: 0.5, max: 30, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: 0.25, max: 2, noNaN: true }),
        (shape, size, solidity, x, y, aa) => {
          const c = patternCoverage(x, y, shape, size, solidity, aa);
          // Diagonal tiles are size·√2 wide; straight ones and dots repeat every `size`.
          const period = shape >= 1 && shape <= 3 ? size * Math.SQRT2 : size;
          const shifted = patternCoverage(x + period, y - period, shape, size, solidity, aa);
          return c >= 0 && c <= 1 && Math.abs(c - shifted) < 1e-6;
        },
      ),
    );
  });
});

describe('patternShader', () => {
  it('injects the pattern code at the hooks of the rect, arc and fill shaders', () => {
    for (const [vertex, fragment, fill] of [
      [RECT_VERTEX_SHADER, RECT_FRAGMENT_SHADER, 'vFill'],
      [ARC_VERTEX_SHADER, ARC_FRAGMENT_SHADER, 'vFill'],
      [FILL_VERTEX_GLSL, FILL_FRAGMENT_GLSL, 'vColor'],
    ] as const) {
      expect(vertex).not.toContain('iPatStyle');
      expect(fragment).not.toContain('hcPatFill');
      const v = patternShader(vertex, false);
      const f = patternShader(fragment, true);
      expect(v).toContain('in vec4 iPatStyle;');
      expect(v).toContain('vPatStyle = iPatStyle;');
      expect(v).not.toContain('@pattern');
      expect(f).toContain(`= hcPatFill(${fill});`);
      expect(f).toContain('float hcPatCoverage(');
      expect(f).not.toContain('@pattern');
      // Cached: the same string for the same source (three.js reuses the program).
      expect(patternShader(fragment, true)).toBe(f);
    }
  });

  it('anchors arc tiles at the wedge center and gives fills their opacity', () => {
    const arc = patternShader(ARC_FRAGMENT_SHADER, true);
    expect(arc.indexOf('#define HC_PATTERN_POINT')).toBeLessThan(arc.indexOf('vec4 hcPatFill('));
    const fill = patternShader(FILL_FRAGMENT_GLSL, true);
    expect(fill.indexOf('#define HC_PATTERN_OPACITY')).toBeLessThan(fill.indexOf('hcPatFill('));
  });
});

describe('resolvePattern (Plotly coercePattern / Drawing.pattern rules)', () => {
  const one = (pattern: Record<string, unknown>, extra: Partial<PatternFill> = {}) =>
    resolvePattern({ pattern, color: RED, parse, ...extra }, 1);

  it("replace (default): the item's color on a transparent background, fgopacity 1", () => {
    const r = one({ shape: '/' });
    expect([...r.style]).toEqual([1, 8, Math.fround(0.3), 0]);
    expect([...r.fg]).toEqual([1, 0, 0, 1]);
    expect([...r.bg]).toEqual([0, 0, 0, 0]);
  });

  it("overlay: the item's color behind its contrast color at fgopacity 0.5", () => {
    const r = one({ shape: 'x', fillmode: 'overlay', size: 12, solidity: 0.5 });
    expect([...r.style]).toEqual([3, 12, 0.5, 0]);
    expect([...r.bg]).toEqual([1, 0, 0, 1]);
    // Red is dark (brightness 76): white hatches.
    expect([...r.fg]).toEqual([1, 1, 1, 0.5]);
    const light = resolvePattern(
      { pattern: { shape: '.', fillmode: 'overlay' }, color: [1, 1, 0, 1], parse },
      1,
    );
    expect([...light.fg].map((v) => +v.toFixed(3))).toEqual([0.267, 0.267, 0.267, 0.5]);
  });

  it('composites translucent colors over the background before picking the contrast', () => {
    const halfBlue: RGBA = [0, 0, 1, 0.5];
    expect(contrastOf(halfBlue)).not.toEqual([1, 1, 1, 1]);
    expect(contrastOf(halfBlue, [0, 0, 0, 1])).toEqual([1, 1, 1, 1]);
    const r = resolvePattern(
      {
        pattern: { shape: '/', fillmode: 'overlay' },
        color: halfBlue,
        background: '#000',
        parse,
      },
      1,
    );
    expect([...r.fg]).toEqual([1, 1, 1, 0.5]);
  });

  it('explicit colors and fgopacity win; opacities multiply both colors', () => {
    const r = one(
      { shape: '-', fgcolor: 'blue', bgcolor: '#fff', fgopacity: 0.8 },
      { opacity: [0.5] },
    );
    expect([...r.fg]).toEqual([0, 0, 1, Math.fround(0.4)]);
    expect([...r.bg]).toEqual([1, 1, 1, 0.5]);
  });

  it('reads arrayOk attributes per item; items without a shape keep their plain fill', () => {
    const r = resolvePattern(
      {
        pattern: {
          shape: ['', '|', '+'],
          size: [4, 6, 10],
          solidity: 0.2,
          fgcolor: [null, '#000'],
        },
        color: new Float32Array([0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1]),
        parse,
      },
      3,
    );
    expect(r.style[0]).toBe(0);
    expect([...r.style.subarray(4)]).toEqual([
      5,
      6,
      Math.fround(0.2),
      0,
      6,
      10,
      Math.fround(0.2),
      0,
    ]);
    expect([...r.fg.subarray(4, 8)]).toEqual([0, 0, 0, 1]);
    // No fgcolor for the third bar: its own color.
    expect([...r.fg.subarray(8)]).toEqual([1, 0, 0, 1]);
  });

  it('maps items to pattern indices (items drawn out of a longer list)', () => {
    const r = resolvePattern(
      {
        pattern: { shape: ['/', '\\', '.'] },
        color: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]),
        index: [2, -1, 0],
        parse,
      },
      3,
    );
    expect([r.style[0], r.style[4], r.style[8]]).toEqual([7, 0, 1]);
    expect([...r.fg.subarray(0, 4)]).toEqual([0, 0, 1, 1]);
  });

  it('draws the first entry of per-item patterns, with Plotly legend sizes when asked', () => {
    const pattern = [
      { shape: ['.', '/'], size: [4, 20], solidity: [0.1, 0.9] },
      undefined,
      { shape: 'x', size: 14, solidity: 0.4 },
    ];
    const r = resolvePattern({ pattern, color: new Float32Array(12), parse, legend: true }, 3);
    // Arrays of size / solidity show at 8 / 0.5; sizes above 10 at 10; tiles scaled by 0.8.
    expect([...r.style.subarray(0, 4)]).toEqual([7, Math.fround(6.4), 0.5, 0]);
    expect(r.style[4]).toBe(0);
    expect([...r.style.subarray(8)]).toEqual([3, 8, Math.fround(0.4), 0]);
    const plain = resolvePattern({ pattern, color: new Float32Array(12), parse }, 3);
    expect([...plain.style.subarray(0, 4)]).toEqual([7, 4, Math.fround(0.1), 0]);
  });
});

describe('primitives with patterns', () => {
  const pattern = (): PatternFill => ({
    pattern: { shape: ['/', ''], fillmode: 'overlay' },
    color: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
    parse,
  });

  it('rects: per-instance attributes and pattern shaders; null goes back to the plain ones', async () => {
    const ctx = context();
    const rects = createRectPrimitive(ctx, { x0: [0, 2], y0: [0, 0], x1: [1, 3], y1: [1, 1] });
    const material = rects.object.material as ShaderMaterial;
    await rects.ready;
    expect(material.fragmentShader).toBe(RECT_FRAGMENT_SHADER);

    rects.update({ pattern: pattern() });
    await rects.ready;
    expect(material.fragmentShader).toBe(patternShader(RECT_FRAGMENT_SHADER, true));
    expect(material.vertexShader).toBe(patternShader(RECT_VERTEX_SHADER, false));
    const geometry = rects.object.geometry as InstancedBufferGeometry;
    const style = geometry.getAttribute('iPatStyle');
    // Sized to the instance capacity, like the other instance attributes.
    expect(style.count).toBe(geometry.getAttribute('iFill').count);
    expect([...(style.array as Float32Array).subarray(0, 8)]).toEqual([
      1,
      8,
      Math.fround(0.3),
      0,
      0,
      0,
      0,
      0,
    ]);
    expect([...(geometry.getAttribute('iPatBg').array as Float32Array).subarray(0, 4)]).toEqual([
      1, 0, 0, 1,
    ]);

    // Growing past the capacity allocates new buffers: the pattern follows.
    const n = 40;
    const xs = Float64Array.from({ length: n }, (_, i) => i);
    rects.update({ x0: xs, x1: xs.map((x) => x + 0.5), y0: new Float64Array(n), y1: xs });
    const grown = rects.object.geometry as InstancedBufferGeometry;
    expect(grown).not.toBe(geometry);
    expect(grown.getAttribute('iPatStyle').count).toBeGreaterThanOrEqual(n);

    rects.update({ pattern: null });
    expect(material.fragmentShader).toBe(RECT_FRAGMENT_SHADER);
    expect(material.vertexShader).toBe(RECT_VERTEX_SHADER);
    rects.dispose();
  });

  it('arcs: the same, with a pattern per wedge', async () => {
    const arcs = createArcPrimitive(context(), {
      x: [0, 0],
      y: [0, 0],
      startAngle: new Float32Array([0, 1]),
      endAngle: new Float32Array([1, 2]),
      pattern: pattern(),
    });
    await arcs.ready;
    const material = arcs.object.material as ShaderMaterial;
    expect(material.fragmentShader).toBe(patternShader(ARC_FRAGMENT_SHADER, true));
    const geometry = arcs.object.geometry as InstancedBufferGeometry;
    expect(geometry.getAttribute('iPatStyle').array[0]).toBe(1);
    arcs.dispose();
  });

  it('applies patterns at once once the code is in, and never after dispose', () => {
    const rects = createRectPrimitive(context(), { x0: [0], y0: [0], x1: [1], y1: [1] });
    const material = rects.object.material as ShaderMaterial;
    rects.update({ pattern: pattern() });
    expect(material.fragmentShader).toBe(patternShader(RECT_FRAGMENT_SHADER, true));
    rects.update({ pattern: null });
    rects.dispose();
    rects.update({ pattern: pattern() });
    expect(material.fragmentShader).toBe(RECT_FRAGMENT_SHADER);
  });

  it('fills: per-vertex attributes for every polygon, and the pattern shaders', async () => {
    const fill = createFillPrimitive(context(), {
      x: [0, 1, 1, 0, 2, 3, 3],
      y: [0, 0, 1, 1, 0, 0, 1],
      rings: [0, 4],
      color: [0, 1, 0, 1],
      paint: {
        kind: 'pattern',
        pattern: { pattern: { shape: ['.', '|'] }, color: [0, 1, 0, 0.5], parse },
      },
    });
    await fill.ready;
    const material = fill.object.material;
    expect(material.fragmentShader).toBe(patternShader(FILL_FRAGMENT_GLSL, true));
    const style = fill.object.geometry.getAttribute('iPatStyle').array as Float32Array;
    const starts = fill.triangulation.vertexStarts;
    expect(style[starts[0]! * 4]).toBe(7);
    expect(style[starts[1]! * 4]).toBe(5);
    const fg = fill.object.geometry.getAttribute('iPatFg').array as Float32Array;
    expect([...fg.subarray(0, 4)]).toEqual([0, 1, 0, 0.5]);
    fill.update({ paint: { kind: 'solid' } });
    expect(material.fragmentShader).toBe(FILL_FRAGMENT_GLSL);
    fill.dispose();
  });

  it('lazy fills: ready covers the fill code and then the pattern', async () => {
    const lazy = createLazyFillPrimitive(context(), {
      x: [0, 1, 1],
      y: [0, 0, 1],
      color: [1, 0, 0, 1],
      paint: { kind: 'pattern', pattern: pattern() },
    });
    await lazy.ready;
    await lazy.ready;
    expect((lazy.object.material as ShaderMaterial).fragmentShader).toBe(
      patternShader(FILL_FRAGMENT_GLSL, true),
    );
    lazy.dispose();
  });
});
