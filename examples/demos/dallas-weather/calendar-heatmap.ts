import { createChart, type Chart, type Figure, type HeatmapTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CURRENT_YEAR,
  DATE,
  daysOf,
  fmtDate,
  LAST_DATE,
  MONTH,
  DOM,
  MONTH_NAMES,
  TEMP_SCALE,
  TMAX,
  TMIN,
  yearSummary,
} from './analysis.mts';
import { weekday, YEAR_OPTIONS } from './temperature.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * A year as a calendar: a `heatmap` with one cell per day, a column per week and a row per
 * weekday (Monday on top, `yaxis.autorange: 'reversed'`), colored by the day's high. The color
 * range is fixed at 20–110 °F (`zmin` / `zmax`) so every year uses the same colors. `xgap` and
 * `ygap` separate the cells, the x axis sits on top (`side: 'top'`) with a month name at the week
 * each month starts in (`tickvals` / `ticktext`), and the cells before Jan 1, after Dec 31 and
 * after the last reading are `null` and stay blank. Hover gives the date, high and low. The
 * "Year" toggle redraws with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: a year of daily highs as a calendar',
  description:
    'Calendar heatmap of one year: a cell per day by week and weekday, colored by the daily high, with a year toggle.',
  tags: ['demo', 'heatmap', 'calendar', 'xgap', 'ygap', 'colorscale', 'colorbar', 'react'],
  size: { width: 960, height: 320 },
  testTolerance: 0.004,
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKS = 54;
const Z_MIN = 20;
const Z_MAX = 110;

function figure(year: number, narrow: boolean): Figure {
  const days = daysOf(year);
  const offset = weekday(`${year}-01-01`);
  const z = WEEKDAYS.map(() => Array.from({ length: WEEKS }, (): number | null => null));
  const text = WEEKDAYS.map(() => Array.from({ length: WEEKS }, () => ''));
  const monthWeek: number[] = [];
  const dayOfYear0 = Date.parse(`${year}-01-01`);
  for (const i of days) {
    const n = Math.round((Date.parse(DATE[i] as string) - dayOfYear0) / 86_400_000) + offset;
    const week = Math.floor(n / 7);
    const row = n % 7;
    if (DOM[i] === 1) monthWeek[(MONTH[i] as number) - 1] = week;
    const hi = TMAX[i] ?? null;
    const lo = TMIN[i] ?? null;
    (z[row] as (number | null)[])[week] = hi;
    (text[row] as string[])[week] =
      `${WEEKDAYS[row]}, ${fmtDate(DATE[i] as string)}<br>` +
      (hi === null ? 'No reading' : `High <b>${hi} °F</b>`) +
      (lo === null ? '' : `, low <b>${lo} °F</b>`);
  }
  const s = yearSummary(year);
  const partial = year === CURRENT_YEAR ? ` (through ${fmtDate(LAST_DATE).split(',')[0]})` : '';
  const trace: HeatmapTrace = {
    type: 'heatmap',
    x: Array.from({ length: WEEKS }, (_, w) => w),
    y: WEEKDAYS,
    z,
    text,
    hovertemplate: '%{text}<extra></extra>',
    hoverongaps: false,
    xgap: 2,
    ygap: 2,
    colorscale: TEMP_SCALE,
    zmin: Z_MIN,
    zmax: Z_MAX,
    colorbar: {
      title: { text: 'Daily<br>high' },
      ticksuffix: ' °F',
      dtick: 30,
      tick0: Z_MIN,
      thickness: 12,
      len: 1,
    },
  };
  return {
    data: [trace],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Daily highs of ${year}${partial}: ${s.days100} days at 100 °F or more, hottest ${s.hottest} °F`,
      },
      margin: { t: narrow ? 36 : 76, l: 44, r: narrow ? 64 : 84, b: 16 },
      xaxis: {
        side: 'top',
        range: [-0.5, WEEKS - 0.5],
        tickvals: monthWeek,
        ticktext: MONTH_NAMES.slice(0, monthWeek.length),
        showgrid: false,
        zeroline: false,
        ticks: '',
        fixedrange: true,
      },
      yaxis: {
        type: 'category',
        autorange: 'reversed',
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
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
