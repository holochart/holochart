import { createChart, type Chart, type HeatmapTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { FIRST_YEAR, LAST_YEAR, TEMP_SCALE, YEARLY, YEARS } from './analysis.mts';
import { mean } from './temperature.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Warming stripes: a `heatmap` with a single row, one vertical stripe per complete year, colored
 * by the year's mean temperature. The diverging `TEMP_SCALE` is centered on the average of the
 * whole period (`zmid`), so blue years were cooler than the long-run average and red years
 * warmer. No y ticks; hover gives the year and its mean. The blue end sits on the left and the
 * red end on the right.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: warming stripes',
  description:
    'One stripe per year since 1940, colored by the mean temperature of the year against the long-run average.',
  tags: ['demo', 'heatmap', 'colorscale', 'zmid', 'colorbar', 'climate'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const temps = YEARLY.map((y) => y.meanTemp);
  const average = mean(temps);
  const spread = Math.max(...temps.map((t) => Math.abs(t - average)));
  const coolest = YEARLY.reduce((a, b) => (b.meanTemp < a.meanTemp ? b : a));
  const warmest = YEARLY.reduce((a, b) => (b.meanTemp > a.meanTemp ? b : a));

  const stripes = {
    type: 'heatmap',
    x: YEARS,
    y: [0],
    z: [temps],
    customdata: [temps.map((t) => t - average)],
    colorscale: TEMP_SCALE,
    zmid: average,
    zmin: average - spread,
    zmax: average + spread,
    colorbar: {
      title: { text: 'Mean of<br>the year' },
      ticksuffix: ' °F',
      thickness: 12,
      len: 0.9,
    },
    hovertemplate:
      '%{x}<br>Mean <b>%{z:.1f} °F</b>, %{customdata:+.1f} °F from average<extra></extra>',
  } satisfies HeatmapTrace;

  const chart: Chart = createChart(chartEl, {
    data: [stripes],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Each stripe is a year, ${FIRST_YEAR} to ${LAST_YEAR}: blue cooler, red warmer than the ${average.toFixed(1)} °F average`,
      },
      margin: { t: narrow ? 16 : 48, l: 24, r: narrow ? 64 : 84, b: 64 },
      xaxis: { showgrid: false, dtick: 10, fixedrange: true },
      yaxis: { showticklabels: false, showgrid: false, ticks: '', fixedrange: true },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0,
          y: -0.12,
          xanchor: 'left',
          yanchor: 'top',
          showarrow: false,
          font: { size: 11, color: LOOK.text },
          text:
            `Coolest year: ${coolest.year} (${coolest.meanTemp.toFixed(1)} °F). ` +
            `Warmest: ${warmest.year} (${warmest.meanTemp.toFixed(1)} °F).`,
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
