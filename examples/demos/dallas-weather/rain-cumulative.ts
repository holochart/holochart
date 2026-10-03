import {
  createChart,
  type Chart,
  type FigureInput,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CURRENT_YEAR,
  daysOf,
  fmtDate,
  HOT,
  LAST_DATE,
  MONTH_NAMES,
  NEUTRAL,
  PRCP,
  RAIN,
  RAIN_YEARS,
  slot,
  slotDate,
  WARM,
} from './analysis.mts';
import { DRIEST_YEAR, median, WETTEST_YEAR } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How each year's rain adds up from January 1 to December 31: one faint line per year (84 years,
 * every third day, about 10,000 points in one trace, no legend entry, no hover), with the wettest year, the
 * driest year and the year in progress drawn on top and labelled at their ends (annotations in
 * the right margin), and the median of all years as a dashed line. The x axis is a date axis over
 * one calendar year (`slotDate`, with month ticks). Rain comes in steps: a flat stretch is a dry
 * spell, a jump is a storm.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: rain adding up through the year',
  description:
    'Cumulative rain against the day of the year, one faint line per year since 1940, with the wettest, driest and current year and the median highlighted.',
  tags: ['demo', 'scatter', 'lines', 'date', 'timeseries', 'many-traces', 'annotations'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const SLOTS = 366;
const X = Array.from({ length: SLOTS }, (_, s) => slotDate(s));
const DAY_LABEL = X.map(
  (d) => `${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`,
);

/**
 * Rain since January 1 at every slot of the calendar year, up to the last day with data. A day
 * with no reading adds nothing, and Feb 29 repeats Feb 28 in common years.
 */
function cumulative(year: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const i of daysOf(year)) {
    const s = slot(i);
    while (out.length < s) out.push(Math.round(sum * 100) / 100);
    sum += PRCP[i] ?? 0;
    out.push(Math.round(sum * 100) / 100);
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const curves = RAIN_YEARS.map((y) => ({ year: y.year, y: cumulative(y.year) }));
  const now = cumulative(CURRENT_YEAR);
  const mid = X.map((_, s) => median(curves.map((c) => c.y[s] as number)));
  const curveOf = (year: number): number[] => curves.find((c) => c.year === year)!.y;
  const wet = curveOf(WETTEST_YEAR.year);
  const dry = curveOf(DRIEST_YEAR.year);

  // One trace for all the faint lines, the years separated by gaps (`null`). The background
  // lines keep every third day (and the last), which is finer than a pixel at this width; the
  // highlighted years are drawn in full.
  const everyThird = (_: unknown, k: number, all: readonly unknown[]): boolean =>
    k % 3 === 0 || k === all.length - 1;
  const faint: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Each year',
    x: curves.flatMap(() => [...X.filter(everyThird), null]),
    y: curves.flatMap((c) => [...c.y.filter(everyThird), null]),
    connectgaps: false,
    line: { color: 'rgba(138, 144, 166, 0.22)', width: 1 },
    showlegend: false,
    hoverinfo: 'skip',
  };
  const strong = (
    name: string,
    y: number[],
    color: string,
    extra: Partial<ScatterTrace> = {},
  ): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x: X.slice(0, y.length),
    y,
    customdata: DAY_LABEL.slice(0, y.length),
    line: { color, width: 2.5 },
    hovertemplate: `%{customdata}: <b>%{y:.1f} in</b> since Jan 1<extra>${name}</extra>`,
    ...extra,
  });

  const endLabel = (y: number[], text: string, color: string, yshift = 0): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y',
    x: X[y.length - 1] as string,
    y: y[y.length - 1] as number,
    xanchor: 'left',
    xshift: 6,
    yshift,
    align: 'left',
    text,
    showarrow: false,
    font: { size: 10, color },
  });

  const figure: FigureInput = {
    data: [
      faint,
      strong('Median of all years', mid, LOOK.title, {
        line: { color: LOOK.title, width: 1.75, dash: 'dash' },
      }),
      strong(`${DRIEST_YEAR.year}, the driest`, dry, WARM),
      strong(`${WETTEST_YEAR.year}, the wettest`, wet, RAIN),
      strong(`${CURRENT_YEAR}, through ${fmtDate(LAST_DATE)}`, now, HOT),
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Rain since January 1, every year since ${RAIN_YEARS[0]!.year}: ${CURRENT_YEAR} is at ${now[now.length - 1]!.toFixed(1)} in, the median by that day is ${mid[now.length - 1]!.toFixed(1)} in`,
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { r: narrow ? 64 : 96 },
      xaxis: {
        type: 'date',
        range: ['2000-01-01', '2001-01-01'],
        dtick: 'M1',
        tickformat: '%b',
        ticklabelmode: 'period',
      },
      yaxis: { title: { text: 'Rain since January 1, inches' }, rangemode: 'tozero' },
      annotations: [
        endLabel(wet, `<b>${WETTEST_YEAR.year}</b><br>${wet[wet.length - 1]!.toFixed(1)} in`, RAIN),
        endLabel(dry, `<b>${DRIEST_YEAR.year}</b><br>${dry[dry.length - 1]!.toFixed(1)} in`, WARM),
        endLabel(mid, `<b>Median</b><br>${mid[mid.length - 1]!.toFixed(1)} in`, LOOK.title),
        {
          xref: 'x',
          yref: 'y',
          x: X[now.length - 1] as string,
          y: now[now.length - 1] as number,
          text: `<b>${CURRENT_YEAR}</b> so far: ${now[now.length - 1]!.toFixed(1)} in`,
          showarrow: true,
          arrowhead: 0,
          arrowwidth: 1,
          arrowcolor: NEUTRAL,
          ax: 34,
          ay: 44,
          font: { size: 10, color: HOT },
        },
      ],
    },
    config: chartConfig(narrow),
  };
  const chart: Chart = createChart(chartEl, figure);

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
