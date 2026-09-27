/** `imshow` (plan E23.6): px.imshow's heatmap / image figures, contrast, facets and frames. */
import { describe, expect, it, vi } from 'vitest';
import { prepare } from '../core/args.ts';
import { decodeDataURI } from '../data/__testing__/png-decode.ts';
import hx, { imshow } from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

type Obj = Record<string, unknown>;

const matrix = [
  [1, 20, 30],
  [20, 1, 60],
  [30, 60, 1],
  [5, 6, 7],
];

/** A `h × w × channels` array whose samples count up from `start` (mod 256). */
function ramp(h: number, w: number, channels: number, start = 0): number[][][] {
  return Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) =>
      Array.from({ length: channels }, (_, k) => (start + (r * w + c) * channels + k) % 256),
    ),
  );
}

describe('2D images: heatmaps', () => {
  const f = imshow(matrix);

  it('draws one heatmap on the coloraxis, rows down from the top, square pixels', () => {
    expect(f.data).toEqual([
      {
        type: 'heatmap',
        z: matrix,
        coloraxis: 'coloraxis',
        name: '0',
        hovertemplate: 'x: %{x}<br>y: %{y}<br>color: %{z}<extra></extra>',
        xaxis: 'x',
        yaxis: 'y',
      },
    ]);
    expect(f.layout['yaxis']).toMatchObject({ autorange: 'reversed', constrain: 'domain' });
    expect(f.layout['xaxis']).toMatchObject({ scaleanchor: 'y', constrain: 'domain' });
    expect(f.frames).toBeUndefined();
    // px's top margin, unless the template sets one (the default template does).
    expect(f.layout).not.toHaveProperty('margin');
    expect(imshow(matrix, { template: 'plotly-classic' }).layout['margin']).toEqual({ t: 60 });
  });

  it("colors with the template's sequential colorscale; minmax leaves the range to the trace", () => {
    expect(f.layout['coloraxis']).toEqual({
      colorscale: prepare('t', null, {}).continuousScale,
    });
    const v = imshow(matrix, { colorContinuousScale: 'Viridis', colorContinuousMidpoint: 30 });
    expect(v.layout['coloraxis']).toEqual({ colorscale: 'Viridis', cmid: 30 });
    expect(imshow(matrix, { colorscale: ['red', 'blue'] }).layout['coloraxis']).toEqual({
      colorscale: [
        [0, 'red'],
        [1, 'blue'],
      ],
    });
    const classic = prepare('t', null, { template: 'plotly-classic' }).continuousScale;
    const c = imshow(matrix, { template: 'plotly-classic' });
    expect(c.layout['coloraxis']).toEqual({ colorscale: classic });
    expect(c.layout['template']).toBe('plotly-classic');
  });

  it('origin lower and aspect auto', () => {
    const lower = imshow(matrix, { origin: 'lower' });
    expect((lower.layout['yaxis'] as Obj)['autorange']).toBe(true);
    const auto = imshow(matrix, { aspect: 'auto' });
    expect(auto.layout['xaxis']).not.toHaveProperty('scaleanchor');
    expect(auto.layout['xaxis']).not.toHaveProperty('constrain');
    expect(auto.layout['yaxis']).not.toHaveProperty('constrain');
  });

  it('takes x / y coordinates and labels (axis titles, colorbar, hover)', () => {
    const g = imshow(matrix, {
      x: ['a', 'b', 'c'],
      y: [10, 20, 30, 40],
      labels: { x: 'Day', y: 'Hour', color: 'Visits' },
    });
    expect(g.data[0]).toMatchObject({ x: ['a', 'b', 'c'], y: [10, 20, 30, 40] });
    expect(g.data[0]?.['hovertemplate']).toBe(
      'Day: %{x}<br>Hour: %{y}<br>Visits: %{z}<extra></extra>',
    );
    expect(g.layout['xaxis']).toMatchObject({ title: { text: 'Day' } });
    expect(g.layout['yaxis']).toMatchObject({ title: { text: 'Hour' } });
    expect(g.layout['coloraxis']).toMatchObject({ colorbar: { title: { text: 'Visits' } } });
  });

  it('textAuto sets the texttemplate', () => {
    expect(imshow(matrix, { textAuto: true }).data[0]?.['texttemplate']).toBe('%{z}');
    expect(imshow(matrix, { textAuto: '.2f' }).data[0]?.['texttemplate']).toBe('%{z:.2f}');
    expect(imshow(matrix, { textAuto: false }).data[0]).not.toHaveProperty('texttemplate');
  });

  it('contrast: zmin / zmax, rangeColor, minmax and infer', () => {
    expect(imshow(matrix, { zmin: 5 }).layout['coloraxis']).toMatchObject({ cmin: 5, cmax: 60 });
    expect(imshow(matrix, { zmax: 50 }).layout['coloraxis']).toMatchObject({ cmin: 1, cmax: 50 });
    expect(imshow(matrix, { rangeColor: [0, 100] }).layout['coloraxis']).toMatchObject({
      cmin: 0,
      cmax: 100,
    });
    const floats = [
      [0.1, 0.5],
      [0.25, 0.8],
    ];
    expect(imshow(floats, { contrastRescaling: 'infer' }).layout['coloraxis']).toMatchObject({
      cmin: 0,
      cmax: 1,
    });
    // Integers within 0–255 count as uint8: infer leaves the range to the trace.
    const bytes = imshow(matrix, { contrastRescaling: 'infer' }).layout['coloraxis'] as Obj;
    expect(bytes['cmin']).toBeUndefined();
    expect(bytes['cmax']).toBeUndefined();
    expect(
      imshow([Uint16Array.of(1, 2), Uint16Array.of(3, 4)], { contrastRescaling: 'infer' }).layout[
        'coloraxis'
      ],
    ).toMatchObject({ cmin: 0, cmax: 65535 });
    expect(imshow([[300.5, 2]], { contrastRescaling: 'infer' }).layout['coloraxis']).toMatchObject({
      cmax: 65535,
    });
  });

  it('keeps gaps as null, reads typed rows and casts booleans to 0 / 255', () => {
    expect(imshow([[1, null, NaN], Float32Array.of(2, 3, 4)]).data[0]?.['z']).toEqual([
      [1, null, null],
      [2, 3, 4],
    ]);
    expect(
      imshow([
        [true, false],
        [false, true],
      ]).data[0]?.['z'],
    ).toEqual([
      [255, 0],
      [0, 255],
    ]);
  });

  it('sets title, size and no top margin with a title', () => {
    const t = imshow(matrix, { title: 'Matrix', width: 400, height: 300 });
    expect(t.layout).toMatchObject({ title: { text: 'Matrix' }, width: 400, height: 300 });
    expect(t.layout).not.toHaveProperty('margin');
  });
});

describe('RGB / RGBA images', () => {
  const rgb = ramp(2, 3, 3);

  it('draws uint8 RGB from a PNG by default, pixels unchanged', () => {
    const f = imshow(rgb);
    expect(f.data).toHaveLength(1);
    const trace = f.data[0] as Obj;
    expect(Object.keys(trace).sort()).toEqual(
      ['type', 'source', 'name', 'hovertemplate', 'xaxis', 'yaxis'].sort(),
    );
    expect(trace['type']).toBe('image');
    const png = decodeDataURI(trace['source'] as string);
    expect(png).toMatchObject({ width: 3, height: 2, colorType: 2 });
    expect(png.pixels).toEqual(rgb.flat(2));
    expect(trace['hovertemplate']).toBe(
      'x: %{x}<br>y: %{y}<br>color: [%{z[0]}, %{z[1]}, %{z[2]}]<extra></extra>',
    );
    // The image trace reverses y and keeps pixels square itself.
    expect(f.layout['yaxis']).not.toHaveProperty('autorange');
    expect(f.layout).not.toHaveProperty('coloraxis');
  });

  it('rescales float RGB to 0–255 (infer: 0–1) and then hovers coordinates only', () => {
    const floats = [
      [
        [0, 0.5, 1],
        [0.25, 0.75, 0.1],
      ],
    ];
    const trace = imshow(floats, { labels: { x: 'col' } }).data[0] as Obj;
    expect(decodeDataURI(trace['source'] as string).pixels).toEqual([0, 127, 255, 63, 191, 25]);
    expect(trace['hovertemplate']).toBe('col: %{x}<br>y: %{y}<extra></extra>');
  });

  it('binaryString false: z with colormodel and per-channel zmin / zmax', () => {
    const f = imshow(rgb, { binaryString: false });
    expect(f.data[0]).toEqual({
      type: 'image',
      z: rgb,
      colormodel: 'rgb',
      name: '0',
      hovertemplate: 'x: %{x}<br>y: %{y}<br>color: [%{z[0]}, %{z[1]}, %{z[2]}]<extra></extra>',
      xaxis: 'x',
      yaxis: 'y',
    });
    const floats = imshow([[[0.1, 0.2, 0.3]]], { binaryString: false }).data[0] as Obj;
    expect(floats).toMatchObject({ zmin: [0, 0, 0], zmax: [1, 1, 1] });
    const ranged = imshow(rgb, { binaryString: false, zmin: [0, 10, 20], zmax: 200 });
    expect(ranged.data[0]).toMatchObject({ zmin: [0, 10, 20], zmax: [200, 200, 200] });
  });

  it('RGBA: rgba256 with z; RGBA PNG by default', () => {
    const rgba = ramp(2, 2, 4, 100);
    const z = imshow(rgba, { binaryString: false, rangeColor: [0, 200] }).data[0] as Obj;
    expect(z).toMatchObject({ colormodel: 'rgba256', zmin: [0, 0, 0, 0] });
    expect(z['zmax']).toEqual([200, 200, 200, 255]);
    expect(z['hovertemplate']).toBe('x: %{x}<br>y: %{y}<br>color: %{z}<extra></extra>');
    const png = decodeDataURI((imshow(rgba).data[0] as Obj)['source'] as string);
    expect(png).toMatchObject({ width: 2, height: 2, colorType: 6, pixels: rgba.flat(2) });
  });

  it('reads ImageData as H × W × 4 uint8', () => {
    const data = Uint8ClampedArray.from({ length: 3 * 2 * 4 }, (_, i) => i * 10);
    const f = imshow({ width: 3, height: 2, data });
    const png = decodeDataURI((f.data[0] as Obj)['source'] as string);
    expect(png).toMatchObject({ width: 3, height: 2, colorType: 6 });
    expect(png.pixels).toEqual([...data]);
    expect(() => imshow({ width: 3, height: 3, data })).toThrow(/ImageData of 3×3/);
  });

  it('2D with binaryString: a grayscale PNG stretched min–max', () => {
    const f = imshow(
      [
        [10, 20],
        [30, 110],
      ],
      { binaryString: true },
    );
    const trace = f.data[0] as Obj;
    expect(trace['type']).toBe('image');
    const png = decodeDataURI(trace['source'] as string);
    expect(png).toMatchObject({ width: 2, height: 2, colorType: 0, pixels: [0, 25, 51, 255] });
    expect(trace['hovertemplate']).toBe('x: %{x}<br>y: %{y}<extra></extra>');
    // Unchanged values keep the value line.
    const same = imshow([[0, 255]], { binaryString: true }).data[0] as Obj;
    expect(same['hovertemplate']).toBe('x: %{x}<br>y: %{y}<br>color: %{z[0]}<extra></extra>');
  });

  it('x / y give x0, dx, y0, dy; decreasing coordinates flip the axes', () => {
    const f = imshow(ramp(1, 3, 3), { x: [10, 12, 14], y: [5] });
    expect(f.data[0]).toMatchObject({ x0: 10, dx: 2, y0: 5, dy: 1 });
    const flipped = imshow(rgb, { x: [3, 2, 1], y: [1, 0] });
    expect(flipped.layout['xaxis']).toMatchObject({ autorange: 'reversed' });
    expect(flipped.layout['yaxis']).toMatchObject({ autorange: true });
    expect(imshow(rgb, { origin: 'lower' }).layout['yaxis']).toMatchObject({ autorange: true });
    expect(imshow(rgb, { aspect: 'auto' }).layout['yaxis']).toMatchObject({ scaleanchor: false });
    expect(() => imshow(rgb, { x: ['a', 'b', 'c'] })).toThrow(/only numerical values/);
    expect(() => imshow(rgb, { x: [1, 2] })).toThrow(/length of the x vector/);
  });
});

describe('facets and animation frames', () => {
  const stack = [0, 1, 2].map((k) => matrix.map((row) => row.map((v) => v + k)));

  it('facetCol: one heatmap per slice, one cell each, labelled', () => {
    const f = imshow(stack, { facetCol: 0, labels: { x: 'col' } });
    expect(f.data.map((t) => [t['name'], t['xaxis'], t['yaxis']])).toEqual([
      ['0', 'x', 'y'],
      ['1', 'x2', 'y2'],
      ['2', 'x3', 'y3'],
    ]);
    expect(f.data.map((t) => t['z'])).toEqual(stack);
    const annotations = f.layout['annotations'] as Obj[];
    expect(annotations.map((a) => a['text'])).toEqual([
      'facet_col=0',
      'facet_col=1',
      'facet_col=2',
    ]);
    for (const [x, y] of [
      ['xaxis', 'yaxis'],
      ['xaxis2', 'yaxis2'],
      ['xaxis3', 'yaxis3'],
    ] as const) {
      expect(f.layout[x]).toMatchObject({ constrain: 'domain', title: { text: 'col' } });
      expect(f.layout[y]).toMatchObject({ autorange: 'reversed', constrain: 'domain' });
    }
    expect((f.layout['xaxis2'] as Obj)['scaleanchor']).toBe('y2');
    expect(f.layout['xaxis2']).toMatchObject({ matches: 'x' });
  });

  it('facetCol over the last dimension, custom label; facetColWrap', () => {
    const f = imshow(ramp(2, 2, 3), { facetCol: -1, labels: { facet_col: 'channel' } });
    expect(f.data.map((t) => t['type'])).toEqual(['heatmap', 'heatmap', 'heatmap']);
    expect(f.data[1]?.['z']).toEqual([
      [1, 4],
      [7, 10],
    ]);
    expect((f.layout['annotations'] as Obj[]).map((a) => a['text'])[2]).toBe('channel=2');

    const w = imshow(stack, { facetCol: 0, facetColWrap: 2 });
    // Two rows: slices 0 and 1 on top, slice 2 bottom-left (the grid's first axes).
    expect(w.data.map((t) => t['xaxis'])).toEqual(['x2', 'x3', 'x']);
    expect(w.layout).not.toHaveProperty('xaxis4');
  });

  it('animationFrame: one frame per slice with px controls', () => {
    const f = imshow(stack, { animationFrame: 0 });
    expect(f.frames?.map((fr) => fr.name)).toEqual(['0', '1', '2']);
    expect(f.frames?.map((fr) => fr.data.map((t) => t['z']))).toEqual(stack.map((s) => [s]));
    expect(f.data).toBe(f.frames?.[0]?.data);
    for (const fr of f.frames ?? []) {
      expect(fr.data[0]).toMatchObject({
        xaxis: 'x',
        yaxis: 'y',
        hovertemplate: expect.any(String),
      });
    }
    const [slider] = f.layout['sliders'] as Obj[];
    expect((slider?.['currentvalue'] as Obj)['prefix']).toBe('animation_frame=');
    expect((slider?.['steps'] as Obj[]).map((s) => s['label'])).toEqual(['0', '1', '2']);
    const [menu] = f.layout['updatemenus'] as Obj[];
    const play = (menu?.['buttons'] as Obj[])[0]?.['args'] as unknown[];
    expect(play[1]).toMatchObject({ frame: { duration: 500, redraw: true } });
    const named = imshow(stack, { animationFrame: 0, labels: { animationFrame: 'time' } });
    const [s] = named.layout['sliders'] as Obj[];
    expect((s?.['currentvalue'] as Obj)['prefix']).toBe('time=');
  });

  it('facets and frames together, in either dimension order', () => {
    // [frame][facet][row][col]
    const video = [0, 1].map((a) => [0, 1, 2].map((k) => [[a * 10 + k]]));
    const f = imshow(video, { animationFrame: 0, facetCol: 1 });
    expect(f.frames?.map((fr) => fr.data.map((t) => [t['name'], t['z'], t['xaxis']]))).toEqual([
      [
        ['0', [[0]], 'x'],
        ['1', [[1]], 'x2'],
        ['2', [[2]], 'x3'],
      ],
      [
        ['3', [[10]], 'x'],
        ['4', [[11]], 'x2'],
        ['5', [[12]], 'x3'],
      ],
    ]);
    // [facet][frame][row][col]: the same figure.
    const swapped = [0, 1, 2].map((k) => [0, 1].map((a) => [[a * 10 + k]]));
    expect(imshow(swapped, { animationFrame: 1, facetCol: 0 })).toEqual(f);
  });

  it('RGB facets draw one image per slice', () => {
    const f = imshow([ramp(2, 2, 3), ramp(2, 2, 3, 50)], { facetCol: 0 });
    expect(f.data.map((t) => [t['type'], t['xaxis']])).toEqual([
      ['image', 'x'],
      ['image', 'x2'],
    ]);
    expect(decodeDataURI(f.data[1]?.['source'] as string).pixels).toEqual(
      ramp(2, 2, 3, 50).flat(2),
    );
  });
});

describe('errors', () => {
  it('rejects shapes px rejects, ragged and empty arrays', () => {
    expect(() => imshow(ramp(2, 2, 5))).toThrow(
      /only accepts 2D single-channel, RGB or RGBA images. An image of shape \(2, 2, 5\)/,
    );
    expect(() => imshow([1, 2, 3] as never)).toThrow(/shape \(3,\)/);
    expect(() => imshow([[1, 2], [3]])).toThrow(/ragged/);
    expect(() => imshow([])).toThrow(/empty/);
    expect(() => imshow(null as never)).toThrow(/nested arrays or ImageData/);
  });

  it('checks coordinates and dimensions', () => {
    expect(() => imshow(matrix, { x: [1, 2] })).toThrow(/length of the x vector \(2\)/);
    expect(() => imshow(matrix, { y: [1] })).toThrow(/length of the y vector/);
    expect(() => imshow(matrix, { facetCol: 2 })).toThrow(/dimension index/);
    expect(() => imshow([[[1]]], { facetCol: 0, animationFrame: 0 })).toThrow(/different/);
    expect(() => imshow(matrix, { zmin: [1, 2], binaryString: true })).toThrow(/length 1, 3 or 4/);
  });
});

describe('rendering overload', () => {
  it('renders with newPlot when given an element first', async () => {
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const result = (await hx.imshow(el, matrix, { textAuto: true })) as unknown as {
      el: unknown;
      figure: unknown;
    };
    expect(result.el).toBe(el);
    expect(result.figure).toEqual(imshow(matrix, { textAuto: true }));
    await expect(imshow(el, ramp(1, 1, 5))).rejects.toThrow(/only accepts/);
  });
});
