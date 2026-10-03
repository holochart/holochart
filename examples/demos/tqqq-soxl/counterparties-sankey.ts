import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, FUNDS, type Fund, HOLDINGS, INDEX } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Where the two funds' leverage comes from, in dollars: most of their index exposure is the
 * notional of total return swaps with a handful of banks, and the same banks deal with both funds.
 * The left column is the swap counterparties, sized by the notional they owe across both funds;
 * their links run to each fund's swap book, which joins the stocks the funds hold outright and
 * TQQQ's Nasdaq-100 futures in each fund's index exposure on the right. A sankey with
 * `node.align: 'right'` (so the stocks and futures sit beside the swap books rather than with the
 * banks), links tinted by fund, and `node.customdata` / `link.customdata` feeding the hover
 * templates with dollars and shares of net assets. Values are in billions of USD.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: swap counterparties and index exposure',
  description:
    'Sankey of both funds’ index exposure: swap notional per bank, stocks held and futures, in billions of dollars, with shares of net assets on hover.',
  tags: ['demo', 'sankey', 'flow', 'hierarchical', 'hover', 'financial'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

/** Gray for the banks and the instruments, so the fund hues mark the funds. */
const BANK = '#6b6f80';
const ASSET = '#8a8e9e';

/** `#rrggbb` → `rgba(r, g, b, a)`. */
function alpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const B = (v: number): string => `$${(v / 1e9).toFixed(1)}B`;
const share = (v: number, fund: Fund): string =>
  `${((v / HOLDINGS[fund].netAssets) * 100).toFixed(1)}% of ${fund} net assets`;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Swap notional per bank and fund.
  const swaps = new Map<string, Partial<Record<Fund, number>>>();
  for (const fund of FUNDS) {
    for (const h of HOLDINGS[fund].holdings) {
      if (h.kind !== 'swap') continue;
      const row = swaps.get(h.name) ?? {};
      row[fund] = (row[fund] ?? 0) + (h.exposure ?? 0);
      swaps.set(h.name, row);
    }
  }
  const totalOf = (row: Partial<Record<Fund, number>>): number => (row.TQQQ ?? 0) + (row.SOXL ?? 0);
  const banks = [...swaps.entries()].sort((a, b) => totalOf(b[1]) - totalOf(a[1]));
  const sumKind = (fund: Fund, kind: string): number =>
    HOLDINGS[fund].holdings
      .filter((h) => h.kind === kind)
      .reduce((a, h) => a + (h.exposure ?? 0), 0);

  const labels: string[] = [];
  const colors: string[] = [];
  const nodeHover: string[] = [];
  const node = (label: string, color: string, hover: string): number => {
    labels.push(label);
    colors.push(color);
    nodeHover.push(hover);
    return labels.length - 1;
  };

  const source: number[] = [];
  const target: number[] = [];
  const value: number[] = [];
  const linkColor: string[] = [];
  const linkHover: string[] = [];
  const link = (s: number, t: number, v: number, fund: Fund, hover: string): void => {
    source.push(s);
    target.push(t);
    value.push(v / 1e9);
    linkColor.push(alpha(COLOR[fund], 0.45));
    linkHover.push(hover);
  };

  // Right column: each fund's index exposure.
  const exposure = {} as Record<Fund, number>;
  for (const fund of FUNDS) {
    const total = ['stock', 'swap', 'future'].reduce((a, k) => a + sumKind(fund, k), 0);
    exposure[fund] = node(
      `${fund}: ${INDEX[fund]} ${B(total)}`,
      COLOR[fund],
      `${B(total)} of ${INDEX[fund]} exposure<br>` +
        `${(total / HOLDINGS[fund].netAssets).toFixed(2)}× net assets of ${B(HOLDINGS[fund].netAssets)}`,
    );
  }
  // Middle column: the swap books, the stocks and the futures.
  const book = {} as Record<Fund, number>;
  for (const fund of FUNDS) {
    const v = sumKind(fund, 'swap');
    book[fund] = node(
      `${fund} swaps ${B(v)}`,
      COLOR[fund],
      `${B(v)} swap notional<br>${share(v, fund)}`,
    );
  }
  const stockTotal = FUNDS.reduce((a, f) => a + sumKind(f, 'stock'), 0);
  const stocks = node(
    `Stocks held ${B(stockTotal)}`,
    ASSET,
    `${B(stockTotal)} of stocks held outright<br>` +
      FUNDS.map((f) => `${f} ${B(sumKind(f, 'stock'))} (${share(sumKind(f, 'stock'), f)})`).join(
        '<br>',
      ),
  );
  const futuresValue = sumKind('TQQQ', 'future');
  const futures = node(
    `Nasdaq-100 futures ${B(futuresValue)}`,
    ASSET,
    `${B(futuresValue)} of E-mini futures notional<br>${share(futuresValue, 'TQQQ')}`,
  );
  for (const fund of FUNDS) {
    const v = sumKind(fund, 'swap');
    link(book[fund], exposure[fund], v, fund, `${fund} swaps<br>${B(v)}, ${share(v, fund)}`);
    const s = sumKind(fund, 'stock');
    link(stocks, exposure[fund], s, fund, `${fund} stocks<br>${B(s)}, ${share(s, fund)}`);
  }
  link(
    futures,
    exposure.TQQQ,
    futuresValue,
    'TQQQ',
    `TQQQ futures<br>${B(futuresValue)}, ${share(futuresValue, 'TQQQ')}`,
  );
  // Left column: the banks.
  for (const [name, row] of banks) {
    const lines = FUNDS.filter((f) => row[f] !== undefined).map(
      (f) => `${f} ${B(row[f] as number)} (${share(row[f] as number, f)})`,
    );
    const b = node(
      `${name} ${B(totalOf(row))}`,
      BANK,
      `${B(totalOf(row))} swap notional<br>${lines.join('<br>')}`,
    );
    for (const fund of FUNDS) {
      const v = row[fund];
      if (v === undefined) continue;
      link(b, book[fund], v, fund, `${name} → ${fund}<br>${B(v)}, ${share(v, fund)}`);
    }
  }

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'sankey',
        valueformat: '$,.1f',
        valuesuffix: 'B',
        node: {
          label: labels,
          color: colors,
          align: 'right',
          pad: 10,
          thickness: 14,
          line: { width: 0 },
          customdata: nodeHover,
          hovertemplate: '%{customdata}<extra>%{label}</extra>',
        },
        link: {
          source,
          target,
          value,
          color: linkColor,
          customdata: linkHover,
          hovertemplate: '%{customdata}<extra></extra>',
        },
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Index exposure by source: swap banks, stocks and futures ($ billions)',
      },
      margin: { l: 16, r: 16, b: 16 },
      font: { color: LOOK.text },
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
