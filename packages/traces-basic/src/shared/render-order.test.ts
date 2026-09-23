import type { FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { traceRenderOrder, zorderOf } from './render-order.ts';

function trace(type: string, zorder?: number): FullTrace {
  const t = { type, visible: true, _index: 0, _input: {} } as unknown as FullTrace;
  return zorder === undefined ? t : { ...t, zorder };
}

/** Indices sorted by render order, bottom first. */
function drawOrder(traces: FullTrace[]): number[] {
  return traces
    .map((t, i) => ({ i, order: traceRenderOrder(t, i) }))
    .sort((a, b) => a.order - b.order)
    .map((e) => e.i);
}

describe('traceRenderOrder (Plotly draw order)', () => {
  it('draws bars below scatter regardless of trace order', () => {
    expect(drawOrder([trace('scatter'), trace('bar')])).toEqual([1, 0]);
    expect(drawOrder([trace('bar'), trace('scatter')])).toEqual([0, 1]);
  });

  it('keeps trace order within a layer', () => {
    expect(drawOrder([trace('scatter'), trace('bar'), trace('scatter'), trace('bar')])).toEqual([
      1, 3, 0, 2,
    ]);
  });

  it('puts zorder before the layer: a higher-zorder bar covers scatter', () => {
    expect(drawOrder([trace('scatter'), trace('bar', 1)])).toEqual([0, 1]);
    expect(drawOrder([trace('scatter', -1), trace('bar')])).toEqual([0, 1]);
    // Within one zorder group the layer rule still applies.
    expect(drawOrder([trace('scatter', 2), trace('bar', 2), trace('bar')])).toEqual([2, 1, 0]);
  });

  it('draws unknown types in the top layer', () => {
    expect(drawOrder([trace('custom'), trace('bar')])).toEqual([1, 0]);
    expect(traceRenderOrder(trace('custom'), 0)).toBe(traceRenderOrder(trace('scatter'), 0));
  });

  it('leaves room for sub-layers and stays above components drawn below all traces', () => {
    const a = traceRenderOrder(trace('bar'), 5);
    expect(a + 0.5).toBeLessThan(traceRenderOrder(trace('bar'), 6));
    expect(traceRenderOrder(trace('bar', -1000), 0)).toBeGreaterThan(-1e12);
  });

  it('treats a missing or non-finite zorder as 0', () => {
    expect(zorderOf({})).toBe(0);
    expect(zorderOf({ zorder: Number.NaN })).toBe(0);
    expect(zorderOf({ zorder: -3 })).toBe(-3);
  });
});
