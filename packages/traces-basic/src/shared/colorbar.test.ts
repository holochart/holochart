import { createRegistry, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { bar } from '../bar/index.ts';
import { scatter } from '../scatter/index.ts';
import { markerColorbar } from './colorscale.ts';

const registry = createRegistry().register(scatter).register(bar);

function run(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  return supplyDefaults({ data, layout }, registry, { onIssue: () => undefined });
}

describe('colorbar attributes and defaults', () => {
  it('defaults marker.colorbar only when showscale is on', () => {
    const { fullData } = run([
      { type: 'scatter', y: [1, 2], marker: { color: [1, 2], showscale: true } },
      { type: 'scatter', y: [1, 2], marker: { color: [1, 2] } },
    ]);
    const cb = (fullData[0]?.['marker'] as Record<string, unknown>)['colorbar'];
    expect(cb).toMatchObject({
      orientation: 'v',
      thickness: 30,
      len: 1,
      x: 1.02,
      xanchor: 'left',
      y: 0.5,
      yanchor: 'middle',
      outlinewidth: 1,
      ticklabeloverflow: 'hide past div',
      title: { text: '', side: 'top' },
    });
    expect((fullData[1]?.['marker'] as Record<string, unknown>)['colorbar']).toBeUndefined();
  });

  it('uses orientation-dependent defaults for horizontal bars', () => {
    const { fullData } = run([
      {
        type: 'bar',
        y: [1, 2],
        marker: { color: [1, 2], showscale: true, colorbar: { orientation: 'h', dtick: 0.5 } },
      },
    ]);
    const cb = (fullData[0]?.['marker'] as Record<string, unknown>)['colorbar'];
    expect(cb).toMatchObject({ x: 0.5, xanchor: 'center', y: 1.02, yanchor: 'bottom', dtick: 0.5 });
    expect((cb as { title: { side: string } }).title.side).toBe('right');
  });

  it('declares the colorbar on layout color axes', () => {
    const { fullLayout } = run(
      [{ type: 'scatter', y: [1, 2], marker: { color: [3, 9], coloraxis: 'coloraxis' } }],
      { coloraxis: { colorbar: { title: { text: 'T' } } } },
    );
    const axis = fullLayout['coloraxis'] as Record<string, unknown>;
    expect(axis['showscale']).toBe(true);
    expect(axis['colorbar']).toMatchObject({ x: 1.02, title: { text: 'T', side: 'top' } });
  });
});

describe('markerColorbar', () => {
  it("returns the trace's own bar with CSS stops and the color domain", () => {
    const { fullData, fullLayout } = run([
      {
        type: 'scatter',
        y: [1, 2, 3],
        marker: {
          color: [1, 5, 3],
          showscale: true,
          colorscale: [
            [0, 'black'],
            [1, 'white'],
          ],
          reversescale: true,
        },
      },
    ]);
    const spec = markerColorbar(fullData[0] as FullTrace, fullLayout);
    expect(spec).toMatchObject({ cmin: 1, cmax: 5 });
    expect(spec?.coloraxis).toBeUndefined();
    expect(spec?.colorscale).toEqual([
      [0, 'rgb(255, 255, 255)'],
      [1, 'rgb(0, 0, 0)'],
    ]);
  });

  it('returns the shared axis bar (with the cross-trace domain) for every trace on it', () => {
    const { fullData, fullLayout } = run([
      { type: 'scatter', y: [1], marker: { color: [2], coloraxis: 'coloraxis' } },
      { type: 'bar', y: [1], marker: { color: [8], coloraxis: 'coloraxis' } },
    ]);
    const a = markerColorbar(fullData[0] as FullTrace, fullLayout);
    const b = markerColorbar(fullData[1] as FullTrace, fullLayout);
    expect(a).toMatchObject({ coloraxis: 'coloraxis', cmin: 2, cmax: 8 });
    expect(b?.coloraxis).toBe('coloraxis');
    expect(b?.attributes).toBe(a?.attributes);
  });

  it('is null without showscale, for plain colors or hidden traces', () => {
    const { fullData, fullLayout } = run(
      [
        { type: 'scatter', y: [1], marker: { color: [2] } },
        { type: 'scatter', y: [1], marker: { color: 'red', showscale: true } },
        { type: 'scatter', y: [1], visible: 'legendonly', marker: { color: [2], showscale: true } },
        { type: 'scatter', y: [1], marker: { color: [2], coloraxis: 'coloraxis' } },
      ],
      { coloraxis: { showscale: false } },
    );
    for (const t of fullData) expect(markerColorbar(t, fullLayout)).toBeNull();
  });

  it('is wired as the scatter and bar `colorbar` hook', () => {
    const { fullData, fullLayout } = run([
      { type: 'bar', y: [1], marker: { color: [2], showscale: true } },
    ]);
    expect(bar.colorbar?.(fullData[0] as FullTrace, { fullLayout })).toMatchObject({ cmin: 1.5 });
    expect(typeof scatter.colorbar).toBe('function');
  });
});
