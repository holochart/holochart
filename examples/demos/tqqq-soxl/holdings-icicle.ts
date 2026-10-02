import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  FUNDS,
  type Fund,
  HOLDINGS,
  type HoldingKind,
  KIND_NAME,
  usd,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * What the two funds actually own, as opposed to the exposure they carry: an icicle of their net
 * assets, both funds under one root, then the asset class (stocks, Treasury bills, cash and money
 * market funds, other net assets), then the items (the largest stocks and the rest grouped, each
 * T-bill by maturity, each money market fund). Swaps and futures do not appear: they cost little
 * up front, so most of each fund's money sits in T-bills and cash as collateral while the swaps
 * supply two thirds of the exposure (compare the exposure sunburst). TQQQ's "other net assets" is
 * mostly what its swap banks owe it. An `icicle` with `ids`, `branchvalues: 'total'`, `sort: false`
 * to keep the classes in order, per-node `text` with the share of the fund's net assets, and
 * `uniformtext` hiding labels of nodes too thin for them.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: what the funds own',
  description:
    'Icicle of both funds’ net assets: stocks, T-bills, cash and money market funds, and other net assets, item by item.',
  tags: ['demo', 'icicle', 'hierarchical', 'uniformtext', 'hover', 'financial'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

/** Stocks shown one by one per fund; the rest are grouped. */
const TOP_STOCKS = 5;
type Owned = Extract<HoldingKind, 'stock' | 'tbill' | 'cash' | 'other'>;
const CLASSES: readonly Owned[] = ['stock', 'tbill', 'cash', 'other'];
/** Asset-class hues, apart from the two fund colors (stocks as in the exposure sunburst). */
const CLASS_COLOR: Readonly<Record<Owned, string>> = {
  stock: '#128b8b',
  tbill: '#b8267e',
  cash: '#997600',
  other: '#6b6f80',
};

/** `T-bill 2026-10-06` → `T-bill Oct 6`. */
function tbillLabel(name: string, maturity: string | undefined): string {
  if (maturity === undefined) return name;
  const d = new Date(`${maturity}T00:00:00Z`);
  return `T-bill ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const ids: string[] = [];
  const labels: string[] = [];
  const parents: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  const text: string[] = [];
  const customdata: [string, string][] = [];
  const add = (
    id: string,
    label: string,
    parent: string,
    value: number,
    color: string,
    fund?: Fund,
  ): void => {
    ids.push(id);
    labels.push(label);
    parents.push(parent);
    values.push(value);
    colors.push(color);
    const share = fund
      ? `${((value / HOLDINGS[fund].netAssets) * 100).toFixed(1)}% of ${fund} net assets`
      : 'both funds';
    text.push(
      fund && parent !== 'root' ? `${label}  ${share.split(' of ')[0]}` : `${label}  ${usd(value)}`,
    );
    customdata.push([usd(value), share]);
  };

  const total = FUNDS.reduce((a, f) => a + HOLDINGS[f].netAssets, 0);
  add('root', 'Net assets', '', total, LOOK.zero);
  for (const fund of FUNDS) {
    const { holdings, netAssets } = HOLDINGS[fund];
    add(fund, fund, 'root', netAssets, COLOR[fund], fund);
    const owned = (kind: Owned): typeof holdings =>
      holdings
        .filter((h) => h.kind === kind && (h.value ?? 0) !== 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const listed = CLASSES.filter((k) => k !== 'other').reduce(
      (a, k) => a + owned(k).reduce((s, h) => s + (h.value ?? 0), 0),
      0,
    );
    for (const kind of CLASSES) {
      const color = CLASS_COLOR[kind];
      const id = `${fund}/${kind}`;
      const items = owned(kind);
      // Other net assets: the fund's own line, else what is left of the net assets.
      const value =
        kind === 'other'
          ? items.length > 0
            ? items.reduce((a, h) => a + (h.value ?? 0), 0)
            : netAssets - listed
          : items.reduce((a, h) => a + (h.value ?? 0), 0);
      if (value <= 0) continue;
      add(id, KIND_NAME[kind], fund, value, color, fund);
      if (kind === 'other') continue;
      const shown = kind === 'stock' ? items.slice(0, TOP_STOCKS) : items;
      for (const h of shown) {
        const label =
          kind === 'stock'
            ? (h.ticker ?? h.name)
            : kind === 'tbill'
              ? tbillLabel(h.name, (h as { maturity?: string }).maturity)
              : h.name;
        add(`${id}/${h.ticker ?? h.name}`, label, id, h.value ?? 0, color, fund);
      }
      const rest = items.slice(shown.length);
      if (rest.length > 0) {
        const v = rest.reduce((a, h) => a + (h.value ?? 0), 0);
        add(`${id}/other`, `${rest.length} other stocks`, id, v, color, fund);
      }
    }
  }

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'icicle',
        ids,
        labels,
        parents,
        values,
        text,
        customdata,
        textinfo: 'text',
        branchvalues: 'total',
        sort: false,
        marker: { colors, line: { color: LOOK.bg, width: 1 } },
        leaf: { opacity: 0.8 },
        insidetextfont: { color: LOOK.title },
        outsidetextfont: { color: LOOK.title },
        hovertemplate: '%{label}<br>%{customdata[0]}, %{customdata[1]}<extra></extra>',
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `What the funds own: ${usd(total)} of net assets, by asset class and item`,
      },
      margin: { l: 10, r: 10, b: 10 },
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
