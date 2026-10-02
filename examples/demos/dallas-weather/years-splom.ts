import { createChart, type Chart, type SplomTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { RAIN_YEARS } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { decadeOf, scaleColor, YEAR_SCALE } from './years-events.mts';

/**
 * Four yearly measures against each other, as a scatter plot matrix: mean temperature, days of
 * 100 °F or more, freezing nights and total rain, one marker per complete year with a full rain
 * record. One `splom` trace per decade shares the grid of axes, so the legend lists the decades
 * (a click hides one) and the colors run from dim blue for the 1940s to bright red for the 2020s;
 * the diagonal is left out (`diagonal.visible: false`) and hover lists all four values of the
 * year (`text`).
 *
 * Two things show: dry years have more 100 °F days (the rain row slopes down), and the recent
 * decades sit at the warm end of the mean temperature axis with fewer freezing nights.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: four yearly measures, pair by pair',
  description:
    'A scatter plot matrix of mean temperature, 100 °F days, freezing nights and rain total for every complete year since 1940, colored by decade.',
  tags: ['demo', 'splom', 'statistical', 'legend', 'hover'],
  size: { width: 800, height: 760 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const decades = [...new Set(RAIN_YEARS.map((y) => decadeOf(y.year)))];
  const traces = decades.map((decade, k): SplomTrace => {
    const ys = RAIN_YEARS.filter((y) => decadeOf(y.year) === decade);
    return {
      type: 'splom',
      name: `${decade}s`,
      dimensions: [
        { label: 'Mean temperature, °F', values: ys.map((y) => y.meanTemp) },
        { label: 'Days of 100 °F+', values: ys.map((y) => y.days100) },
        { label: 'Freezing nights', values: ys.map((y) => y.freezeDays) },
        { label: 'Rain, inches', values: ys.map((y) => y.rain) },
      ],
      diagonal: { visible: false },
      text: ys.map(
        (y) =>
          `<b>${y.year}</b><br>mean temperature ${y.meanTemp.toFixed(1)} °F<br>` +
          `${y.days100} days of 100 °F or more<br>${y.freezeDays} freezing nights<br>` +
          `${y.rain.toFixed(1)} in of rain`,
      ),
      hovertemplate: `%{text}<extra>${decade}s</extra>`,
      marker: {
        color: scaleColor(YEAR_SCALE, k / (decades.length - 1)),
        size: narrow ? 4 : 6,
        opacity: 0.9,
        line: { color: LOOK.bg, width: 0.5 },
      },
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `${RAIN_YEARS.length} years of Dallas weather, four measures pair by pair`,
      },
      hovermode: 'closest',
      dragmode: 'zoom',
      legend: { orientation: 'h', x: 0, y: -0.08, yanchor: 'top', font: { size: 10 } },
      margin: { t: narrow ? 16 : 48, b: 96 },
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
