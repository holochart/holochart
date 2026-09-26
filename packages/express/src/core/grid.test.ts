/**
 * Facet grids and marginal layouts (plan E23.3, E10.8), against plotly.py's `make_subplots`
 * domains and px's axis configuration.
 */
import { describe, expect, it } from 'vitest';
import { histogram, pie, scatter } from '../index.ts';

type Axis = Record<string, unknown>;
const rows = Array.from({ length: 10 }, (_, i) => ({
  x: i,
  y: i * i,
  c: `c${i % 5}`,
  r: i % 2 ? 'odd' : 'even',
  g: i < 5 ? 'low' : 'high',
}));

function close(a: readonly number[], b: readonly number[]): void {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, 10));
}

describe('facet grids', () => {
  it('lays out facetRow × facetCol from the top-left with row labels at the right', () => {
    const f = scatter(rows, { x: 'x', y: 'y', facetRow: 'r', facetCol: 'g' });
    const L = f.layout;
    // Rows bottom-up: xaxis is the bottom-left cell (the last facetRow value, 'odd').
    close((L['yaxis'] as Axis)['domain'] as number[], [0, 0.485]);
    close((L['yaxis3'] as Axis)['domain'] as number[], [0.515, 1]);
    close((L['xaxis2'] as Axis)['domain'] as number[], [0.51, 1]);
    expect(f.data.map((t) => [t['xaxis'], t['yaxis']])).toEqual([
      ['x3', 'y3'], // even, low: top-left
      ['x4', 'y4'], // even, high
      ['x', 'y'], // odd, low: bottom-left
      ['x2', 'y2'],
    ]);
    // Every axis matches the first; tick labels only on the bottom row / first column.
    expect(L['xaxis3']).toMatchObject({ matches: 'x', showticklabels: false });
    expect(L['xaxis2']).toMatchObject({ matches: 'x' });
    expect(L['xaxis2']).not.toHaveProperty('showticklabels');
    expect(L['yaxis2']).toMatchObject({ matches: 'y', showticklabels: false });
    expect(L['yaxis3']).toMatchObject({ matches: 'y', title: { text: 'y' } });
    const texts = (L['annotations'] as Axis[]).map((a) => [
      a['text'],
      a['textangle'] ?? 0,
      a['xanchor'],
    ]);
    expect(texts).toEqual([
      ['g=low', 0, 'center'],
      ['g=high', 0, 'center'],
      ['r=even', 90, 'left'],
      ['r=odd', 90, 'left'],
    ]);
    const evenLabel = (L['annotations'] as Axis[])[2] as Axis;
    expect(evenLabel['x']).toBe(1);
    expect(evenLabel['y']).toBeCloseTo((0.515 + 1) / 2, 10);
  });

  it('wraps facetCol row by row, leaves the rest of the last row empty, and moves ticks up', () => {
    const f = scatter(rows, { x: 'x', y: 'y', facetCol: 'c', facetColWrap: 2 });
    const L = f.layout;
    // 5 facets in 3 rows × 2 columns; px's 0.07 row spacing when wrapped.
    const ys = Object.keys(L).filter((k) => k.startsWith('yaxis'));
    expect(ys).toHaveLength(5);
    close((L['yaxis'] as Axis)['domain'] as number[], [0, (1 - 0.14) / 3]);
    const annotations = L['annotations'] as Axis[];
    expect(annotations.map((a) => a['text'])).toEqual(['c=c0', 'c=c1', 'c=c2', 'c=c3', 'c=c4']);
    // c4 is alone on the bottom row (the xaxis cell); c3 above the empty cell keeps its ticks.
    const c4 = f.data.find((t) => (t['hovertemplate'] as string).startsWith('c=c4'));
    expect(c4?.['xaxis']).toBe('x');
    const c3 = f.data.find((t) => (t['hovertemplate'] as string).startsWith('c=c3'));
    const c3x = L[`xaxis${(c3?.['xaxis'] as string).slice(1)}`] as Axis;
    expect(c3x).not.toHaveProperty('showticklabels');
    expect(c3x).toMatchObject({ title: { text: 'x' } });
    const c1 = f.data.find((t) => (t['hovertemplate'] as string).startsWith('c=c1'));
    expect(L[`xaxis${(c1?.['xaxis'] as string).slice(1)}`]).toMatchObject({
      showticklabels: false,
    });
  });

  it('takes spacing options and rejects impossible ones', () => {
    const f = scatter(rows, { x: 'x', y: 'y', facetCol: 'g', facetColSpacing: 0.1 });
    close((f.layout['xaxis'] as Axis)['domain'] as number[], [0, 0.45]);
    expect(() => scatter(rows, { x: 'x', y: 'y', facetCol: 'c', facetColSpacing: 0.4 })).toThrow(
      /horizontalSpacing .* Lower facetRowSpacing/,
    );
  });

  it('shows the legend once per group across facets', () => {
    const f = scatter(rows, { x: 'x', y: 'y', color: 'r', facetCol: 'g' });
    expect(f.data.map((t) => [t['name'], t['showlegend']])).toEqual([
      ['even', true],
      ['even', false],
      ['odd', true],
      ['odd', false],
    ]);
  });

  it('puts domain traces (pie) in domain cells', () => {
    const f = pie(rows, { names: 'c', values: 'x', facetCol: 'g' });
    expect(f.data.map((t) => t['domain'])).toEqual([
      { x: [0, 0.49], y: [0, 1] },
      { x: [0.51, 1], y: [0, 1] },
    ]);
    expect(f.layout).not.toHaveProperty('xaxis');
  });
});

describe('marginals', () => {
  it('stacks the x marginal above (26% with a histogram or color, else 16%), sharing x', () => {
    const f = scatter(rows, { x: 'x', y: 'y', marginalX: 'box' });
    const L = f.layout;
    close((L['yaxis'] as Axis)['domain'] as number[], [0, 0.84 * 0.99]);
    close((L['yaxis2'] as Axis)['domain'] as number[], [0.84 * 0.99 + 0.01, 1]);
    expect(L['xaxis2']).toMatchObject({ matches: 'x', showticklabels: false, showgrid: true });
    expect(L['yaxis2']).toEqual({
      domain: (L['yaxis2'] as Axis)['domain'],
      anchor: 'x2',
      showticklabels: false,
      showline: false,
      ticks: '',
      showgrid: false,
    });
    expect(f.data.map((t) => [t['type'], t['xaxis'], t['yaxis']])).toEqual([
      ['scatter', 'x', 'y'],
      ['box', 'x2', 'y2'],
    ]);
    expect(f.data[1]).toMatchObject({ notched: true, x: rows.map((r) => r.x), showlegend: false });
    const hist = scatter(rows, { x: 'x', y: 'y', marginalX: 'histogram' });
    close((hist.layout['yaxis'] as Axis)['domain'] as number[], [0, 0.74 * 0.99]);
    expect(hist.layout['yaxis2']).toMatchObject({ showgrid: true });
  });

  it('puts the y marginal at the right; both leave the corner empty', () => {
    const f = scatter(rows, { x: 'x', y: 'y', color: 'g', marginalX: 'violin', marginalY: 'rug' });
    const L = f.layout;
    expect(
      Object.keys(L)
        .filter((k) => /^[xy]axis/.test(k))
        .sort(),
    ).toEqual(['xaxis', 'xaxis2', 'xaxis3', 'yaxis', 'yaxis2', 'yaxis3'].sort());
    // Row 1 (bottom): main (x, y) and the y marginal (x2, y2); the x marginal on top (x3, y3).
    close((L['xaxis'] as Axis)['domain'] as number[], [0, 0.74 * 0.995]);
    expect(L['xaxis2']).toMatchObject({ showticklabels: false, ticks: '', showgrid: false });
    expect(L['xaxis2']).not.toHaveProperty('matches');
    expect(L['yaxis2']).toMatchObject({ matches: 'y', showticklabels: false });
    expect(L['yaxis3']).not.toHaveProperty('matches');
    const rug = f.data.find((t) => t['type'] === 'box' && t['xaxis'] === 'x2');
    expect(rug).toMatchObject({
      boxpoints: 'all',
      jitter: 0,
      fillcolor: 'rgba(255,255,255,0)',
      marker: { symbol: 'line-ew-open' },
      y: rows.filter((r) => r.g === 'low').map((r) => r.y),
    });
    const violin = f.data.find((t) => t['type'] === 'violin');
    expect(violin).toMatchObject({ scalegroup: 'x', xaxis: 'x3', yaxis: 'y3' });
  });

  it('lists counts in histogram marginals and matches the count axes across facets', () => {
    const f = scatter(rows, { x: 'x', y: 'y', facetCol: 'g', marginalX: 'histogram' });
    const marginal = f.data.find((t) => t['type'] === 'histogram');
    expect(marginal).toMatchObject({ opacity: 0.5, bingroup: 'x' });
    expect(marginal?.['hovertemplate']).toBe('g=low<br>x=%{x}<br>count=%{y}<extra></extra>');
    // Top row: y3 (first marginal count axis) and y4 matching it, not the main y.
    expect(f.layout['yaxis4']).toMatchObject({ matches: 'y3' });
    expect(f.layout['yaxis3']).not.toHaveProperty('matches');
  });

  it('rejects marginals that clash with facets', () => {
    expect(() => scatter(rows, { x: 'x', y: 'y', facetRow: 'g', marginalX: 'box' })).toThrow(
      /marginalX cannot be combined with facetRow/,
    );
    expect(() => scatter(rows, { x: 'x', y: 'y', facetCol: 'g', marginalY: 'box' })).toThrow(
      /marginalY cannot be combined with facetCol/,
    );
    expect(() => scatter(rows, { x: 'x', y: 'y', marginalX: 'kde' as never })).toThrow(
      /marginal must be/,
    );
  });

  it('draws histogram marginals of the same values (marginal: box above a histogram)', () => {
    const f = histogram(rows, { x: 'x', marginal: 'box' });
    expect(f.data.map((t) => t['type'])).toEqual(['histogram', 'box']);
    expect(f.layout['yaxis']).toMatchObject({ title: { text: 'count' } });
  });
});
