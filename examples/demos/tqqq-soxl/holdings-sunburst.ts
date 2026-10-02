import {
  createChart,
  type Chart,
  type LayoutAnnotation,
  type SunburstTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  FUNDS,
  type Fund,
  fmtDate,
  HOLDINGS,
  type HoldingKind,
  INDEX,
  KIND_NAME,
  usd,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * What each fund's index exposure is made of, from its holdings file: one sunburst per fund
 * (side by side through `domain.x`), the fund in the middle, then the kind of instrument (stocks
 * held outright, total return swaps, index futures), then the items: each swap counterparty, the
 * futures contract and the largest stocks (the rest of the stocks in one "other" sector). Sectors
 * are sized by exposure (swap and futures notional, stock market value) with
 * `branchvalues: 'total'`, unique `ids` per fund, `text` labels with each sector's share of the
 * fund's exposure (hidden where they do not fit, `uniformtext`), and hover templates fed by `customdata` with dollars and the share of net
 * assets. The two centers carry the leverage: exposure ÷ net assets ≈ 3.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: what the exposure is made of',
  description:
    'Two sunbursts, one per fund: index exposure by instrument (stocks, swaps per bank, futures) from the holdings files.',
  tags: ['demo', 'sunburst', 'hierarchical', 'domain', 'uniformtext', 'hover', 'annotations'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

/** Stocks shown one by one; the rest are grouped. */
const TOP_STOCKS = 8;
/** Instrument kinds, in hues apart from the two fund colors. */
const KIND_COLOR: Partial<Record<HoldingKind, string>> = {
  swap: '#9962c0',
  stock: '#128b8b',
  future: '#997600',
};

interface Tree {
  ids: string[];
  labels: string[];
  parents: string[];
  values: number[];
  colors: string[];
  customdata: [string, string][];
  text: string[];
}

function tree(fund: Fund): Tree {
  const { holdings, netAssets } = HOLDINGS[fund];
  const t: Tree = {
    ids: [],
    labels: [],
    parents: [],
    values: [],
    colors: [],
    customdata: [],
    text: [],
  };
  let total = 0;
  const add = (id: string, label: string, parent: string, value: number, color: string): void => {
    t.ids.push(id);
    t.labels.push(label);
    t.parents.push(parent);
    t.values.push(value);
    t.colors.push(color);
    t.customdata.push([usd(value), `${((value / netAssets) * 100).toFixed(1)}%`]);
    t.text.push(
      parent === ''
        ? `${fund}<br>${(value / netAssets).toFixed(2)}× net assets`
        : `${label}<br>${Math.round((value / total) * 100)}%`,
    );
  };
  const exposed = holdings.filter((h) => (h.exposure ?? 0) > 0);
  total = exposed.reduce((a, h) => a + (h.exposure ?? 0), 0);
  add(fund, fund, '', total, COLOR[fund]);
  for (const kind of ['swap', 'stock', 'future'] as const) {
    const items = exposed
      .filter((h) => h.kind === kind)
      .sort((a, b) => (b.exposure ?? 0) - (a.exposure ?? 0));
    if (items.length === 0) continue;
    const color = KIND_COLOR[kind] as string;
    const kindId = `${fund}/${kind}`;
    const name = KIND_NAME[kind];
    add(
      kindId,
      name,
      fund,
      items.reduce((a, h) => a + (h.exposure ?? 0), 0),
      color,
    );
    const shown = kind === 'stock' ? items.slice(0, TOP_STOCKS) : items;
    for (const h of shown) {
      const label = kind === 'stock' ? (h.ticker ?? h.name) : kind === 'future' ? 'E-mini' : h.name;
      add(`${kindId}/${h.ticker ?? h.name}`, label, kindId, h.exposure ?? 0, color);
    }
    const rest = items.slice(shown.length);
    if (rest.length > 0) {
      const v = rest.reduce((a, h) => a + (h.exposure ?? 0), 0);
      add(`${kindId}/other`, `${rest.length} other`, kindId, v, color);
    }
  }
  return t;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const data = FUNDS.map((fund, k): SunburstTrace => {
    const t = tree(fund);
    return {
      type: 'sunburst',
      name: fund,
      ids: t.ids,
      labels: t.labels,
      parents: t.parents,
      values: t.values,
      customdata: t.customdata,
      branchvalues: 'total',
      sort: false,
      domain: { x: k === 0 ? [0, 0.48] : [0.52, 1], y: [0, 0.92] },
      marker: { colors: t.colors, line: { color: LOOK.bg, width: 1 } },
      leaf: { opacity: 0.8 },
      insidetextorientation: 'horizontal',
      text: t.text,
      textinfo: 'text',
      // The root's label is "outside" text in Plotly's rules (`outsidetextfont`), even when colored.
      insidetextfont: { color: LOOK.title },
      outsidetextfont: { color: LOOK.title, size: 13 },
      hovertemplate:
        `%{label}<br>%{customdata[0]} of ${INDEX[fund]} exposure<br>` +
        `%{percentRoot:.1%} of the fund's exposure, %{customdata[1]} of net assets<extra>${fund}</extra>`,
    };
  });

  const caption = (fund: Fund, x: number): LayoutAnnotation => ({
    xref: 'paper',
    yref: 'paper',
    x,
    y: 1,
    xanchor: 'center',
    yanchor: 'top',
    showarrow: false,
    text:
      `${fund}: ${usd(HOLDINGS[fund].netAssets)} of net assets, ` +
      `holdings as of ${fmtDate(HOLDINGS[fund].asOf)}`,
    font: { size: 11, color: LOOK.text },
  });

  const chart: Chart = createChart(chartEl, {
    data,
    layout: {
      title: { text: narrow ? '' : 'Index exposure by instrument: swaps, stocks and futures' },
      margin: { l: 10, r: 10, b: 10 },
      // Hide the labels of sectors too thin for 8 px text (the smaller stocks).
      uniformtext: { minsize: 8, mode: 'hide' },
      annotations: [caption('TQQQ', 0.24), caption('SOXL', 0.76)],
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
