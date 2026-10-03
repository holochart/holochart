import { createChart, type BarTrace, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, FIRST_YEAR, LAST_YEAR, linreg, WARM, YEARLY, YEARS } from './analysis.mts';
import { mean } from './temperature.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The mean temperature of every complete year, drawn as a `bar` measured from the average of the
 * whole period (`base` = the average, so warmer years rise above it in orange and cooler years
 * hang below it in blue). Two `scatter` lines on top: the average of the ten years up to each
 * year, and the least-squares trend line, whose slope the annotation states in °F per decade.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: mean temperature of each year and the trend',
  description:
    'Yearly mean temperature since 1940 as bars above and below the long-run average, with a 10-year average and the linear trend.',
  tags: ['demo', 'bar', 'scatter', 'base', 'trend', 'annotations', 'climate'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const WINDOW = 10;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const temps = YEARLY.map((y) => y.meanTemp);
  const average = mean(temps);
  const fit = linreg(YEARS, temps);
  const trend = [FIRST_YEAR, LAST_YEAR].map((y) => fit.m * y + fit.b);
  const moving = temps
    .map((_, i) => (i < WINDOW - 1 ? null : mean(temps.slice(i - WINDOW + 1, i + 1))))
    .slice(WINDOW - 1);

  const bars = {
    type: 'bar',
    name: 'Mean of the year',
    x: YEARS,
    base: average,
    y: temps.map((t) => t - average),
    customdata: temps,
    marker: { color: temps.map((t) => (t >= average ? WARM : COLD)), opacity: 0.8 },
    showlegend: false,
    hovertemplate:
      '%{x}<br>Mean <b>%{customdata:.1f} °F</b> (%{y:+.1f} °F from average)<extra></extra>',
  } satisfies BarTrace;
  const movingLine = {
    type: 'scatter',
    mode: 'lines',
    name: `Average of the last ${WINDOW} years`,
    x: YEARS.slice(WINDOW - 1),
    y: moving,
    line: { color: LOOK.title, width: 2 },
    hovertemplate: `${WINDOW}-year average %{y:.1f} °F<extra></extra>`,
  } satisfies ScatterTrace;
  const trendLine = {
    type: 'scatter',
    mode: 'lines',
    name: 'Trend',
    x: [FIRST_YEAR, LAST_YEAR],
    y: trend,
    line: { color: LOOK.title, width: 1.25, dash: 'dash' },
    hoverinfo: 'skip',
  } satisfies ScatterTrace;

  const perDecade = fit.m * 10;
  const total = (trend[1] as number) - (trend[0] as number);

  const chart: Chart = createChart(chartEl, {
    data: [bars, movingLine, trendLine],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Mean temperature of each year, against the ${FIRST_YEAR} to ${LAST_YEAR} average of ${average.toFixed(1)} °F`,
      },
      hovermode: 'x',
      bargap: 0.15,
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { dtick: 10, range: [FIRST_YEAR - 1, LAST_YEAR + 1] },
      yaxis: { title: { text: 'Mean temperature (°F)' }, ticksuffix: '°', dtick: 1 },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.98,
          xanchor: 'left',
          yanchor: 'top',
          align: 'left',
          showarrow: false,
          font: { size: 12, color: LOOK.title },
          text:
            `Trend: <b>${perDecade >= 0 ? '+' : '−'}${Math.abs(perDecade).toFixed(2)} °F per decade</b><br>` +
            `about ${Math.abs(total).toFixed(1)} °F ${total >= 0 ? 'warmer' : 'cooler'} over ${LAST_YEAR - FIRST_YEAR + 1} years`,
        },
      ],
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
