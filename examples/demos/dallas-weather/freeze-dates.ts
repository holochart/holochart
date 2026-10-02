import {
  createChart,
  type Chart,
  type LayoutAnnotation,
  type LayoutShape,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  DATE,
  daysOf,
  fmtDate,
  MONTH,
  MONTH_NAMES,
  NEUTRAL,
  SEASON_COLOR,
  slot,
  slotDate,
  TMIN,
  YEARS,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { median, suspectLow } from './wind-seasons.mts';

/**
 * The freeze-free season of every year: the date of the last spring freeze (the last low of 32 °F
 * or less before July) and of the first fall freeze (the first one after July) as two series of
 * `scatter` markers against the year, on a day-of-year date axis (dates moved into the year 2000,
 * `yaxis.type: 'date'`, `tickformat: '%b'`). A thin vertical line per year joins the two (one
 * `lines` trace with gaps): the growing season between them. Dashed `shapes` mark the median
 * dates.
 *
 * A year with no freeze in one half of the year has no marker there and no line. One faulty
 * reading (a low of 32 °F on Jun 24, 2025, between lows of 77 and 75 °F) is left out.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: last spring freeze and first fall freeze',
  description:
    'For each year since 1940, the dates of the last spring freeze and the first fall freeze at Dallas Love Field, with the median dates and the freeze-free season between them.',
  tags: ['demo', 'scatter', 'markers', 'lines', 'date axis', 'shapes', 'annotations'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

interface FreezeYear {
  year: number;
  /** Day index of the last freeze before July and of the first one after, if any. */
  spring: number | null;
  fall: number | null;
}

/** `2000-03-07` → `Mar 7`. */
const dayName = (date: string): string =>
  `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const years: FreezeYear[] = YEARS.map((year) => {
    const freezes = daysOf(year).filter((i) => {
      const t = TMIN[i];
      return t !== null && t !== undefined && t <= 32 && !suspectLow(i);
    });
    const before = freezes.filter((i) => (MONTH[i] as number) < 7);
    const after = freezes.filter((i) => (MONTH[i] as number) >= 7);
    return { year, spring: before[before.length - 1] ?? null, fall: after[0] ?? null };
  });

  const series = (key: 'spring' | 'fall', name: string, color: string): ScatterTrace => {
    const rows = years.filter((y) => y[key] !== null);
    return {
      type: 'scatter',
      mode: 'markers',
      name,
      x: rows.map((y) => y.year),
      y: rows.map((y) => slotDate(slot(y[key] as number))),
      customdata: rows.map((y) => [
        fmtDate(DATE[y[key] as number] as string),
        TMIN[y[key] as number],
      ]),
      marker: { color, size: 6 },
      hovertemplate: `${name}<br><b>%{customdata[0]}</b>, low %{customdata[1]} °F<extra></extra>`,
    };
  };

  const both = years.filter((y) => y.spring !== null && y.fall !== null);
  const season: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Freeze-free season',
    x: both.flatMap((y) => [y.year, y.year, null]),
    y: both.flatMap((y) => [
      slotDate(slot(y.spring as number)),
      slotDate(slot(y.fall as number)),
      null,
    ]),
    line: { color: NEUTRAL, width: 1 },
    opacity: 0.55,
    hoverinfo: 'skip',
  };

  const medianSlot = (key: 'spring' | 'fall'): number =>
    Math.round(median(years.flatMap((y) => (y[key] === null ? [] : [slot(y[key])]))));
  const springDate = slotDate(medianSlot('spring'));
  const fallDate = slotDate(medianSlot('fall'));
  const length = Math.round(median(both.map((y) => (y.fall as number) - (y.spring as number))));
  const first = YEARS[0] as number;
  const last = YEARS[YEARS.length - 1] as number;

  const line = (date: string, color: string): LayoutShape => ({
    type: 'line',
    xref: 'paper',
    x0: 0,
    x1: 1,
    y0: date,
    y1: date,
    line: { color, width: 1.25, dash: 'dash' },
  });
  const note = (date: string, text: string): LayoutAnnotation => ({
    xref: 'paper',
    x: 1,
    y: date,
    xanchor: 'left',
    yanchor: 'middle',
    xshift: 8,
    align: 'left',
    showarrow: false,
    text,
    font: { size: 10, color: LOOK.title },
  });

  const chart: Chart = createChart(chartEl, {
    data: [
      season,
      series('spring', 'Last spring freeze', SEASON_COLOR.Spring),
      series('fall', 'First fall freeze', SEASON_COLOR.Fall),
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Freeze-free from about ${dayName(springDate)} to ${dayName(fallDate)}: ${length} days in a typical year`,
      },
      hovermode: 'closest',
      margin: { r: 96 },
      legend: { orientation: 'h', x: 0, xanchor: 'left', y: 1.02, yanchor: 'bottom' },
      xaxis: { title: { text: 'Year' }, range: [first - 1.5, last + 1.5], dtick: 10 },
      yaxis: {
        type: 'date',
        range: ['2000-01-01', '2000-12-31'],
        tickformat: '%b',
        dtick: 'M1',
        hoverformat: '%b %-d',
      },
      shapes: [line(springDate, SEASON_COLOR.Spring), line(fallDate, SEASON_COLOR.Fall)],
      annotations: [
        note(springDate, `Median last<br>spring freeze<br>${dayName(springDate)}`),
        note(fallDate, `Median first<br>fall freeze<br>${dayName(fallDate)}`),
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
