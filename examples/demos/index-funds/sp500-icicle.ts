import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate, type Holding, HOLDINGS } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How much of the S&P 500 its largest companies are: an `icicle` of SPY's holdings by size tier.
 * The index on the left, then four tiers (the ten largest stocks, the next 40, the next 150 and
 * everything after the 200th), then the stocks, each as tall as its weight. The ten largest and
 * the next 40 are drawn one by one; the stocks of the two lower tiers would be hairlines, so each
 * of those tiers is one block with its average weight. A tier's block says how much of the index
 * it is and how much the stocks down to it make up together; the first also lists its ten
 * members, since only the largest rows are tall enough for a label. `branchvalues: 'total'`,
 * `sort: false` to keep tiers and stocks in order of size, per-node `text`, `uniformtext` hiding
 * labels of rows too thin for 8 px text, and the company names in the hover text (`customdata`).
 */
export const meta: ExampleMeta = {
  title: 'Index funds: the S&P 500 by size tier',
  description:
    'Icicle of the S&P 500 by size tier: the ten largest stocks, the next 40, the next 150 and the rest, each stock as tall as its weight.',
  tags: ['demo', 'icicle', 'hierarchical', 'branchvalues', 'uniformtext', 'hover', 'financial'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

interface Tier {
  name: string;
  /** Ranks `from` (inclusive, 0-based) to `to` (exclusive). */
  from: number;
  to: number;
  /** Stocks drawn one by one; the rest of the tier is one block. */
  shown: number;
  color: string;
}

const ROOT = 'S&P 500';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const { holdings, asOf } = HOLDINGS.SPY;
  const tiers: Tier[] = [
    { name: 'Top 10', from: 0, to: 10, shown: 10, color: '#5e74d5' },
    { name: 'Next 40', from: 10, to: 50, shown: 40, color: '#9962c0' },
    { name: 'Next 150', from: 50, to: 200, shown: 0, color: '#128b8b' },
    {
      name: `The other ${holdings.length - 200}`,
      from: 200,
      to: holdings.length,
      shown: 0,
      color: '#70758a',
    },
  ];

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
  const sum = (list: readonly Holding[]): number => list.reduce((a, h) => a + h.weight, 0);
  const range = (list: readonly Holding[]): string =>
    `${(list.at(-1)?.weight ?? 0).toFixed(2)}% to ${(list[0]?.weight ?? 0).toFixed(2)}% each`;

  const built = tiers.map((tier) => {
    const members = holdings.slice(tier.from, tier.to);
    const shown = members.slice(0, tier.shown);
    const rest = members.slice(tier.shown);
    const others = sum(rest);
    // The tier's total is the sum of the blocks under it, in their order.
    return { tier, members, shown, rest, others, weight: sum(shown) + others };
  });
  const total = built.reduce((a, b) => a + b.weight, 0);
  /** `'NVDA 8.5%'`, a few to a line. */
  const roster = (list: readonly Holding[], perLine: number): string =>
    list
      .map((h) => `${h.ticker} ${h.weight.toFixed(1)}%`)
      .reduce<string[][]>((lines, item, i) => {
        if (i % perLine === 0) lines.push([]);
        lines.at(-1)?.push(item);
        return lines;
      }, [])
      .map((line) => line.join(' · '))
      .join('<br>');

  add(ROOT, ROOT, '', total, LOOK.axis, `<b>${ROOT}</b><br>${holdings.length} stocks`, 'the index');
  let cumulative = 0;
  for (const { tier, members, shown, rest, others, weight } of built) {
    cumulative += weight;
    // What the tier's block says under its name: its members (the first tier), else how much of
    // the index the stocks down to this tier make up together.
    const detail =
      tier.from === 0
        ? roster(members, narrow ? 2 : 3)
        : tier.to < holdings.length
          ? `the ${tier.to} largest together: ${cumulative.toFixed(1)}%`
          : `each ${(members[0]?.weight ?? 0).toFixed(2)}% of the index or less`;
    add(
      tier.name,
      tier.name,
      ROOT,
      weight,
      tier.color,
      `<b>${tier.name}</b>  ${weight.toFixed(1)}% of the index<br>${detail}`,
      `${members.length} stocks, ${range(members)}`,
    );
    for (const h of shown) {
      add(
        `${tier.name}/${h.ticker}`,
        h.ticker,
        tier.name,
        h.weight,
        tier.color,
        `${h.ticker}  ${h.name}  ${h.weight.toFixed(1)}%`,
        h.name,
      );
    }
    if (rest.length > 0) {
      const label = shown.length > 0 ? `${rest.length} others` : `${rest.length} stocks`;
      add(
        `${tier.name}/others`,
        label,
        tier.name,
        others,
        tier.color,
        `${label}, ${(others / rest.length).toFixed(2)}% each on average`,
        range(rest),
      );
    }
  }

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'icicle',
        name: 'SPY',
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
        leaf: { opacity: 0.78 },
        insidetextfont: { color: '#ffffff' },
        outsidetextfont: { color: LOOK.title },
        hovertemplate:
          '<b>%{label}</b><br>%{customdata}<br>%{value:.2f}% of the S&P 500<extra></extra>',
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `How much of the S&P 500 its largest companies are (SPY holdings, ${fmtDate(asOf)})`,
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
