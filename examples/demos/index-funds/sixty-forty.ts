import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BASE, BASE_DATE, COLOR, fmtDate, growth, share, SPLIT, usd } from './analysis.mts';
import {
  chartConfig,
  frame,
  halfLabels,
  halfShapes,
  isNarrow,
  LOOK,
  rgba,
  settled,
} from './ui.mts';

/**
 * A 60/40 portfolio that is never rebalanced: $10,000 on Sep 30, 2022, $6,000 in the S&P 500 (SPY)
 * and $4,000 in US bonds (BND), left alone for the four years. The two sleeves are stacked areas
 * (`stackgroup`, bonds below, stocks on top), so the top edge is the portfolio's value; a light
 * line shows the same $10,000 all in SPY. Because the stocks grew and the bonds barely did, the
 * portfolio drifted away from 60/40: the stock share at the start, at the split and at the end is
 * annotated, and every day's share is in the hover text (`customdata`). The halves are marked
 * with `halfShapes`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: a 60/40 portfolio left alone',
  description:
    'Stacked area of $6,000 in SPY and $4,000 in BND from September 30, 2022, never rebalanced, against $10,000 all in SPY.',
  tags: ['demo', 'area', 'stackgroup', 'line', 'date', 'shapes', 'annotations', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const START = 10_000;
const STOCK_SHARE = 0.6;
/** As in the asset-class chart. */
const BOND_COLOR = '#b8267e';
const ALL_STOCK_COLOR = '#c8cbd6';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const stocks = growth('SPY', 'all', START * STOCK_SHARE);
  const bonds = growth('BND', 'all', START * (1 - STOCK_SHARE));
  const allStock = growth('SPY', 'all', START);
  const dates = stocks.dates;
  const total = stocks.value.map((v, i) => v + (bonds.value[i] as number));
  const stockShare = stocks.value.map((v, i) => v / (total[i] as number));

  const area = (
    name: string,
    y: number[],
    color: string,
    hover: string,
    customdata: unknown[],
  ): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x: dates,
    y,
    customdata,
    stackgroup: 'portfolio',
    line: { color, width: 1.25 },
    fillcolor: rgba(color, 0.45),
    hovertemplate: hover,
  });
  const traces: ScatterTrace[] = [
    area(
      'Bonds (BND), $4,000 at the start',
      bonds.value,
      BOND_COLOR,
      'Bonds  %{y:$,.0f}<extra></extra>',
      total,
    ),
    area(
      'Stocks (SPY), $6,000 at the start',
      stocks.value,
      COLOR.SPY,
      'Stocks  %{y:$,.0f} (%{customdata[0]:.0%} of %{customdata[1]:$,.0f})<extra></extra>',
      stockShare.map((s, i) => [s, total[i]]),
    ),
    {
      type: 'scatter',
      mode: 'lines',
      name: '$10,000 all in stocks (SPY)',
      x: dates,
      y: allStock.value,
      line: { color: ALL_STOCK_COLOR, width: 1.5 },
      hovertemplate: 'All in stocks  %{y:$,.0f}<extra></extra>',
    },
  ];

  const last = dates.length - 1;
  const split = SPLIT - BASE;
  const endLabel = (y: number, text: string, color: string): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y',
    x: dates[last] as string,
    y,
    text,
    showarrow: false,
    xanchor: 'left',
    align: 'left',
    xshift: 4,
    font: { color, size: narrow ? 9 : 10 },
  });
  /** The stock share on a day, pointing at the boundary between the two sleeves. */
  const shareNote = (i: number, ax: number, ay: number): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y',
    x: dates[i] as string,
    y: bonds.value[i] as number,
    text: `${share(stockShare[i] as number)} stocks`,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: LOOK.text,
    ax,
    ay,
    font: { color: LOOK.title, size: 10 },
  });
  const bondEnd = bonds.value[last] as number;
  const stockEnd = stocks.value[last] as number;
  const annotations: LayoutAnnotation[] = [
    ...halfLabels(),
    endLabel(
      allStock.value[last] as number,
      narrow
        ? usd(allStock.value[last] as number)
        : `All in stocks ${usd(allStock.value[last] as number)}`,
      ALL_STOCK_COLOR,
    ),
    endLabel(
      total[last] as number,
      narrow ? usd(total[last] as number) : `60/40 left alone ${usd(total[last] as number)}`,
      LOOK.title,
    ),
    endLabel(
      bondEnd + stockEnd / 2,
      narrow ? share(stockShare[last] as number) : `Stocks ${usd(stockEnd)}`,
      COLOR.SPY,
    ),
    endLabel(bondEnd / 2, narrow ? usd(bondEnd) : `Bonds ${usd(bondEnd)}`, BOND_COLOR),
    shareNote(0, 44, -36),
    // On a phone the split's note would run into the last one.
    ...(narrow ? [] : [shareNote(split, 44, -36)]),
    shareNote(last, -44, -36),
  ];

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `$10,000 split 60/40 between stocks and bonds on ${fmtDate(BASE_DATE)} and never rebalanced`,
      },
      hovermode: 'x unified',
      margin: { r: narrow ? 56 : 150 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Value (USD)' },
        tickprefix: '$',
        tickformat: ',.0f',
        rangemode: 'tozero',
      },
      shapes: halfShapes(),
      annotations,
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
