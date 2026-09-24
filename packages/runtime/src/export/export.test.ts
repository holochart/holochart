// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer, WebGLRendererParameters } from 'three';
import { downloadImage, toImage } from '../api.ts';
import { createChart, type Chart } from '../chart.ts';
import {
  createFakeRenderer,
  setup,
  type FakeRenderer,
  type TestSetup,
} from '../__testing__/fakes.ts';

const XY = { type: 'dots', x: [0, 10], y: [0, 100] };

let t: TestSetup;
let charts: Chart[] = [];
/** Every renderer created (live and offscreen), with its parameters. */
let created: { fake: FakeRenderer; params: WebGLRendererParameters }[];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  created = [];
  t.options.renderRoot = {
    ...t.options.renderRoot,
    createRenderer: (params) => {
      const fake = createFakeRenderer();
      t.renderers.push(fake);
      created.push({ fake, params });
      return fake.renderer as unknown as WebGLRenderer;
    },
  };
  // jsdom has no canvas encoder: answer in the requested type.
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    (type?: string) => `data:${type ?? 'image/png'};base64,QUJD`,
  );
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
  vi.restoreAllMocks();
});

function chart(figure: Parameters<typeof createChart>[1]): Chart {
  const c = createChart(t.container, figure, t.options);
  charts.push(c);
  return c;
}

/** The offscreen renderer of the last export. */
function offscreen(): { fake: FakeRenderer; params: WebGLRendererParameters } {
  const last = created[created.length - 1];
  if (!last || created.length < 2) throw new Error('no offscreen renderer');
  return last;
}

describe('chart.toImage', () => {
  it('renders offscreen at the chart size by default and resolves to a PNG data URL', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    const liveFrames = t.frames();
    const url = await c.toImage();
    expect(url).toBe('data:image/png;base64,QUJD');
    const { fake, params } = offscreen();
    expect(params.preserveDrawingBuffer).toBe(true);
    expect(fake.calls).toContain('size 640x400');
    expect(fake.renderer['setPixelRatio']).toHaveBeenCalledWith(1);
    // The offscreen chart is gone, its canvas never touched the page, the live chart drew nothing.
    expect(fake.renderer.dispose).toHaveBeenCalled();
    expect(fake.canvas.isConnected).toBe(false);
    expect(created[0]?.fake.renderer.dispose).not.toHaveBeenCalled();
    expect(t.frames() - liveFrames).toBe(offscreenFrames());
  });

  it('lays the figure out again at the requested size and scale', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await c.toImage({ width: 300, height: 200, scale: 3, format: 'webp' });
    const { fake } = offscreen();
    expect(fake.calls).toContain('size 300x200');
    expect(fake.renderer['setPixelRatio']).toHaveBeenCalledWith(3);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenLastCalledWith('image/webp');
    // The live chart keeps its size.
    expect(c.size).toEqual({ width: 640, height: 400 });
  });

  it('drops the backgrounds with transparent (not for jpeg)', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await c.toImage({ transparent: true });
    const clear = offscreen().fake.renderer.setClearColor.mock.calls;
    // The canvas clear color is fully transparent.
    expect(clear[clear.length - 1]?.[1]).toBe(0);
    await c.toImage({ transparent: true, format: 'jpeg' });
    const jpeg = offscreen().fake.renderer.setClearColor.mock.calls;
    expect(jpeg.some((call) => call[1] === 1)).toBe(true);
  });

  it('keeps a plot background the figure set itself', async () => {
    const c = chart({ data: [XY], layout: { plot_bgcolor: 'red' } });
    await c.ready;
    await c.toImage({ transparent: true });
    const clear = offscreen().fake.renderer.setClearColor.mock.calls;
    expect(clear.some((call) => call[1] === 1)).toBe(true);
  });

  it('draws the offscreen chart static, without a11y mirror, hover layer or ARIA', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await c.toImage();
    const host = offscreen().fake.canvas.parentElement;
    // Removed on destroy; the host never had a mirror or role in the first place.
    expect(host).toBeNull();
    expect(t.container.querySelectorAll('.holochart-a11y')).toHaveLength(1);
  });

  it('returns base64 only with imageDataOnly', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    expect(await c.toImage({ imageDataOnly: true })).toBe('QUJD');
  });

  it('rejects invalid options, unsupported formats and destroyed charts', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await expect(c.toImage({ width: 0 })).rejects.toThrow(RangeError);
    await expect(c.toImage({ scale: -1 })).rejects.toThrow(RangeError);
    await expect(c.toImage({ format: 'svg' as never })).rejects.toThrow(/unsupported format/);
    c.destroy();
    await expect(c.toImage()).rejects.toThrow(/destroyed/);
  });

  it('rejects when the browser cannot encode the format', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementation(
      () => 'data:image/png;base64,QUJD',
    );
    const c = chart({ data: [XY] });
    await c.ready;
    await expect(c.toImage({ format: 'webp' })).rejects.toThrow(/cannot encode webp/);
  });

  it('rejects an image larger than the drawing buffer', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    t.options.renderRoot = {
      ...t.options.renderRoot,
      createRenderer: () => {
        const fake = createFakeRenderer();
        created.push({ fake, params: {} });
        fake.renderer['getContext'] = () => ({ drawingBufferWidth: 100, drawingBufferHeight: 100 });
        Object.defineProperty(fake.canvas, 'width', { value: 4000 });
        return fake.renderer as unknown as WebGLRenderer;
      },
    };
    await expect(toImage({ data: [XY] }, { width: 4000, height: 100 }, t.options)).rejects.toThrow(
      /larger than this GPU/,
    );
  });
});

describe('functional toImage / downloadImage', () => {
  it('finds the chart in an element', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await expect(toImage(t.container, { format: 'jpeg' })).resolves.toBe(
      'data:image/jpeg;base64,QUJD',
    );
  });

  it('draws a figure object offscreen without a chart on the page', async () => {
    const url = await toImage(
      { data: [XY], layout: { width: 500, height: 300 } },
      { scale: 2 },
      t.options,
    );
    expect(url).toBe('data:image/png;base64,QUJD');
    const only = created[0];
    expect(only?.fake.calls).toContain('size 500x300');
    expect(only?.fake.renderer['setPixelRatio']).toHaveBeenCalledWith(2);
  });

  it('rejects for an element without a chart', async () => {
    await expect(toImage(document.createElement('div'))).rejects.toThrow(/no chart/);
  });

  it('downloads through a temporary link and resolves to the file name', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    let download = '';
    let href = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      download = this.download;
      href = this.href;
    });
    await expect(downloadImage(t.container, { filename: 'sales', format: 'jpeg' })).resolves.toBe(
      'sales.jpeg',
    );
    expect(download).toBe('sales.jpeg');
    expect(href).toBe('data:image/jpeg;base64,QUJD');
    expect(document.querySelector('a')).toBeNull();
    await expect(c.downloadImage()).resolves.toBe('newplot.png');
  });
});

/** Frames the offscreen renderers drew (counted by `t.frames()` too). */
function offscreenFrames(): number {
  return created.slice(1).reduce((n, r) => n + r.fake.renderer.info.reset.mock.calls.length, 0);
}
