/**
 * Multiple legends (plan E5.2, plotly.js `legend/defaults.js`, `get_legend_data.js`,
 * `handle_click.js`): the `legend` trace attribute, `legend2`, … containers and their defaults,
 * the `showlegend` default, item assignment, isolation within a legend, margin pushes; and
 * `maxheight` (Plotly's defaults and reference heights), which makes the content scroll.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import { ITEM_GAP, legendMaxHeight, legendShown, SCROLLBAR_ROOM } from './layout.ts';
import { buildLegendScene, legendComponent, legendHitAt } from './legend.ts';
import { legendIds, type FullLegend } from './schema.ts';
import { legendToggle, type ToggleTrace } from './toggle.ts';

const registry = testRegistry([legendComponent]);
const SIZE = { width: 700, height: 450 };
const AREA = { x: 80, y: 100, width: 460, height: 270 };
const ROW = Math.max(12 * 1.3, 16) + 3;

function setup(
  layout: Record<string, unknown>,
  data: Record<string, unknown>[],
  template?: Record<string, unknown>,
) {
  const { fullLayout, fullData } = defaults(
    template ? { ...layout, template: { layout: template } } : layout,
    data,
    registry,
  );
  return { fullLayout, fullData };
}

const legendOf = (fullLayout: FullLayout, id: string) => fullLayout[id] as FullLegend;

describe('multiple legends: defaults', () => {
  it('collects the legends of the traces, `legend` first, in order of first use', () => {
    const { fullLayout, fullData } = setup({}, [
      { legend: 'legend3' },
      {},
      { legend: 'legend2' },
      { legend: 'legend3' },
      { legend: 'legend4', visible: false },
    ]);
    expect(fullData.map((t) => t['legend'])).toEqual([
      'legend3',
      'legend',
      'legend2',
      'legend3',
      'legend4',
    ]);
    expect(legendIds(fullLayout)).toEqual(['legend', 'legend3', 'legend2']);
    expect(legendOf(fullLayout, 'legend3')._id).toBe('legend3');
    // A hidden trace's legend, and containers no trace uses, are not created.
    expect(fullLayout['legend4']).toBeUndefined();
    expect(setup({ legend2: { x: 0.5 } }, [{}]).fullLayout['legend2']).toBeUndefined();
  });

  it('gives each legend every attribute, with the same position defaults as `legend`', () => {
    const { fullLayout } = setup(
      {
        legend2: { orientation: 'h', title: { text: 'Second' }, bgcolor: '#eee' },
        legend3: { x: 0.2, y: 0.3, borderwidth: 2 },
      },
      [{}, { legend: 'legend2' }, { legend: 'legend3', legendgroup: 'g' }],
    );
    expect(legendOf(fullLayout, 'legend')).toMatchObject({ x: 1.02, y: 1, orientation: 'v' });
    expect(legendOf(fullLayout, 'legend2')).toMatchObject({
      orientation: 'h',
      x: 0,
      y: -0.1,
      yanchor: 'top',
      bgcolor: 'rgb(238, 238, 238)',
      title: { text: 'Second', side: 'left' },
    });
    // `traceorder` defaults per legend: only legend3 has a `legendgroup`.
    expect(legendOf(fullLayout, 'legend3')).toMatchObject({
      x: 0.2,
      y: 0.3,
      borderwidth: 2,
      traceorder: 'grouped',
    });
    expect(legendOf(fullLayout, 'legend').traceorder).toBe('normal');
  });

  it("takes the template's `legend` look, not its place, unless the template has `legendN`", () => {
    const look = {
      legend: { orientation: 'h', x: 0, y: 1, yanchor: 'bottom', font: { size: 9 }, itemwidth: 40 },
    };
    const { fullLayout } = setup({}, [{}, { legend: 'legend2' }], look);
    expect(legendOf(fullLayout, 'legend')).toMatchObject({ orientation: 'h', y: 1 });
    const second = legendOf(fullLayout, 'legend2');
    expect(second).toMatchObject({ orientation: 'v', x: 1.02, y: 1, itemwidth: 40 });
    expect(second.font.size).toBe(9);
    const own = setup({}, [{ legend: 'legend2' }], { ...look, legend2: { x: 0.4 } }).fullLayout;
    expect(legendOf(own, 'legend2')).toMatchObject({ x: 0.4, itemwidth: 30 });
  });

  it('shows the legends with two items in `legend`, or one in another legend (Plotly)', () => {
    expect(setup({}, [{}]).fullLayout.showlegend).toBe(false);
    expect(setup({}, [{ legend: 'legend2' }]).fullLayout.showlegend).toBe(true);
    expect(setup({}, [{}, { legend: 'legend2' }]).fullLayout.showlegend).toBe(true);
    expect(setup({}, [{ legend: 'legend2', showlegend: false }]).fullLayout.showlegend).toBe(false);
    const off = setup({ showlegend: false }, [{}, { legend: 'legend2' }]).fullLayout;
    expect(legendShown(off, 'legend2')).toBe(false);
    const hidden = setup({ legend2: { visible: false } }, [{}, { legend: 'legend2' }]).fullLayout;
    expect([legendShown(hidden), legendShown(hidden, 'legend2')]).toEqual([true, false]);
  });
});

describe('multiple legends: items, clicks and margins', () => {
  const data = [
    { name: 'a' },
    { name: 'b', legend: 'legend2', legendgroup: 'g' },
    { name: 'c', legend: 'legend2' },
    { name: 'd', legendgroup: 'g' },
  ];

  it('draws each trace in its own legend only', () => {
    const { fullLayout, fullData } = setup({ legend2: { x: 1.02, y: 0.4 } }, data);
    const names = (id: string) =>
      buildLegendScene(fullLayout, fullData, SIZE, AREA, measure, undefined, { id }).labels.map(
        (l) => l.text,
      );
    expect(names('legend')).toEqual(['a', 'd']);
    expect(names('legend2')).toEqual(['b', 'c']);
    expect(buildLegendScene(fullLayout, fullData, SIZE, AREA, measure).labels).toHaveLength(2);
  });

  it('isolates within the clicked legend; group toggles reach every legend (plotly.js)', () => {
    const traces: ToggleTrace[] = [
      { index: 0, visible: true, legendgroup: '', inLegend: true, legend: 'legend' },
      { index: 1, visible: true, legendgroup: 'g', inLegend: true, legend: 'legend2' },
      { index: 2, visible: true, legendgroup: '', inLegend: true, legend: 'legend2' },
      { index: 3, visible: true, legendgroup: 'g', inLegend: true, legend: 'legend' },
    ];
    expect([...legendToggle(traces, 2, 'toggleothers', 'togglegroup')]).toEqual([
      [1, 'legendonly'],
    ]);
    expect([...legendToggle(traces, 0, 'toggleothers', 'togglegroup')]).toEqual([
      [3, 'legendonly'],
    ]);
    // Already isolated in its legend: the legend's items come back, the others stay as they are.
    const isolated = traces.map((t) =>
      t.index === 1 || t.index === 0 ? { ...t, visible: 'legendonly' as const } : t,
    );
    expect([...legendToggle(isolated, 2, 'toggleothers', 'togglegroup')]).toEqual([[1, true]]);
    expect([...legendToggle(traces, 1, 'toggle', 'togglegroup')]).toEqual([
      [1, 'legendonly'],
      [3, 'legendonly'],
    ]);
  });

  it('pushes the margin once per legend', () => {
    const { fullLayout, fullData } = setup({ legend2: { x: -0.05, xanchor: 'right' } }, data);
    const push = legendComponent.pushMargin?.({
      fullLayout,
      fullData,
      width: SIZE.width,
      height: SIZE.height,
      axes: new Map(),
    } as never);
    expect(Array.isArray(push)).toBe(true);
    const [first, second] = push as { l?: number; r?: number }[];
    expect(first?.r).toBeGreaterThan(0);
    expect(second?.l).toBeGreaterThan(0);
  });
});

describe('maxheight and scrolling', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `s${i}` }));

  it("follows Plotly's reference heights and defaults", () => {
    const legend = (l: Record<string, unknown>) =>
      legendOf(setup({ legend: l }, [{}, {}]).fullLayout, 'legend');
    // Vertical beside the plot: the plot height (default 1).
    expect(legendMaxHeight(legend({}), 270, 450)).toBe(270);
    expect(legendMaxHeight(legend({ maxheight: 0.5 }), 270, 450)).toBe(135);
    // Horizontal, above / below the plot, or container-referenced: the figure height (0.5).
    expect(legendMaxHeight(legend({ orientation: 'h' }), 270, 450)).toBe(225);
    expect(legendMaxHeight(legend({ y: 1, yanchor: 'bottom' }), 270, 450)).toBe(225);
    expect(legendMaxHeight(legend({ y: -0.2 }), 270, 450)).toBe(225);
    expect(legendMaxHeight(legend({ yref: 'container' }), 270, 450)).toBe(225);
    // px, and never less than 30 px.
    expect(legendMaxHeight(legend({ maxheight: 120 }), 270, 450)).toBe(120);
    expect(legendMaxHeight(legend({ maxheight: 0.01 }), 270, 450)).toBe(30);
  });

  it('keeps every item of a legend taller than the plot and lets it scroll', () => {
    const { fullLayout, fullData } = setup({}, many);
    const scene = buildLegendScene(fullLayout, fullData, SIZE, AREA, measure);
    expect(scene.box?.height).toBe(AREA.height);
    expect(scene.contentHeight).toBe(2 * ITEM_GAP + 30 * ROW);
    expect(scene.hits).toHaveLength(30);
    // The scrollbar's room.
    const short = setup({ legend: { maxheight: 2000 } }, many);
    const fits = buildLegendScene(short.fullLayout, short.fullData, SIZE, AREA, measure);
    expect(fits.contentHeight).toBeUndefined();
    expect(scene.box?.width).toBe((fits.box?.width ?? 0) + SCROLLBAR_ROOM);
  });

  it('hit-tests scrolled items at their scrolled positions, inside the box only', () => {
    const { fullLayout, fullData } = setup({}, many);
    const scene = buildLegendScene(fullLayout, fullData, SIZE, AREA, measure);
    const box = scene.box as NonNullable<typeof scene.box>;
    const h5 = scene.hits[5] as (typeof scene.hits)[number];
    const x = h5.left + 10;
    const y = h5.top + h5.height / 2;
    expect(legendHitAt(scene, x, y)?.index).toBe(5);
    // Scrolled by two rows, the same point shows item 7.
    expect(legendHitAt(scene, x, y, 2 * ROW)?.index).toBe(7);
    // Items below the box are unreachable until scrolled into it.
    const last = scene.hits[29] as (typeof scene.hits)[number];
    expect(legendHitAt(scene, x, last.top + 1)).toBeUndefined();
    const offset = last.top + last.height - (box.top + box.height);
    expect(legendHitAt(scene, x, last.top + 1 - offset, offset)?.index).toBe(29);
  });
});
