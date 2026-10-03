import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, type Fund, fmtDate, HOLDINGS, usd } from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The stocks each fund owns outright, as tiles sized by market value: TQQQ holds all of the
 * Nasdaq-100 (about a third of its net assets), SOXL the 30 stocks of its semiconductor index
 * (about two thirds); swaps and futures make up the rest of the 3× exposure. Tiles are colored
 * by the stock's weight in the fund (market value ÷ net assets) through a sequential colorscale in
 * the fund's hue (`marker.colors` numbers, `marker.colorscale`, a colorbar), and labeled with the
 * ticker and that weight through `text`; tiles too small for 8 px text hide their labels
 * (`uniformtext`). The toolbar toggle switches funds with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: the stocks each fund holds',
  description:
    'Treemap of the stocks each fund holds outright, sized by market value and colored by weight in the fund.',
  tags: ['demo', 'treemap', 'hierarchical', 'colorscale', 'colorbar', 'uniformtext', 'react'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

/** Dark → fund hue → light, readable on the dark background at both ends. */
const SCALE: Readonly<Record<Fund, [number, string][]>> = {
  TQQQ: [
    [0, '#1d2347'],
    [0.55, COLOR.TQQQ],
    [1, '#d3daf7'],
  ],
  SOXL: [
    [0, '#3a1a08'],
    [0.55, COLOR.SOXL],
    [1, '#f6cfb3'],
  ],
};

function figure(fund: Fund, narrow: boolean): FigureInput {
  const { holdings, netAssets, asOf } = HOLDINGS[fund];
  const stocks = holdings
    .filter((h) => h.kind === 'stock')
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = stocks.reduce((a, h) => a + (h.value ?? 0), 0);
  const weight = (v: number): number => (v / netAssets) * 100;
  const root = `${fund}: ${stocks.length} stocks, ${usd(total)} (${weight(total).toFixed(1)}% of net assets)`;
  const maxWeight = weight(stocks[0]?.value ?? 0);

  return {
    data: [
      {
        type: 'treemap',
        name: fund,
        ids: ['root', ...stocks.map((h) => h.ticker ?? h.name)],
        labels: [root, ...stocks.map((h) => h.ticker ?? h.name)],
        parents: ['', ...stocks.map(() => 'root')],
        values: [total, ...stocks.map((h) => h.value ?? 0)],
        branchvalues: 'total',
        text: [
          '',
          ...stocks.map((h) => `${h.ticker ?? h.name}<br>${weight(h.value ?? 0).toFixed(2)}%`),
        ],
        textinfo: 'text',
        customdata: [
          [root, usd(total), weight(total)],
          ...stocks.map((h) => [h.name, usd(h.value ?? 0), weight(h.value ?? 0)]),
        ],
        hovertemplate:
          '%{customdata[0]}<br>%{customdata[1]} held, %{customdata[2]:.2f}% of net assets<br>' +
          `%{percentRoot:.1%} of the fund's stocks<extra>${fund}</extra>`,
        marker: {
          colors: [maxWeight / 2, ...stocks.map((h) => weight(h.value ?? 0))],
          colorscale: SCALE[fund],
          cmin: 0,
          cmax: Math.ceil(maxWeight),
          showscale: true,
          colorbar: {
            title: { text: '% of net assets', side: 'right' },
            ticksuffix: '%',
            thickness: 12,
          },
          line: { color: LOOK.bg, width: 1 },
          pad: { t: 22, l: 2, r: 2, b: 2 },
        },
        tiling: { pad: 1 },
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : `Stocks held outright, by market value (${fmtDate(asOf)})`,
      },
      margin: { l: 10, r: 10, b: 10 },
      uniformtext: { minsize: 8, mode: 'hide' },
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
