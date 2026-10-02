import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  type Fund,
  fmtDate,
  HOLDINGS,
  INDEX,
  type Holding,
  UNDERLYING,
  usd,
} from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How a 3× fund turns $100 of net assets into about $300 of index exposure, from its holdings
 * file: the stocks it owns outright, then the notional of its total return swap with each bank,
 * then (TQQQ only) its Nasdaq-100 E-mini futures, adding up to the total exposure bar. Everything
 * is scaled to $100 of net assets. A waterfall (`measure: 'relative'` steps and a `'total'` bar)
 * with a bracket (a shape and an annotation below the category labels) grouping the swap
 * counterparties; a dotted line marks the $100 the fund actually holds. The toolbar toggle swaps the fund with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: how $100 becomes $300 of exposure',
  description:
    'Waterfall from the fund holdings: stocks, swap notional per bank and futures add up to about three times the net assets.',
  tags: ['demo', 'waterfall', 'financial', 'category', 'shapes', 'annotations', 'react'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** Short bank names for the axis. */
const SHORT: Readonly<Record<string, string>> = {
  'BofA Merrill Lynch': 'BofA',
  'Societe Generale': 'SocGen',
  'Goldman Sachs': 'Goldman',
  'Morgan Stanley': 'Morgan St.',
  'BNP Paribas': 'BNP',
};

interface Step {
  group: string;
  label: string;
  /** Full name for the hover label. */
  name: string;
  exposure: number;
}

function steps(fund: Fund): Step[] {
  const hs = HOLDINGS[fund].holdings;
  const sum = (kind: Holding['kind']): number =>
    hs.filter((h) => h.kind === kind).reduce((a, h) => a + (h.exposure ?? 0), 0);
  const stocks = hs.filter((h) => h.kind === 'stock');
  const out: Step[] = [
    {
      group: 'stock',
      label: `Stocks (${stocks.length})`,
      name: `${stocks.length} stocks held outright`,
      exposure: sum('stock'),
    },
  ];
  const swaps = hs
    .filter((h) => h.kind === 'swap')
    .sort((a, b) => (b.exposure ?? 0) - (a.exposure ?? 0));
  for (const s of swaps) {
    out.push({
      group: 'swap',
      label: SHORT[s.name] ?? s.name,
      name: `Swap with ${s.name}`,
      exposure: s.exposure ?? 0,
    });
  }
  for (const f of hs.filter((h) => h.kind === 'future')) {
    out.push({ group: 'future', label: 'E-mini futures', name: f.name, exposure: f.exposure ?? 0 });
  }
  return out;
}

function figure(fund: Fund, narrow: boolean): FigureInput {
  const { netAssets, asOf } = HOLDINGS[fund];
  const s = steps(fund);
  const total = s.reduce((a, x) => a + x.exposure, 0);
  const per100 = (v: number): number => (v / netAssets) * 100;
  const swapFrom = s.findIndex((x) => x.group === 'swap');
  const swapTo = s.findLastIndex((x) => x.group === 'swap');
  const y = [...s.map((x) => per100(x.exposure)), null];
  const custom = [
    ...s.map((x) => [x.name, usd(x.exposure)]),
    [`${INDEX[fund]} exposure`, usd(total)],
  ];

  return {
    data: [
      {
        type: 'waterfall',
        name: fund,
        x: [...s.map((x) => x.label), 'Total exposure'],
        y,
        measure: [...s.map(() => 'relative'), 'total'],
        text: [
          ...s.map((x) => `$${per100(x.exposure).toFixed(1)}`),
          `$${per100(total).toFixed(0)}`,
        ],
        textinfo: 'text',
        textposition: 'outside',
        customdata: custom,
        hovertemplate:
          '%{customdata[0]}<br>%{customdata[1]} of exposure<br>' +
          `$%{y:.1f} per $100 of net assets<extra>${fund}</extra>`,
        increasing: { marker: { color: COLOR[fund] } },
        totals: { marker: { color: COLOR[UNDERLYING[fund]] } },
        connector: { line: { color: LOOK.zero, width: 1 } },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${fund}: ${usd(netAssets)} of net assets, ${usd(total)} of ${INDEX[fund]} exposure (${fmtDate(asOf)})`,
      },
      showlegend: false,
      waterfallgap: 0.25,
      margin: { b: 64 },
      xaxis: { type: 'category', tickfont: { size: 10 } },
      yaxis: {
        title: { text: 'Exposure per $100 of net assets' },
        tickprefix: '$',
        range: [0, 340],
        dtick: 50,
      },
      shapes: [
        // A bracket under the swap counterparties' tick labels.
        {
          type: 'line',
          xref: 'x',
          x0: swapFrom - 0.4,
          x1: swapTo + 0.4,
          yref: 'paper',
          y0: -0.11,
          y1: -0.11,
          line: { color: LOOK.zero, width: 1 },
        },
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          yref: 'y',
          y0: 100,
          y1: 100,
          layer: 'below',
          line: { color: LOOK.text, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        {
          xref: 'x',
          x: (swapFrom + swapTo) / 2,
          yref: 'paper',
          y: -0.11,
          yanchor: 'top',
          text: `Total return swaps with ${swapTo - swapFrom + 1} banks (notional)`,
          showarrow: false,
          font: { size: 10, color: LOOK.text },
        },
        {
          xref: 'paper',
          x: 0,
          xanchor: 'left',
          yref: 'y',
          y: 100,
          yanchor: 'bottom',
          text: '$100 of net assets',
          showarrow: false,
          font: { size: 10, color: LOOK.text },
        },
      ],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('TQQQ', narrow));
  fundPicker(toolbar, (fund) => void chart.react(figure(fund, narrow)), 'TQQQ');

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
