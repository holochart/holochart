import {
  createChart,
  type BarTrace,
  type Chart,
  type Figure,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CLIMATE,
  CURRENT_YEAR,
  DATE,
  daysOf,
  FIRST_YEAR,
  fmtDate,
  LAST_DATE,
  NORMAL_FROM,
  NORMAL_TO,
  slot,
  slotDate,
  TEMP_SCALE,
  TMAX,
  TMIN,
  yearSummary,
} from './analysis.mts';
import { DAY_MS, YEAR_OPTIONS, withAlpha } from './temperature.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * One year of weather against what is usual, on a day-of-the-year date axis (every day is put in
 * the year 2000, `tickformat: '%b'`). A pale band runs from the record low to the record high of
 * each calendar day and a darker band from the average low to the average high (pairs of `scatter`
 * lines with `fill: 'tonexty'`). On top, each day of the chosen year is a thin `bar` from its low
 * to its high (`base` = low, height = high − low, `width` in milliseconds on the date axis),
 * colored by the day's mean temperature (`marker.colorscale`). The hottest and coldest days of
 * the year are labelled. The "Year" toggle redraws with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: one year, day by day, against the records',
  description:
    'Daily low-to-high bars of one year over the average range and the record range of each calendar day, with a year toggle.',
  tags: ['demo', 'bar', 'scatter', 'base', 'fill', 'date', 'colorscale', 'annotations', 'react'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const X = CLIMATE.map((c) => c.date);
const BAND = LOOK.tick;

function band(
  name: string,
  lo: readonly number[],
  hi: readonly number[],
  alpha: number,
  hover: string,
  custom: readonly (readonly (number | string)[])[],
): ScatterTrace[] {
  const line = { color: 'rgba(0, 0, 0, 0)', width: 0 };
  return [
    { type: 'scatter', mode: 'lines', x: X, y: lo, line, showlegend: false, hoverinfo: 'skip' },
    {
      type: 'scatter',
      mode: 'lines',
      name,
      x: X,
      y: hi,
      line,
      fill: 'tonexty',
      fillcolor: withAlpha(BAND, alpha),
      customdata: custom,
      hovertemplate: `${hover}<extra></extra>`,
    },
  ];
}

function figure(year: number, narrow: boolean): Figure {
  const days = daysOf(year).filter((i) => TMAX[i] !== null && TMIN[i] !== null);
  const high = days.map((i) => TMAX[i] as number);
  const low = days.map((i) => TMIN[i] as number);
  const bars: BarTrace = {
    type: 'bar',
    name: `${year}: each day's low to high`,
    x: days.map((i) => slotDate(slot(i))),
    base: low,
    y: high.map((h, k) => h - (low[k] as number)),
    width: DAY_MS * 0.72,
    customdata: days.map((i, k) => [
      fmtDate(DATE[i] as string),
      high[k] as number,
      low[k] as number,
    ]),
    marker: {
      color: high.map((h, k) => (h + (low[k] as number)) / 2),
      colorscale: TEMP_SCALE,
      cmin: 20,
      cmax: 100,
      showscale: false,
    },
    hovertemplate:
      '%{customdata[0]}<br>High <b>%{customdata[1]} °F</b>, low <b>%{customdata[2]} °F</b><extra></extra>',
  };

  const s = yearSummary(year);
  const label = (hot: boolean): LayoutAnnotation => {
    const date = hot ? s.hottestDate : s.coldestDate;
    const value = hot ? s.hottest : s.coldest;
    return {
      x: slotDate(slot(DATE.indexOf(date))),
      y: value,
      text: `${hot ? 'Hottest' : 'Coldest'}: ${value} °F, ${fmtDate(date).split(',')[0]}`,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.text,
      ax: hot ? 0 : 56,
      ay: hot ? -22 : 20,
      font: { size: 11, color: LOOK.title },
    };
  };

  const partial = year === CURRENT_YEAR ? `, through ${fmtDate(LAST_DATE).split(',')[0]}` : '';
  return {
    data: [
      ...band(
        `Record range, ${FIRST_YEAR - 1} to ${CURRENT_YEAR}`,
        CLIMATE.map((c) => c.recordLow),
        CLIMATE.map((c) => c.recordHigh),
        0.16,
        '%{x|%b %-d}<br>Record high %{y} °F (%{customdata[0]}), record low %{customdata[1]} °F (%{customdata[2]})',
        CLIMATE.map((c) => [c.recordHighYear, c.recordLow, c.recordLowYear]),
      ),
      ...band(
        `Average range, ${NORMAL_FROM} to ${NORMAL_TO}`,
        CLIMATE.map((c) => c.avgLow),
        CLIMATE.map((c) => c.avgHigh),
        0.34,
        'Average high %{y:.0f} °F, average low %{customdata[0]:.0f} °F',
        CLIMATE.map((c) => [c.avgLow]),
      ),
      bars,
    ],
    layout: {
      title: {
        text: narrow ? '' : `${year} in Dallas, day by day${partial}`,
      },
      hovermode: 'x',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'date',
        range: ['1999-12-30', '2001-01-02'],
        tickformat: '%b',
        dtick: 'M1',
        ticklabelmode: 'period',
        hoverformat: '%b %-d',
        fixedrange: true,
      },
      yaxis: { title: { text: 'Temperature (°F)' }, range: [-8, 122], dtick: 20 },
      annotations: [label(true), label(false)],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure(CURRENT_YEAR, narrow));
  segmented(
    toolbar,
    'Year',
    YEAR_OPTIONS,
    (value) => void chart.react(figure(Number(value), narrow)),
    String(CURRENT_YEAR),
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
