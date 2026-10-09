import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { cagr, FUNDS, HALVES, LABEL, pct, PERIODS, totalReturn } from './analysis.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * The two halves side by side: total return of each of the five main index funds from the close of
 * Sep 30, 2022 to Sep 30, 2024 (teal) and from there to Sep 30, 2026 (amber), as grouped bars
 * (`barmode: 'group'`) with the value printed over every bar (`text` with
 * `textposition: 'outside'`, in the bar's color). The category axis shows the ticker over what it
 * tracks (`ticktext` with a line break). A toolbar toggle switches between the two-year total and
 * the return per year (the compound annual rate) with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: returns of the two halves',
  description:
    'Total return of SPY, QQQ, DIA, IWM and VTI in October 2022 – September 2024 and in October 2024 – September 2026 as grouped bars, with a total / per year toggle.',
  tags: ['demo', 'bar', 'grouped', 'text', 'category', 'ticktext', 'react', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

type Mode = 'total' | 'year';

function figure(mode: Mode, narrow: boolean): FigureInput {
  const value = mode === 'total' ? totalReturn : cagr;
  const digits = mode === 'total' ? 0 : 1;
  const top = Math.max(...FUNDS.flatMap((t) => HALVES.map((h) => value(t, h))));
  const what = mode === 'total' ? 'Total return' : 'Return per year';
  return {
    data: HALVES.map((half) => {
      const y = FUNDS.map((t) => value(t, half));
      return {
        type: 'bar',
        name: narrow ? PERIODS[half].short : `${PERIODS[half].short}  (${PERIODS[half].label})`,
        x: [...FUNDS],
        y,
        text: y.map((v) => pct(v, digits)),
        textposition: 'outside',
        cliponaxis: false,
        textfont: { size: narrow ? 9 : 11, color: PERIODS[half].color },
        marker: { color: PERIODS[half].color, line: { width: 0 } },
        customdata: FUNDS.map((t) => [
          LABEL[t],
          pct(totalReturn(t, half), 1),
          pct(cagr(t, half), 1),
        ]),
        hovertemplate:
          `<b>%{x}</b> · %{customdata[0]}<br>${PERIODS[half].label}<br>` +
          `%{customdata[1]} in total, %{customdata[2]} a year<extra></extra>`,
      };
    }),
    layout: {
      title: {
        text: narrow ? '' : `${what} of the five index funds in each half, dividends reinvested`,
      },
      barmode: 'group',
      bargap: 0.28,
      bargroupgap: 0.06,
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { b: 52 },
      xaxis: {
        type: 'category',
        showgrid: false,
        tickvals: [...FUNDS],
        ticktext: FUNDS.map((t) => `<b>${t}</b><br>${LABEL[t]}`),
      },
      yaxis: {
        title: { text: mode === 'total' ? 'Total return over two years' : 'Return per year' },
        tickformat: '.0%',
        range: [0, top * 1.14],
        zeroline: true,
      },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('total', narrow));

  segmented<Mode>(
    toolbar,
    'Return',
    [
      { value: 'total', text: 'Total' },
      { value: 'year', text: 'Per year' },
    ],
    (mode) => void chart.react(figure(mode, narrow)),
    'total',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
