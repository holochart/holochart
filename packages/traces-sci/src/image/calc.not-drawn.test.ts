/**
 * Images that are not drawn: hidden traces, sources whose pixel size cannot be read from their
 * header, and pictures of more than `MAX_PIXELS` (4096² = 16 777 216) pixels, which are refused with
 * a warning. Each gives a calc without pixels that contributes nothing to autorange.
 */
import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo } from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calcImage, MAX_PIXELS } from './calc.ts';
import { image } from './index.ts';

const registry = createChartRegistry().register(image);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const full = fullLayout[`${id}axis`] as FullAxis;
  const scale = createScale({ type: 'linear', range: [-5, 5] });
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

function calcOf(trace: Record<string, unknown>, warn?: (message: string) => void) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'image', ...trace }] },
    registry.core,
  );
  const xaxis = axis(fullLayout, 'x');
  const yaxis = axis(fullLayout, 'y');
  const t = fullData[0]!;
  const calc = calcImage(t, { xaxis, yaxis }, warn ? { warn } : {});
  const extremes = image.extremes!(calc, t, { fullLayout, index: 0, xaxis, yaxis });
  return { trace: t, calc, extremes };
}

/** A base64 PNG data URI of bytes. */
function dataUri(bytes: number[]): string {
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

/** The first bytes of a PNG of a size (signature + IHDR). */
function pngHeader(w: number, h: number): number[] {
  const be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [0x49, 0x48, 0x44, 0x52];
  return [...signature, ...be(13), ...ihdr, ...be(w), ...be(h), 8, 6, 0, 0, 0];
}

function expectNotDrawn(s: ReturnType<typeof calcOf>): void {
  expect([s.calc.w, s.calc.h]).toEqual([0, 0]);
  expect(s.calc.pixels).toBeUndefined();
  expect(s.calc.source).toBeUndefined();
  expect(s.extremes).toEqual({});
}

const PIXEL = [[[1, 2, 3]]];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('images that are not drawn', () => {
  it('gives a hidden trace no pixels and no autorange', () => {
    const hidden = calcOf({ z: PIXEL, visible: false });
    expect(hidden.trace.visible).toBe(false);
    expectNotDrawn(hidden);
    // Without z or a data URI source the defaults hide the trace.
    const nothing = calcOf({ source: 'https://example.com/a.png' });
    expect(nothing.trace.visible).toBe(false);
    expectNotDrawn(nothing);
    // The same pixel, visible, is drawn.
    const shown = calcOf({ z: PIXEL });
    expect([shown.calc.w, shown.calc.h]).toEqual([1, 1]);
    expect(Array.from(shown.calc.pixels!.data)).toEqual([1, 2, 3, 255]);
  });

  it('does not draw a source whose header is not a known image format', () => {
    const s = calcOf({ source: dataUri([...'not a picture'].map((c) => c.charCodeAt(0))) });
    // A data URI: the defaults accept it; its size is only read in calc.
    expect(s.trace.visible).toBe(true);
    expect(s.trace['colormodel']).toBe('rgba256');
    expectNotDrawn(s);
  });

  it('draws up to 4096² pixels and refuses more through the warning sink', () => {
    expect(MAX_PIXELS).toBe(16_777_216);
    const warn = vi.fn();
    const most = calcOf({ source: dataUri(pngHeader(4096, 4096)) }, warn);
    expect([most.calc.w, most.calc.h]).toEqual([4096, 4096]);
    expect(most.calc.xEdges).toEqual([-0.5, 4095.5]);
    expect(warn).not.toHaveBeenCalled();
    // One more column: 4097 × 4096 = 16 781 312 pixels.
    expectNotDrawn(calcOf({ source: dataUri(pngHeader(4097, 4096)) }, warn));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('image trace 0: 4097×4096 pixels');
    expect(warn.mock.calls[0]![0]).toContain('16777216');
  });

  it('warns on the console by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expectNotDrawn(calcOf({ source: dataUri(pngHeader(8192, 4096)) }));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('image trace 0: 8192×4096 pixels');
    expect(warn.mock.calls[0]![0]).toContain('not drawn');
  });
});
