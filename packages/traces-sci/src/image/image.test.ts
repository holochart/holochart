import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  premultiplyPixels,
  RasterPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type HoverContext,
  type HoverQuery,
  type TracePlotContext,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { scatter } from '@mk7s/holochart-traces-basic';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { heatmap } from '../heatmap/index.ts';
import { calcImage, MAX_PIXELS, type ImageCalc } from './calc.ts';
import { COLORMODELS, hslToRgb, makeScaler, scaledToRgba8 } from './colormodel.ts';
import { image } from './index.ts';
import {
  dataUriImageSize,
  decodeBase64,
  imageSizeFromBytes,
  isImageDataUri,
  rememberPixels,
} from './source.ts';

const registry = createChartRegistry().register(image, heatmap, scatter);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const full = fullLayout[`${id}axis`] as FullAxis;
  const type = full?.type === 'date' ? 'date' : 'linear';
  const scale = createScale({ type, range: [-5, 5] });
  return { id, name: `${id}axis`, letter: id, type, scale, full } as unknown as AxisInfo;
}

function setup(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'image', ...t }));
  const { fullData, fullLayout } = supplyDefaults({ data: traces, layout }, registry.core);
  return { fullData, fullLayout, xaxis: axis(fullLayout, 'x'), yaxis: axis(fullLayout, 'y') };
}

function calcOf(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const s = setup([trace], layout);
  const calc = calcImage(s.fullData[0]!, s);
  return { ...s, trace: s.fullData[0]!, calc };
}

/** A base64 data URI of bytes. */
function dataUri(bytes: number[], mime = 'png'): string {
  return `data:image/${mime};base64,${btoa(String.fromCharCode(...bytes))}`;
}

/** The first bytes of a PNG of a size (signature + IHDR). */
function pngHeader(w: number, h: number): number[] {
  const be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  return [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be(13),
    0x49,
    0x48,
    0x44,
    0x52,
    ...be(w),
    ...be(h),
    8,
    6,
    0,
    0,
    0,
  ];
}

const RGB = [
  [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ],
  [
    [0, 0, 0],
    [128, 128, 128],
    [255, 255, 255],
  ],
];

describe('image defaults', () => {
  it("defaults the color model to 'rgb' and zmin / zmax to its range", () => {
    const t = setup([{ z: RGB }]).fullData[0]!;
    expect(t.visible).toBe(true);
    expect(t['colormodel']).toBe('rgb');
    expect(t['zmin']).toEqual([0, 0, 0]);
    expect(t['zmax']).toEqual([255, 255, 255]);
    expect([t['x0'], t['y0'], t['dx'], t['dy']]).toEqual([0, 0, 1, 1]);
    expect(t['zsmooth']).toBe(false);
    expect(t['showlegend']).toBe(false);
  });

  it('fills missing zmin / zmax components from the model (rgba256: alpha up to 255)', () => {
    const t = setup([{ z: RGB, colormodel: 'rgba256', zmax: [100] }]).fullData[0]!;
    expect(t['zmin']).toEqual([0, 0, 0, 0]);
    expect(t['zmax']).toEqual([100, 255, 255, 255]);
    const h = setup([{ z: RGB, colormodel: 'hsla' }]).fullData[0]!;
    expect(h['zmax']).toEqual([360, 100, 100, 1]);
  });

  it('accepts only data URIs as source, read as rgba256', () => {
    const uri = dataUri(pngHeader(4, 2));
    const { fullData } = setup([{ source: uri }, { source: 'https://example.com/a.png' }, {}]);
    expect(fullData[0]!.visible).toBe(true);
    expect(fullData[0]!['colormodel']).toBe('rgba256');
    expect(fullData[0]!['zmax']).toEqual([255, 255, 255, 255]);
    expect(fullData[1]!.visible).toBe(false);
    expect(fullData[1]!['source']).toBeUndefined();
    expect(fullData[2]!.visible).toBe(false);
    expect(isImageDataUri('data:image/svg+xml;base64,AAAA')).toBe(false);
  });

  it('reverses the y axis and keeps square pixels (Plotly image axis defaults)', () => {
    const { fullLayout } = setup([{ z: RGB }]);
    const ya = fullLayout['yaxis'] as FullAxis;
    const xa = fullLayout['xaxis'] as FullAxis;
    expect(ya.autorange).toBe('reversed');
    expect(ya.scaleanchor).toBe('x');
    expect([xa.constrain, ya.constrain]).toEqual(['domain', 'domain']);
    expect(fullLayout._axisConstraintGroups).toEqual([{ x: 1, y: 1 }]);
  });

  it('leaves the y axis alone when another trace type shares it or the user sets it', () => {
    const shared = supplyDefaults(
      {
        data: [
          { type: 'image', z: RGB },
          { type: 'scatter', y: [1] },
        ],
      },
      registry.core,
    ).fullLayout;
    expect((shared['yaxis'] as FullAxis).autorange).toBe(true);
    expect((shared['yaxis'] as FullAxis).scaleanchor).toBe('x');
    const user = setup([{ z: RGB }], {
      yaxis: { autorange: true, scaleanchor: false, constrain: 'range' },
      xaxis: { range: [0, 2] },
    }).fullLayout;
    const ya = user['yaxis'] as FullAxis;
    expect([ya.autorange, ya.scaleanchor, ya.constrain]).toEqual([true, undefined, 'range']);
    expect((user['xaxis'] as FullAxis).autorange).toBe(false);
    const range = setup([{ z: RGB }], { yaxis: { range: [5, 0] } }).fullLayout;
    expect((range['yaxis'] as FullAxis).autorange).toBe(false);
  });

  it('keeps plain axes for heatmaps', () => {
    const { fullLayout } = supplyDefaults({ data: [{ type: 'heatmap', z: [[1]] }] }, registry.core);
    expect((fullLayout['yaxis'] as FullAxis).autorange).toBe(true);
    expect((fullLayout['yaxis'] as FullAxis).scaleanchor).toBeUndefined();
  });
});

describe('image color models (Plotly makeScaler)', () => {
  it('passes components in the model range through, clamped', () => {
    const s = makeScaler('rgb', [0, 0, 0], [255, 255, 255]);
    expect(s([10, 300, -5])).toEqual([10, 255, 0]);
    expect(s([10, 'x', 0])).toBe(false);
    expect(s(['12', 1, 2])).toEqual([12, 1, 2]);
  });

  it('rescales components from zmin / zmax to the model range', () => {
    const s = makeScaler('rgb', [0, 0, 0], [1, 1, 1]);
    expect(s([0.5, 1, 0])).toEqual([127.5, 255, 0]);
    const a = makeScaler('rgba256', [0, 0, 0, 0], [255, 255, 255, 255]);
    expect(a([255, 0, 0, 51])).toEqual([255, 0, 0, 0.2]);
  });

  it('converts scaled colors to 8-bit RGBA like the browser draws the CSS color', () => {
    const out = new Uint8Array(8);
    scaledToRgba8('hsl', [0, 100, 50], out, 0);
    scaledToRgba8('rgba', [10.4, 20.6, 30, 0.5], out, 4);
    expect([...out]).toEqual([255, 0, 0, 255, 10, 21, 30, 128]);
    expect(hslToRgb(120, 100, 25).map(Math.round)).toEqual([0, 128, 0]);
    expect(hslToRgb(240, 50, 50).map(Math.round)).toEqual([64, 64, 191]);
  });

  it('keeps every scaled component inside the model range (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('rgb', 'rgba', 'rgba256', 'hsl', 'hsla' as const),
        fc.array(fc.double({ min: -1e3, max: 1e3, noNaN: true }), { minLength: 4, maxLength: 4 }),
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), { minLength: 4, maxLength: 4 }),
        (model, pixel, lo) => {
          const spec = COLORMODELS[model];
          const zmax = lo.map((v) => v + 1);
          const c = makeScaler(model, lo, zmax)(pixel);
          expect(c).not.toBe(false);
          (c as number[]).forEach((v, k) => {
            expect(v).toBeGreaterThanOrEqual(spec.min[k]!);
            expect(v).toBeLessThanOrEqual(spec.max[k]!);
          });
        },
      ),
    );
  });
});

describe('image sources', () => {
  it('reads the pixel size of PNG, GIF, BMP, JPEG and WebP headers', () => {
    expect(imageSizeFromBytes(Uint8Array.from(pngHeader(640, 480)))).toEqual({
      width: 640,
      height: 480,
    });
    const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2c, 0x01, 0x10, 0x00];
    expect(imageSizeFromBytes(Uint8Array.from(gif))).toEqual({ width: 300, height: 16 });
    const bmp = new Uint8Array(30);
    bmp.set([0x42, 0x4d]);
    new DataView(bmp.buffer).setInt32(18, 7, true);
    new DataView(bmp.buffer).setInt32(22, -5, true);
    expect(imageSizeFromBytes(bmp)).toEqual({ width: 7, height: 5 });
    // SOI, an APP0 segment of 16 bytes, then SOF0 with height 0x0102 and width 0x0304.
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array<number>(14).fill(0)];
    jpeg.push(0xff, 0xc0, 0, 17, 8, 0x01, 0x02, 0x03, 0x04, 3, 0, 0, 0);
    expect(imageSizeFromBytes(Uint8Array.from(jpeg))).toEqual({ width: 772, height: 258 });
    const webp = new Uint8Array(30);
    webp.set(
      [...'RIFF'].map((c) => c.charCodeAt(0)),
      0,
    );
    webp.set(
      [...'WEBPVP8X'].map((c) => c.charCodeAt(0)),
      8,
    );
    webp.set([99, 0, 0, 49, 0, 0], 24);
    expect(imageSizeFromBytes(webp)).toEqual({ width: 100, height: 50 });
    expect(imageSizeFromBytes(Uint8Array.of(1, 2, 3))).toBeUndefined();
  });

  it('decodes base64 (standard and URL-safe) and sizes data URIs', () => {
    expect([...decodeBase64(btoa('hello'))]).toEqual([...'hello'].map((c) => c.charCodeAt(0)));
    expect([...decodeBase64('-_8')]).toEqual([251, 255]);
    expect(dataUriImageSize(dataUri(pngHeader(3, 9)))).toEqual({ width: 3, height: 9 });
  });
});

describe('image calc', () => {
  it('places pixel i from x0 + (i − ½)·dx and converts z to RGBA', () => {
    const { calc } = calcOf({ z: RGB, x0: 10, dx: 2, y0: 1, dy: 0.5 });
    expect([calc.w, calc.h]).toEqual([3, 2]);
    expect([calc.x0, calc.y0]).toEqual([9, 0.75]);
    expect(calc.xEdges).toEqual([9, 15]);
    expect(calc.yEdges).toEqual([0.75, 1.75]);
    const data = Array.from(calc.pixels!.data);
    expect(data.slice(0, 8)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(data.slice(16, 20)).toEqual([128, 128, 128, 255]);
  });

  it('draws missing and non-numeric pixels transparent; rows may be ragged', () => {
    const { calc } = calcOf({ z: [[[1, 2, 3], null, [1, 'a', 3]], [[4, 5, 6]]] });
    expect([calc.w, calc.h]).toEqual([3, 2]);
    const a = Array.from(calc.pixels!.data).filter((_, k) => k % 4 === 3);
    expect(a).toEqual([255, 0, 0, 255, 0, 0]);
  });

  it('sizes a source from its header and leaves decoding to the view', () => {
    const { calc } = calcOf({ source: dataUri(pngHeader(40, 30)) });
    expect([calc.w, calc.h, calc.colormodel]).toEqual([40, 30, 'rgba256']);
    expect(calc.pixels).toBeUndefined();
    expect(calc.yEdges).toEqual([-0.5, 29.5]);
  });

  it('reads x0 as a date on date axes, and refuses huge images', () => {
    const { calc } = calcOf(
      { z: RGB, x0: '2026-01-02', dx: 3_600_000 },
      { xaxis: { type: 'date' } },
    );
    expect(calc.xEdges[0]).toBe(Date.UTC(2026, 0, 2) - 1_800_000);
    const s = setup([{ source: dataUri(pngHeader(5000, 5000)) }]);
    const warn = vi.fn();
    expect(calcImage(s.fullData[0]!, s, { warn }).w).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(5000 * 5000).toBeGreaterThan(MAX_PIXELS);
  });

  it('reports autorange extremes edge to edge', () => {
    const { calc, trace, fullLayout, xaxis, yaxis } = calcOf({ z: RGB });
    const ext = image.extremes!(calc, trace, { fullLayout, index: 0, xaxis, yaxis });
    expect([ext.x!.min[0]!.l, ext.x!.max[0]!.l, ext.y!.max[0]!.l]).toEqual([-0.5, 2.5, 1.5]);
  });
});

describe('image hover (Plotly image/hover.js)', () => {
  function hover(s: ReturnType<typeof calcOf>, xl: number, yl: number) {
    const ctx: HoverContext = {
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: -10, offsetX: 5, offsetY: 100 },
    };
    const query: HoverQuery = { px: 0, py: 0, xl, yl, mode: 'closest', distance: 20 };
    return image.hoverPoints!(s.calc, s.trace, query, ctx);
  }

  it('reports the pixel under the pointer: its center, components and color', () => {
    const s = calcOf({
      z: RGB,
      text: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ],
    });
    const [p] = hover(s, 1.2, 0.8);
    expect(p!.cell).toEqual([1, 1]);
    expect(p!.pointIndex).toBe(4);
    expect([p!.x, p!.y]).toEqual([1, 1]);
    expect(p!.hoverText).toBe('x: 1<br>y: 1<br>z: [128, 128, 128]<br>e');
    expect(p!.fields).toEqual({ z: [128, 128, 128], color: [128, 128, 128], colormodel: 'rgb' });
    expect(p!.labels).toMatchObject({
      z: '[128, 128, 128]',
      color: '[128, 128, 128]',
      'color[0]': '128',
    });
    expect(p!.color).toBe('rgb(128, 128, 128)');
    expect([p!.px, p!.py]).toEqual([15, 90]);
    expect(hover(s, 3, 0)).toEqual([]);
  });

  it("adds the scaled color with the 'color' flag or a hovertemplate", () => {
    const s = calcOf({ z: [[[0.5, 1, 0]]], zmax: [1, 1, 1], hoverinfo: 'z+color' });
    expect(hover(s, 0, 0)[0]!.hoverText).toBe('z: [0.5, 1, 0]<br>RGB: [127.5, 255, 0]');
    const h = calcOf({ z: [[[120, 50, 50, 0.5]]], colormodel: 'hsla', hoverinfo: 'color' });
    expect(hover(h, 0, 0)[0]!.hoverText).toBe('HSLA: [120°, 50%, 50%, 0.5]');
  });

  // Decoded pixels are cached per URI at module level (source.ts), so a URI no earlier run of this
  // test remembered (under `--repeats`, as in the nightly property run) keeps it order-independent.
  let serial = 0;
  it('reads decoded source pixels once available', () => {
    serial++;
    const uri = dataUri([...pngHeader(2, 1), serial & 255, serial >>> 8]);
    const s = calcOf({ source: uri });
    expect(hover(s, 1, 0)).toEqual([]);
    rememberPixels(uri, { data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 255), width: 2, height: 1 });
    const [p] = hover(s, 1, 0);
    expect(p!.labels!['z']).toBe('[5, 6, 7, 255]');
    expect(p!.fields!['color']).toEqual([5, 6, 7, 1]);
  });
});

describe('image view', () => {
  const PLAN: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: false };

  function plotCtx(s: ReturnType<typeof calcOf>) {
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<ImageCalc> = {
      trace: s.trace,
      calc: s.calc,
      index: 2,
      fullLayout: s.fullLayout,
      subplot: undefined,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 50, scaleY: -50 },
      viewport: {} as Viewport,
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => {
        added.splice(added.indexOf(p as Primitive<unknown>), 1);
        p.dispose();
      },
      invalidate: vi.fn(),
    };
    return { ctx, added };
  }

  it('draws one raster from the first pixel edge to the last, under every other trace', () => {
    const { ctx, added } = plotCtx(calcOf({ z: RGB }));
    image.plot!.create(ctx);
    expect(added).toHaveLength(1);
    const r = added[0] as RasterPrimitive;
    expect(r).toBeInstanceOf(RasterPrimitive);
    expect([r.current.x0, r.current.x1, r.current.y0, r.current.y1]).toEqual([
      -0.5, 2.5, -0.5, 1.5,
    ]);
    expect(r.current.pixels.width).toBe(3);
    expect(r.object.renderOrder).toBe(2);
    expect(r.object.visible).toBe(true);
  });

  it('restyles smoothing and opacity in place, zooms through the transform', () => {
    const { ctx, added } = plotCtx(calcOf({ z: RGB }));
    const view = image.plot!.create(ctx);
    const r = added[0] as RasterPrimitive;
    const setTransform = vi.spyOn(r, 'setTransform');
    view.update(
      { ...ctx, trace: { ...ctx.trace, zsmooth: 'fast', opacity: 0.5 } },
      { ...PLAN, style: true },
    );
    expect([r.current.smoothing, r.current.opacity]).toEqual([true, 0.5]);
    view.update(ctx, { ...PLAN, transform: true });
    expect(setTransform).toHaveBeenCalledWith(ctx.transform);
    expect(added).toHaveLength(1);
  });

  it('shows a transparent placeholder until a source is decoded', async () => {
    const { ctx, added } = plotCtx(calcOf({ source: dataUri(pngHeader(4, 3)) }));
    image.plot!.create(ctx);
    const r = added[0] as RasterPrimitive;
    expect([r.current.pixels.width, r.current.pixels.height]).toEqual([4, 3]);
    // No DOM here: decoding resolves without pixels, and the placeholder stays.
    await r.ready;
    expect(r.current.pixels.data.length).toBe(48);
  });

  it('premultiplies pixels for the texture', () => {
    expect([...premultiplyPixels({ data: [200, 100, 50, 128], width: 1, height: 1 })]).toEqual([
      100, 50, 25, 128,
    ]);
  });
});

describe('image describe', () => {
  it('reports the pixel size, model and extent', () => {
    const s = calcOf({ z: RGB, name: 'photo' });
    const d = image.describe!({
      trace: s.trace,
      calc: s.calc,
      index: 0,
      fullLayout: s.fullLayout,
      xaxis: s.xaxis,
      yaxis: s.yaxis,
      maxRows: 10,
    });
    expect(d!.summary).toBe(
      'Image "photo": 3 × 2 RGB pixels, spanning x −0.5 to 2.5 and y −0.5 to 1.5.',
    );
  });
});
