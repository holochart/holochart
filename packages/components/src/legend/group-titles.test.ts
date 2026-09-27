/**
 * Legend group titles (`legendgrouptitle`, `legend.grouptitlefont`) and item widths
 * (`legendwidth`), following plotly.js `legend/get_legend_data.js` and `legend/draw.js`.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import { ITEM_GAP, layoutLegend, legendEntries, type LegendEntry } from './layout.ts';
import { buildLegendScene, legendComponent, legendGlyphOf } from './legend.ts';
import type { FullLegend } from './schema.ts';

const registry = testRegistry([legendComponent]);
const SIZE = { width: 700, height: 450 };
const AREA = { x: 80, y: 100, width: 460, height: 270 };
/** Item row height with the 12 px default font. */
const ROW = Math.max(12 * 1.3, 16) + 3;
/** Group title row height (13 px: the default font, 10% larger). */
const TROW = 13 * 1.3 + 3;

function setup(layout: Record<string, unknown>, data: Record<string, unknown>[]) {
  const { fullLayout, fullData } = defaults(layout, data, registry);
  return { fullLayout, fullData, legend: fullLayout['legend'] as FullLegend };
}

const glyph = (t: FullTrace) => legendGlyphOf(t, { colorway: ['#111111', '#222222'] });

function entriesOf(layout: Record<string, unknown>, data: Record<string, unknown>[]) {
  const s = setup(layout, data);
  return {
    ...s,
    entries: legendEntries(
      s.fullData,
      s.legend.traceorder,
      glyph,
      undefined,
      s.legend.grouptitlefont,
    ),
  };
}

const describeEntry = (e: LegendEntry) => (e.groupTitle ? `[${e.name}]` : e.name);

const GROUPS = [
  { name: 'a1', legendgroup: 'a', legendgrouptitle: { text: 'A' } },
  { name: 'b1', legendgroup: 'b' },
  { name: 'a2', legendgroup: 'a' },
  { name: 'b2', legendgroup: 'b', legendgrouptitle: { text: 'B', font: { color: '#00ff00' } } },
  { name: 'c' },
];

describe('legend group title defaults', () => {
  it('defaults grouptitlefont to the global font, 10% larger (Plotly)', () => {
    const { legend } = setup(
      { font: { size: 20, color: '#123456' }, legend: { font: { size: 9 } } },
      [{}, {}],
    );
    expect(legend.grouptitlefont).toMatchObject({ size: 22, color: 'rgb(18, 52, 86)' });
    const set = setup({ legend: { grouptitlefont: { size: 7 } } }, [{}, {}]).legend;
    expect(set.grouptitlefont.size).toBe(7);
  });
});

describe('legendEntries with group titles', () => {
  it('heads each group with the first titled item of its group', () => {
    const { entries } = entriesOf({}, GROUPS);
    expect(entries.map(describeEntry)).toEqual(['[A]', 'a1', 'a2', '[B]', 'b1', 'b2', 'c']);
    const [a, , , b] = entries;
    expect(a?.groupTitle?.font.size).toBe(13);
    expect(b?.groupTitle?.font.color).toBe('rgb(0, 255, 0)');
    // The title's index is its group's first item's (in rank order), and it is clickable.
    expect(b).toMatchObject({ index: 1, group: 'b', groupTitle: { clickable: true } });
  });

  it('keeps titles on top of reversed groups', () => {
    const { entries } = entriesOf({ legend: { traceorder: 'grouped+reversed' } }, GROUPS);
    expect(entries.map(describeEntry)).toEqual(['c', '[B]', 'b2', 'b1', '[A]', 'a2', 'a1']);
  });

  it('puts one title on top of an ungrouped legend, not clickable', () => {
    const { entries } = entriesOf({}, [
      { name: 'x' },
      { name: 'y', legendgrouptitle: { text: 'All' } },
    ]);
    expect(entries.map(describeEntry)).toEqual(['[All]', 'x', 'y']);
    expect(entries[0]?.groupTitle?.clickable).toBe(false);
  });

  it('draws no titles without a group title font (callers that do not draw them)', () => {
    const { fullData, legend } = setup({}, GROUPS);
    expect(legendEntries(fullData, legend.traceorder, glyph).map(describeEntry)).toEqual([
      'a1',
      'a2',
      'b1',
      'b2',
      'c',
    ]);
  });

  it('fades a title when no trace of its group is shown', () => {
    const { entries } = entriesOf({}, [
      { name: 'a1', legendgroup: 'a', legendgrouptitle: { text: 'A' }, visible: 'legendonly' },
      // No legend item of its own, but shown: the title stays opaque (Plotly counts every trace).
      { name: 'a2', legendgroup: 'a', showlegend: false },
      { name: 'b1', legendgroup: 'b', legendgrouptitle: { text: 'B' }, visible: 'legendonly' },
    ]);
    expect(entries.filter((e) => e.groupTitle).map((e) => e.visible)).toEqual([true, 'legendonly']);
  });
});

describe('layoutLegend with group titles', () => {
  const options = { measure, maxWidth: 1000, plotWidth: 400, figureHeight: 450 };

  it('stacks titles as rows in vertical legends, text at the item padding', () => {
    const { legend, entries } = entriesOf({ legend: { tracegroupgap: 9 } }, GROUPS);
    const boxes = layoutLegend(legend, entries, options);
    const ys = boxes.items.map((i) => i.y);
    const top = ITEM_GAP;
    expect(ys).toEqual([
      top,
      top + TROW,
      top + TROW + ROW,
      top + TROW + 2 * ROW + 9,
      top + 2 * TROW + 2 * ROW + 9,
      top + 2 * TROW + 3 * ROW + 9,
      top + 2 * TROW + 4 * ROW + 18,
    ]);
    const title = boxes.items[0];
    expect(title?.textX).toBe(ITEM_GAP);
    expect(title?.text.font.size).toBe(13);
    expect(boxes.items[1]?.textX).toBe(40);
  });

  it('lays out groups as columns in horizontal legends, rows apart by tracegroupgap', () => {
    const { legend, entries } = entriesOf(
      { legend: { orientation: 'h', tracegroupgap: 7 } },
      GROUPS,
    );
    // Items: 40 px to the text, 12 px of text ('a1' is 2 × 6 px) and 2 × 5 px after it.
    const colW = 40 + 12 + 2 * ITEM_GAP;
    const wide = layoutLegend(legend, entries, options);
    expect(wide.items.map((i) => [i.entry.name, i.x, i.y])).toEqual([
      ['A', 0, ITEM_GAP],
      ['a1', 0, ITEM_GAP + TROW],
      ['a2', 0, ITEM_GAP + TROW + ROW],
      ['B', colW, ITEM_GAP],
      ['b1', colW, ITEM_GAP + TROW],
      ['b2', colW, ITEM_GAP + TROW + ROW],
      ['c', 2 * colW, ITEM_GAP],
    ]);
    expect(wide.items[1]?.width).toBe(colW);
    expect(wide.height).toBeCloseTo(2 * ITEM_GAP + TROW + 2 * ROW);

    const narrow = layoutLegend(legend, entries, { ...options, maxWidth: 2 * colW + 1 });
    expect(narrow.items.at(-1)?.x).toBe(0);
    expect(narrow.items.at(-1)?.y).toBeCloseTo(ITEM_GAP + TROW + 2 * ROW + 7);
  });

  it('sizes horizontal items by legendwidth, then entrywidth', () => {
    const data = [{ name: 'a', legendwidth: 100 }, { name: 'b' }, { name: 'c', legendwidth: 0.5 }];
    const px = entriesOf({ legend: { orientation: 'h', entrywidth: 50 } }, data);
    // px of text after the glyph area (Plotly's `textGap + legendwidth`), plus the item gaps.
    expect(layoutLegend(px.legend, px.entries, options).items.map((i) => i.width)).toEqual([
      40 + 100 + 2 * ITEM_GAP,
      40 + 50 + 2 * ITEM_GAP,
      40 + 0.5 + 2 * ITEM_GAP,
    ]);
    const fraction = entriesOf(
      { legend: { orientation: 'h', entrywidth: 0.25, entrywidthmode: 'fraction' } },
      [{ name: 'a', legendwidth: 0.5 }, { name: 'b' }],
    );
    expect(
      layoutLegend(fraction.legend, fraction.entries, options).items.map((i) => i.width),
    ).toEqual([200, 100]);
  });
});

describe('buildLegendScene with group titles', () => {
  it('draws titles as text only, in their font color, with a group hit region', () => {
    const { fullLayout, fullData } = setup({}, GROUPS);
    const scene = buildLegendScene(fullLayout, fullData, SIZE, AREA, measure);
    expect(scene.labels.map((l) => l.text)).toEqual(['A', 'a1', 'a2', 'B', 'b1', 'b2', 'c']);
    expect(scene.markers).toHaveLength(5);
    expect(scene.labels[3]?.color).toEqual([0, 1, 0, 1]);
    expect(scene.labels[3]?.font.size).toBe(13);
    expect(scene.hits.filter((h) => h.group).map((h) => h.index)).toEqual([0, 1]);
  });

  it('makes titles inert with groupclick: toggleitem, and fades hidden groups', () => {
    const { fullLayout, fullData } = setup({ legend: { groupclick: 'toggleitem' } }, [
      { name: 'a1', legendgroup: 'a', legendgrouptitle: { text: 'A' }, visible: 'legendonly' },
      { name: 'b1', legendgroup: 'b' },
    ]);
    const scene = buildLegendScene(fullLayout, fullData, SIZE, AREA, measure);
    expect(scene.hits.some((h) => h.group)).toBe(false);
    expect(scene.labels[0]?.text).toBe('A');
    expect(scene.labels[0]?.color[3]).toBeCloseTo(0.5);
  });
});
