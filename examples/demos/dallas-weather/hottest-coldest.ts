import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, FIRST_YEAR, fmtDate, HOT, LAST_YEAR, YEARLY } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The extremes of every complete year as a dumbbell chart: a red dot at the hottest high and a
 * blue dot at the coldest low (`scatter` markers), joined by a thin vertical line (one `scatter`
 * line trace with a `null` between the years, so it draws 86 separate segments). The all-time
 * record high and low are labelled with their dates. The hottest day of a year is always within
 * a few degrees of 105 °F; the coldest night varies far more.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: hottest and coldest reading of each year',
  description:
    'Dumbbell chart of the hottest high and the coldest low of each year since 1940, with the all-time records labelled.',
  tags: ['demo', 'scatter', 'markers', 'lines', 'dumbbell', 'annotations', 'climate'],
  size: { width: 960, height: 500 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const years = YEARLY.map((y) => y.year);
  const stems = {
    type: 'scatter',
    mode: 'lines',
    x: YEARLY.flatMap((y) => [y.year, y.year, null]),
    y: YEARLY.flatMap((y) => [y.coldest, y.hottest, null]),
    line: { color: LOOK.zero, width: 1.5 },
    showlegend: false,
    hoverinfo: 'skip',
  } satisfies ScatterTrace;
  const dots = (hot: boolean) =>
    ({
      type: 'scatter',
      mode: 'markers',
      name: hot ? 'Hottest high of the year' : 'Coldest low of the year',
      x: years,
      y: YEARLY.map((y) => (hot ? y.hottest : y.coldest)),
      customdata: YEARLY.map((y) => fmtDate(hot ? y.hottestDate : y.coldestDate)),
      marker: { color: hot ? HOT : COLD, size: 7 },
      hovertemplate: `${hot ? 'Hottest' : 'Coldest'}: <b>%{y} °F</b> on %{customdata}<extra></extra>`,
    }) satisfies ScatterTrace;

  // The all-time records; a tie is labelled at its first year and names the others.
  const record = (hot: boolean): LayoutAnnotation => {
    const value = hot
      ? Math.max(...YEARLY.map((y) => y.hottest))
      : Math.min(...YEARLY.map((y) => y.coldest));
    const hits = YEARLY.filter((y) => (hot ? y.hottest : y.coldest) === value);
    const at = hits[0] as (typeof YEARLY)[number];
    const dates = hits.map((y) => fmtDate(hot ? y.hottestDate : y.coldestDate)).join(' and ');
    return {
      x: at.year,
      y: value,
      text: `Record ${hot ? 'high' : 'low'}: ${value} °F, ${dates}`,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.text,
      ax: hot ? -40 : 40,
      ay: hot ? -24 : 22,
      xanchor: hot ? 'right' : 'left',
      font: { size: 11, color: LOOK.title },
    };
  };

  const hottest = YEARLY.map((y) => y.hottest);
  const coldest = YEARLY.map((y) => y.coldest);

  const chart: Chart = createChart(chartEl, {
    data: [stems, dots(true), dots(false)],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Hottest highs stay between ${Math.min(...hottest)} and ${Math.max(...hottest)} °F; coldest lows range from ${Math.min(...coldest)} to ${Math.max(...coldest)} °F`,
      },
      hovermode: 'x',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { dtick: 10, range: [FIRST_YEAR - 1.5, LAST_YEAR + 1.5] },
      yaxis: {
        title: { text: 'Temperature (°F)' },
        range: [-12, 124],
        dtick: 20,
        zeroline: false,
      },
      annotations: [record(true), record(false)],
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
