import { createChart, type Chart, type HeatmapTrace, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { corrMatrix, DOWN, LABEL, PERIODS, type Half, type Ticker } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, periodPicker, settled } from './ui.mts';

/**
 * How the asset classes move together: the correlation matrix of daily returns of five US stock
 * funds (SPY, QQQ, DIA, IWM, RSP), international stocks (VXUS), bonds (BND, TLT) and gold (GLD) as
 * an annotated `heatmap` on category axes. Every cell prints its value (`texttemplate`), drawn
 * light or dark, whichever contrasts with the cell; the diverging colorscale runs from −1 to 1 and
 * is centered on 0 (`zmin`, `zmax`, `zmid`), so a cell near the background color is a pair that
 * moves independently. Thin lines (`shapes`) separate US stocks, international stocks, bonds and
 * gold. The period picker swaps the matrix with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: correlation of stocks, bonds and gold',
  description:
    'Annotated heatmap of the correlations of daily returns among nine stock, bond and gold ETFs, with a picker for the half.',
  tags: [
    'demo',
    'heatmap',
    'texttemplate',
    'category',
    'colorscale',
    'colorbar',
    'shapes',
    'react',
    'financial',
  ],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

const TICKERS: readonly Ticker[] = ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP', 'VXUS', 'BND', 'TLT', 'GLD'];
/** Category positions between the groups: US stocks | international | bonds | gold. */
const BREAKS = [4.5, 5.5, 7.5];
/** Red (moving opposite) → the plot background (unrelated) → blue (moving together). */
const SCALE: [number, string][] = [
  [0, DOWN],
  [0.5, '#14141c'],
  [1, '#5e74d5'],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const names = TICKERS.map((a) => TICKERS.map((b) => `${a} (${LABEL[a]}) and ${b} (${LABEL[b]})`));

  const edge = TICKERS.length - 0.5;
  const rule = (x0: number, x1: number, y0: number, y1: number): LayoutShape => ({
    type: 'line',
    xref: 'x',
    yref: 'y',
    x0,
    x1,
    y0,
    y1,
    line: { color: LOOK.title, width: 1 },
  });
  const shapes = BREAKS.flatMap((b) => [rule(b, b, -0.5, edge), rule(-0.5, edge, b, b)]);

  function figure(half: Half): { data: HeatmapTrace[]; layout: Record<string, unknown> } {
    return {
      data: [
        {
          type: 'heatmap',
          x: [...TICKERS],
          y: [...TICKERS],
          z: corrMatrix(TICKERS, half),
          customdata: names,
          zmin: -1,
          zmax: 1,
          zmid: 0,
          colorscale: SCALE,
          texttemplate: '%{z:.2f}',
          textfont: { size: narrow ? 8 : 11 },
          xgap: 1,
          ygap: 1,
          colorbar: {
            title: { text: 'Correlation' },
            thickness: 10,
            len: 0.8,
            dtick: 0.5,
            tickformat: '+.1f',
          },
          hovertemplate: `%{customdata}<br>${PERIODS[half].label}: <b>%{z:.2f}</b><extra></extra>`,
        },
      ],
      layout: {
        title: {
          text: narrow ? '' : `Correlation of daily returns, ${PERIODS[half].label}`,
        },
        hovermode: 'closest',
        margin: { l: 56, b: 48 },
        xaxis: { type: 'category', side: 'bottom', showgrid: false, tickangle: 0 },
        yaxis: { type: 'category', autorange: 'reversed', showgrid: false },
        shapes,
      },
    };
  }

  const chart: Chart = createChart(chartEl, { ...figure('first'), config: chartConfig(narrow) });
  periodPicker(toolbar, (half) => {
    void chart.react({ ...figure(half), config: chartConfig(narrow) });
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
