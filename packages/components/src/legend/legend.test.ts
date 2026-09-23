import type { FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { defaults, fakeTraceModule, measure, testRegistry } from '../__testing__/fixtures.ts';
import {
  ITEM_GAP,
  layoutLegend,
  legendAnchors,
  legendEntries,
  legendMarginPush,
  legendOrigin,
  legendShown,
} from './layout.ts';
import { buildLegendScene, legendComponent, legendGlyphOf } from './legend.ts';
import type { FullLegend } from './schema.ts';

const registry = testRegistry([legendComponent]);
const SIZE = { width: 700, height: 450 };
const AREA = { x: 80, y: 100, width: 460, height: 270 };
const ROW = Math.max(12 * 1.3, 16) + 3;

function setup(layout: Record<string, unknown>, data: Record<string, unknown>[]) {
  const { fullLayout, fullData } = defaults(layout, data, registry);
  return { fullLayout, fullData, legend: fullLayout['legend'] as FullLegend };
}

const glyph = (t: FullTrace) => legendGlyphOf(t, { colorway: ['#111111', '#222222'] });

describe('legend defaults', () => {
  it('fills orientation-dependent position, anchors and title side', () => {
    const v = setup({}, [{}, {}]).legend;
    expect(v).toMatchObject({
      x: 1.02,
      y: 1,
      xanchor: 'left',
      yanchor: 'auto',
      traceorder: 'normal',
    });
    expect(v.title.side).toBe('top');
    const h = setup({ legend: { orientation: 'h' } }, [{}, {}]).legend;
    expect(h).toMatchObject({ x: 0, y: -0.1, yanchor: 'top' });
    expect(h.title.side).toBe('left');
  });

  it('inherits fonts and background, and groups when a legendgroup is set', () => {
    const { legend } = setup({ font: { size: 13, color: '#123456' }, paper_bgcolor: '#fafafa' }, [
      { legendgroup: 'a' },
      {},
    ]);
    expect(legend.font.size).toBe(13);
    expect(legend.title.font.size).toBe(13);
    expect(legend.bgcolor).toBe('rgb(250, 250, 250)');
    expect(legend.traceorder).toBe('grouped');
  });

  it('shows the legend only with more than one entry (or showlegend)', () => {
    expect(legendShown(setup({}, [{}]).fullLayout)).toBe(false);
    expect(legendShown(setup({}, [{}, {}]).fullLayout)).toBe(true);
    expect(legendShown(setup({ showlegend: true }, [{}]).fullLayout)).toBe(true);
    expect(legendShown(setup({ legend: { visible: false } }, [{}, {}]).fullLayout)).toBe(false);
  });
});

describe('legendEntries', () => {
  const data = [
    { name: 'a' },
    { name: 'b', legendgroup: 'g' },
    { name: 'c', showlegend: false },
    { name: 'd', legendgroup: 'g' },
    { name: 'e', visible: false },
    { name: 'f', legendrank: 1 },
  ];

  it('drops hidden and legend-less traces and sorts by legendrank', () => {
    const { fullData } = setup({}, data);
    expect(legendEntries(fullData, 'normal', glyph).map((e) => e.name)).toEqual([
      'f',
      'a',
      'b',
      'd',
    ]);
  });

  it('groups by legendgroup and reverses', () => {
    const { fullData } = setup({}, [
      { name: 'a', legendgroup: 'g' },
      { name: 'b' },
      { name: 'c', legendgroup: 'g' },
    ]);
    expect(legendEntries(fullData, 'grouped', glyph).map((e) => e.name)).toEqual(['a', 'c', 'b']);
    expect(legendEntries(fullData, 'reversed', glyph).map((e) => e.name)).toEqual(['c', 'b', 'a']);
    expect(legendEntries(fullData, 'reversed+grouped', glyph).map((e) => e.name)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
});

describe('legend glyphs', () => {
  it('uses the module legendIcon when there is one', () => {
    const reg = testRegistry(
      [legendComponent],
      fakeTraceModule({
        legendIcon: () => ({ kind: 'bar', fill: { color: 'red' } }),
      } as never),
    );
    const { fullData } = defaults({}, [{}], reg);
    expect(legendGlyphOf(fullData[0] as FullTrace, { colorway: ['#000'] })).toEqual({
      kind: 'bar',
      fill: { color: 'red' },
    });
  });

  it('falls back to a marker (and line for lines modes) in the trace color', () => {
    const { fullData } = setup({}, [
      { mode: 'markers', marker: { color: 'blue', symbol: 'square', size: 9 } },
      { mode: 'lines+markers', line: { color: 'green', dash: 'dot' } },
      { mode: 'lines' },
    ]);
    const [a, b, c] = fullData.map(glyph);
    expect(a).toEqual({
      kind: 'marker',
      marker: { color: 'blue', symbol: 'square', size: 9, opacity: 1 },
    });
    expect(b?.kind).toBe('lines+markers');
    expect(b?.line).toEqual({ color: 'green', width: 2, dash: 'dot' });
    expect(c).toEqual({ kind: 'line', line: { color: '#111111', width: 2, dash: 'solid' } });
  });
});

describe('layoutLegend', () => {
  it('stacks vertical items with Plotly metrics', () => {
    const { fullData, legend } = setup({}, [{ name: 'alpha' }, { name: 'be' }]);
    const entries = legendEntries(fullData, legend.traceorder, glyph);
    const boxes = layoutLegend(legend, entries, {
      measure,
      maxWidth: 400,
      plotWidth: 400,
      figureHeight: 450,
    });
    expect(boxes.items.map((i) => i.y)).toEqual([ITEM_GAP, ITEM_GAP + ROW]);
    expect(boxes.items[0]).toMatchObject({ glyphX: 20, textX: 40, textY: ITEM_GAP + ROW / 2 });
    // 'alpha' is 5 × 6 px wide.
    expect(boxes.width).toBe(40 + 30 + ITEM_GAP);
    expect(boxes.height).toBe(2 * ITEM_GAP + 2 * ROW);
  });

  it('adds tracegroupgap between groups, a title on top and the border', () => {
    const { fullData, legend } = setup(
      { legend: { tracegroupgap: 9, borderwidth: 2, title: { text: 'Title' } } },
      [
        { name: 'a', legendgroup: 'x' },
        { name: 'b', legendgroup: 'x' },
        { name: 'c', legendgroup: 'y' },
      ],
    );
    const entries = legendEntries(fullData, legend.traceorder, glyph);
    const boxes = layoutLegend(legend, entries, {
      measure,
      maxWidth: 400,
      plotWidth: 400,
      figureHeight: 450,
    });
    const top = 2 + ITEM_GAP + 12 * 1.3 + ITEM_GAP;
    expect(boxes.items.map((i) => i.y)).toEqual([top, top + ROW, top + 2 * ROW + 9]);
    expect(boxes.title).toMatchObject({ text: 'Title', x: 2 + ITEM_GAP, y: 2 + ITEM_GAP });
  });

  it('wraps horizontal rows at the available width, title on the left', () => {
    const { fullData, legend } = setup({ legend: { orientation: 'h', title: { text: 'T' } } }, [
      { name: 'aaaa' },
      { name: 'bbbb' },
      { name: 'cccc' },
    ]);
    const entries = legendEntries(fullData, legend.traceorder, glyph);
    const itemW = 40 + 24 + 2 * ITEM_GAP;
    const titleW = ITEM_GAP + 6 + ITEM_GAP;
    const boxes = layoutLegend(legend, entries, {
      measure,
      maxWidth: titleW + 2 * itemW + 1,
      plotWidth: 400,
      figureHeight: 450,
    });
    expect(boxes.items.map((i) => [i.x, i.y])).toEqual([
      [titleW, ITEM_GAP],
      [titleW + itemW, ITEM_GAP],
      [titleW, ITEM_GAP + ROW],
    ]);
  });

  it('uses entrywidth for horizontal items and drops items past maxheight', () => {
    const { fullData, legend } = setup(
      { legend: { orientation: 'h', entrywidth: 0.25, entrywidthmode: 'fraction' } },
      [{ name: 'a' }, { name: 'b' }],
    );
    const entries = legendEntries(fullData, legend.traceorder, glyph);
    const h = layoutLegend(legend, entries, {
      measure,
      maxWidth: 400,
      plotWidth: 400,
      figureHeight: 450,
    });
    expect(h.items[1]?.x).toBe(100);

    const v = setup({ legend: { maxheight: 40 } }, [{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    const cut = layoutLegend(v.legend, legendEntries(v.fullData, 'normal', glyph), {
      measure,
      maxWidth: 400,
      plotWidth: 400,
      figureHeight: 450,
    });
    expect(cut.height).toBe(40);
    expect(cut.items).toHaveLength(1);
  });
});

describe('legend position and margins', () => {
  it('resolves auto anchors by thirds', () => {
    const { legend } = setup({ legend: { x: 0.9, xanchor: 'auto', y: 0.5 } }, [{}, {}]);
    expect(legendAnchors(legend)).toEqual({ x: 'right', y: 'middle' });
  });

  it('places the box in paper or container coordinates', () => {
    const { legend } = setup({}, [{}, {}]);
    expect(legendOrigin(legend, SIZE, AREA, { width: 100, height: 50 })).toEqual({
      left: 80 + 1.02 * 460,
      top: 100,
    });
    const c = setup(
      {
        legend: {
          xref: 'container',
          x: 1,
          xanchor: 'right',
          yref: 'container',
          y: 0,
          yanchor: 'bottom',
        },
      },
      [{}, {}],
    );
    expect(legendOrigin(c.legend, SIZE, AREA, { width: 100, height: 50 })).toEqual({
      left: 600,
      top: 400,
    });
  });

  it('solves the right margin for a legend beside the plot', () => {
    const { legend } = setup({}, [{}, {}]);
    const margin = { l: 80, r: 80, t: 100, b: 80 };
    const push = legendMarginPush(legend, SIZE, margin, { width: 120, height: 60 });
    const r = push?.r ?? 0;
    expect(r).toBe(Math.ceil((0.02 * (700 - 80) + 120) / 1.02));
    // With that margin the legend's right edge lands on the figure edge.
    const plotW = 700 - 80 - r;
    expect(80 + 1.02 * plotW + 120).toBeLessThanOrEqual(700 + 1e-9);
    expect(push?.t).toBeUndefined();
  });

  it('solves the bottom margin for a horizontal legend under the plot', () => {
    const { legend } = setup({ legend: { orientation: 'h' } }, [{}, {}]);
    const margin = { l: 80, r: 80, t: 100, b: 80 };
    const push = legendMarginPush(legend, SIZE, margin, { width: 300, height: 30 });
    expect(push).toEqual({ b: Math.ceil((30 + 0.1 * (450 - 100)) / 1.1) });
  });

  it('pushes nothing for a legend inside the plot or in container coordinates', () => {
    const inside = setup({ legend: { x: 0.02, y: 0.98 } }, [{}, {}]).legend;
    const margin = { l: 80, r: 80, t: 100, b: 80 };
    expect(legendMarginPush(inside, SIZE, margin, { width: 100, height: 40 })).toBeUndefined();
    const container = setup({ legend: { xref: 'container', yref: 'container' } }, [{}, {}]).legend;
    expect(legendMarginPush(container, SIZE, margin, { width: 100, height: 40 })).toBeUndefined();
  });

  it('pushMargin measures the legend like the draw does', () => {
    const { fullLayout, fullData } = setup({}, [{ name: 'a' }, { name: 'b' }]);
    const push = legendComponent.pushMargin?.({
      fullLayout,
      fullData,
      width: 700,
      height: 450,
      axes: new Map(),
    });
    expect(push && 'r' in push ? push.r : 0).toBeGreaterThan(40);
  });
});

describe('buildLegendScene', () => {
  it('draws box, glyphs, names and hit regions; dims legendonly items', () => {
    const { fullLayout, fullData } = setup({ legend: { borderwidth: 1, bordercolor: '#000' } }, [
      { name: 'shown', mode: 'lines+markers' },
      { name: 'hidden', visible: 'legendonly' },
    ]);
    const scene = buildLegendScene(fullLayout, fullData, SIZE, AREA, measure);
    expect(scene.box).toMatchObject({ left: 80 + 1.02 * 460, top: 100 });
    expect(scene.rects).toHaveLength(1);
    expect(scene.rectBorders[0]?.width).toBe(1);
    expect(scene.lines).toHaveLength(1);
    expect(scene.markers).toHaveLength(2);
    expect(scene.markers[1]?.opacity).toBe(0.5);
    expect(scene.labels.map((l) => l.text)).toEqual(['shown', 'hidden']);
    expect(scene.labels[1]?.color[3]).toBeCloseTo(0.5 * (scene.labels[0]?.color[3] ?? 1));
    expect(scene.hits.map((h) => h.index)).toEqual([0, 1]);
  });

  it('caps glyph sizes, or makes them constant', () => {
    const data = [
      { mode: 'markers', marker: { size: 40 } },
      { mode: 'markers', marker: { size: 4 } },
    ];
    const trace = setup({}, data);
    expect(
      buildLegendScene(trace.fullLayout, trace.fullData, SIZE, AREA, measure).markers.map(
        (m) => m.size,
      ),
    ).toEqual([16, 4]);
    const constant = setup({ legend: { itemsizing: 'constant' } }, data);
    expect(
      buildLegendScene(constant.fullLayout, constant.fullData, SIZE, AREA, measure).markers.map(
        (m) => m.size,
      ),
    ).toEqual([12, 12]);
  });

  it('is empty when the legend is not shown', () => {
    const { fullLayout, fullData } = setup({}, [{}]);
    expect(buildLegendScene(fullLayout, fullData, SIZE, AREA, measure).box).toBeUndefined();
  });
});
