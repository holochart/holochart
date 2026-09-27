import { supplyDefaults, validate, type FullTrace } from '@mk7s/holochart-core';
import { symbols } from '@mk7s/holochart-render';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { scatter } from './index.ts';
import { markerStyle } from './style.ts';

const registry = createChartRegistry().register(scatter);
const PATH = 'M12 2 22 22H2Z';

function marker(trace: FullTrace): Record<string, unknown> {
  return trace['marker'] as Record<string, unknown>;
}

describe('custom marker symbols in the scatter schema (E8.11)', () => {
  it('warns about unknown names until they are registered', () => {
    const data = [{ y: [1, 2], mode: 'markers', marker: { symbol: 'scatter-test-tri-open' } }];
    const before = validate(data, {}, registry.core);
    expect(before.map((i) => i.path)).toEqual(['data[0].marker.symbol']);
    expect(marker(supplyDefaults({ data }, registry.core).fullData[0]!)['symbol']).toBe('circle');

    symbols.register('scatter-test-tri', { path: PATH });
    expect(validate(data, {}, registry.core)).toEqual([]);
    expect(marker(supplyDefaults({ data }, registry.core).fullData[0]!)['symbol']).toBe(
      'scatter-test-tri-open',
    );
  });

  it('accepts text glyphs and marker.image, and passes images to the marker style', () => {
    const url = 'data:image/png;base64,AAAA';
    const data = [
      { y: [1, 2], mode: 'markers', marker: { symbol: 'text:🚀' } },
      { y: [1, 2], mode: 'markers', marker: { image: [url, null] } },
      { y: [1, 2], mode: 'markers', marker: { image: url } },
    ];
    expect(validate(data, {}, registry.core)).toEqual([]);
    const [a, b, c] = supplyDefaults({ data }, registry.core).fullData;
    expect(marker(a!)['symbol']).toBe('text:🚀');
    expect(markerStyle(b!).image).toEqual([url, null]);
    expect(markerStyle(c!).image).toBe(url);
    expect(markerStyle(a!).image).toBeNull();
    expect(validate([{ y: [1], marker: { image: 3 } }], {}, registry.core)).toHaveLength(1);
  });
});
