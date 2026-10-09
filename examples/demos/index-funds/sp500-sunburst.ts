import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate, HOLDINGS, LABEL, SECTOR_COLOR, sectorWeights } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The S&P 500 from the inside out: the index in the middle, its eleven sectors in the first ring
 * and, in the outer ring, every stock that weighs more than 0.5% of the index, with the rest of
 * each sector in one "N others" wedge. A `sunburst` with unique `ids`, `branchvalues: 'total'`,
 * `sort: false` so sectors and stocks keep their order (largest first, the others last), sector
 * colors with lighter leaves (`leaf.opacity`), `text` labels hidden where a wedge is too thin for
 * 8 px text (`uniformtext`), and names and weights in the hover text (`customdata`). Click a
 * sector to make it the center.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: the S&P 500 by sector and largest stocks',
  description:
    'Sunburst of the S&P 500: sectors, then every stock above 0.5% of the index and the rest of each sector as one wedge.',
  tags: ['demo', 'sunburst', 'hierarchical', 'branchvalues', 'uniformtext', 'hover', 'financial'],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

/** Stocks above this weight (percent of the index) get their own wedge. */
const THRESHOLD = 0.5;
const ROOT = 'S&P 500';
/** Sector names short enough for the first ring. */
const SHORT: Readonly<Record<string, string>> = {
  XLC: 'Communi-<br>cation',
  XLY: 'Consumer<br>discret.',
  XLP: 'Staples',
  XLV: 'Health<br>care',
  XLRE: 'Real estate',
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const { holdings, asOf } = HOLDINGS.SPY;
  const ids: string[] = [];
  const labels: string[] = [];
  const parents: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  const text: string[] = [];
  const customdata: string[] = [];
  const add = (
    id: string,
    label: string,
    parent: string,
    value: number,
    color: string,
    shown: string,
    hover: string,
  ): void => {
    ids.push(id);
    labels.push(label);
    parents.push(parent);
    values.push(value);
    colors.push(color);
    text.push(shown);
    customdata.push(hover);
  };

  const sectors = sectorWeights().map((s) => {
    const members = holdings.filter((h) => h.sector === s.sector);
    const shown = members.filter((h) => h.weight > THRESHOLD);
    const rest = members.filter((h) => h.weight <= THRESHOLD);
    const others = rest.reduce((a, h) => a + h.weight, 0);
    // The branch total is the sum of the wedges under it, in their order.
    const weight = shown.reduce((a, h) => a + h.weight, 0) + others;
    return { ...s, shown, rest, others, weight };
  });
  const total = sectors.reduce((a, s) => a + s.weight, 0);
  const named = sectors.reduce((a, s) => a + s.shown.length, 0);

  add(ROOT, ROOT, '', total, LOOK.bg, `<b>${ROOT}</b><br>${holdings.length} stocks`, 'the index');
  for (const s of sectors) {
    const color = SECTOR_COLOR[s.sector];
    const name = LABEL[s.sector];
    add(
      s.sector,
      name,
      ROOT,
      s.weight,
      color,
      `${SHORT[s.sector] ?? name}<br>${s.weight.toFixed(1)}%`,
      `${s.count} stocks`,
    );
    for (const h of s.shown) {
      add(
        `${s.sector}/${h.ticker}`,
        h.ticker,
        s.sector,
        h.weight,
        color,
        `${h.ticker} ${h.weight.toFixed(1)}%`,
        `${h.name}, ${name}`,
      );
    }
    if (s.rest.length > 0) {
      add(
        `${s.sector}/others`,
        `${s.rest.length} others`,
        s.sector,
        s.others,
        color,
        `${s.rest.length} others`,
        `${name} stocks at ${THRESHOLD}% of the index or less`,
      );
    }
  }

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'sunburst',
        name: 'SPY',
        ids,
        labels,
        parents,
        values,
        text,
        customdata,
        branchvalues: 'total',
        sort: false,
        rotation: 90,
        textinfo: 'text',
        insidetextorientation: 'radial',
        insidetextfont: { color: '#ffffff' },
        // The root's label is "outside" text in Plotly's rules, even when it sits in the middle.
        outsidetextfont: { color: LOOK.title, size: 13 },
        marker: { colors, line: { color: LOOK.bg, width: 1 } },
        leaf: { opacity: 0.72 },
        hovertemplate:
          '<b>%{label}</b><br>%{customdata}<br>%{value:.2f}% of the S&P 500<extra></extra>',
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `S&P 500: eleven sectors and the ${named} stocks above ${THRESHOLD}% (${fmtDate(asOf)})`,
      },
      margin: { t: narrow ? 16 : 64, l: 10, r: 10, b: 10 },
      uniformtext: { minsize: 8, mode: 'hide' },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
