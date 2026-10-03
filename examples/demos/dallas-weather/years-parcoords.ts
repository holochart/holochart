import { createChart, type Chart, type ParcoordsTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { RAIN_YEARS, type YearSummary } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';
import { YEAR_SCALE } from './years-events.mts';

/**
 * Every complete year as one line through seven axes (`parcoords`): mean temperature, hottest
 * day, days of 100 °F or more, freezing nights, coldest night, total rain and rainy days. Only
 * years with a complete rain record are drawn (1997 and 1998 have gaps). Lines are colored by
 * year (`line.color` with a `colorscale` and a colorbar), old years dim and blue, recent years
 * bright and red, so a drift over time shows as a color gradient along an axis: the red lines
 * sit high on the mean temperature axis and low on the freezing nights axis. Drag along an axis
 * to brush a range (`constraintrange`); the other lines dim.
 *
 * Thunder days are left out: the record has no thunder reports before 1948 or in 1998, and a
 * zero there would read as a quiet year.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: every year in parallel coordinates',
  description:
    'Parallel coordinates of every complete year since 1940: mean temperature, hottest day, 100 °F days, freezing nights, coldest night, rain total and rainy days, colored by year.',
  tags: ['demo', 'parcoords', 'colorscale', 'colorbar', 'statistical'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const years = RAIN_YEARS;
  const col = (get: (y: YearSummary) => number): number[] => years.map(get);
  const firstYear = (years[0] as YearSummary).year;
  const lastYear = (years[years.length - 1] as YearSummary).year;
  const colorTicks: number[] = [];
  for (let y = Math.ceil(firstYear / 20) * 20; y <= lastYear; y += 20) colorTicks.push(y);

  const all: ParcoordsTrace['dimensions'] = [
    { label: 'Mean temp (°F)', values: col((y) => y.meanTemp), tickformat: '.0f' },
    { label: 'Hottest day (°F)', values: col((y) => y.hottest), tickformat: '.0f' },
    { label: 'Days of 100 °F+', values: col((y) => y.days100), tickformat: '.0f' },
    { label: 'Freezing nights', values: col((y) => y.freezeDays), tickformat: '.0f' },
    { label: 'Coldest night (°F)', values: col((y) => y.coldest), tickformat: '.0f' },
    { label: 'Rain (in)', values: col((y) => y.rain), tickformat: '.0f' },
    { label: 'Rainy days', values: col((y) => y.rainDays), tickformat: '.0f' },
  ];
  // Phones: four axes with short names.
  const few: ParcoordsTrace['dimensions'] = [
    { label: 'Mean °F', values: col((y) => y.meanTemp), tickformat: '.0f' },
    { label: '100 °F days', values: col((y) => y.days100), tickformat: '.0f' },
    { label: 'Freezes', values: col((y) => y.freezeDays), tickformat: '.0f' },
    { label: 'Rain (in)', values: col((y) => y.rain), tickformat: '.0f' },
  ];

  const trace: ParcoordsTrace = {
    type: 'parcoords',
    labelfont: { size: narrow ? 9 : 11 },
    tickfont: { size: 9 },
    line: {
      color: col((y) => y.year),
      colorscale: YEAR_SCALE,
      cmin: firstYear,
      cmax: lastYear,
      showscale: !narrow,
      colorbar: {
        title: { text: 'Year', side: 'right' },
        tickvals: colorTicks,
        tickformat: 'd',
        thickness: 12,
      },
    },
    dimensions: narrow ? few : all,
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${years.length} years, one line each: the recent ones (red) run warmer, with fewer freezes`,
      },
      margin: narrow ? { t: 48, l: 32, r: 44, b: 24 } : { t: 88, l: 56, r: 110, b: 32 },
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
