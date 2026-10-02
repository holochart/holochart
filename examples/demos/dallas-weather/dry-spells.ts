import { createChart, type BarTrace, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DATE, fmtDate, LAST_DATE, N, PRCP, WARM } from './analysis.mts';
import { DAY_MS } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The 12 longest dry spells in the record: runs of days without measurable rain (under 0.01 in),
 * drawn Gantt-style as horizontal bars with a `base` on a date axis (`base` is the first day, the
 * bar length is the duration in milliseconds). All spells share one calendar, June to May, so
 * each bar sits on the days of the year it covered, whatever its year; the row label gives the
 * year. Runs that include a day with no rain reading are skipped. A spell still running on the
 * last day of the record is drawn lighter and labelled "so far". Nearly all of the long dry
 * spells are summer ones, from June or July into August or September.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: the longest dry spells',
  description:
    'The 12 longest runs of days without measurable rain since 1939 as horizontal bars with a base on a date axis, on a shared June-to-May calendar.',
  tags: ['demo', 'bar', 'horizontal', 'base', 'gantt', 'date', 'text'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const WET = 0.01;
const SHOWN = 12;
/** The shared calendar starts with this month (June), in the year 2000. */
const CALENDAR_START = 6;

interface Spell {
  first: number;
  last: number;
  days: number;
  /** Still running on the last day of the record. */
  open: boolean;
}

function spells(): Spell[] {
  const out: Spell[] = [];
  let start = -1;
  let gap = false;
  // A run that begins on the first day of the record may have started earlier: skip it.
  let censored = true;
  for (let i = 0; i <= N; i++) {
    const p = i < N ? PRCP[i] : undefined;
    const wet = i === N || (p !== null && p !== undefined && p >= WET);
    if (!wet) {
      if (start < 0) {
        start = i;
        gap = false;
      }
      if (p === null || p === undefined) gap = true;
      continue;
    }
    if (start >= 0 && !gap && !censored) {
      out.push({ first: start, last: i - 1, days: i - start, open: i === N });
    }
    start = -1;
    censored = false;
  }
  return out.sort((a, b) => b.days - a.days || a.first - b.first).slice(0, SHOWN);
}

/** The spell's first day on the shared calendar: the same month and day, in 2000 or 2001. */
function calendarDate(date: string): string {
  const month = Number(date.slice(5, 7));
  return `${month >= CALENDAR_START ? 2000 : 2001}-${date.slice(5)}`;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const top = spells();
  const firstDate = (s: Spell): string => DATE[s.first] as string;
  const lastDate = (s: Spell): string => DATE[s.last] as string;
  const label = (s: Spell): string => {
    const a = firstDate(s).slice(0, 4);
    const b = lastDate(s).slice(0, 4);
    return a === b ? a : `${a}–${b.slice(2)}`;
  };
  const summer = top.filter((s) => {
    const m = Number(firstDate(s).slice(5, 7));
    return m >= 6 && m <= 8;
  }).length;
  const longest = top[0]!;
  const ends = top.map((s) => Date.parse(calendarDate(firstDate(s))) + s.days * DAY_MS);
  const lastEnd = new Date(Math.max(...ends));
  // The axis ends with the month after the last bar, leaving room for the labels.
  const axisEnd = new Date(Date.UTC(lastEnd.getUTCFullYear(), lastEnd.getUTCMonth() + 2, 1))
    .toISOString()
    .slice(0, 10);

  const bars = {
    type: 'bar',
    orientation: 'h',
    name: 'Dry spell',
    y: top.map((_, k) => k),
    base: top.map((s) => calendarDate(firstDate(s))),
    x: top.map((s) => s.days * DAY_MS),
    width: 0.62,
    text: top.map((s) => (s.open ? `${s.days} days so far` : `${s.days} days`)),
    textposition: 'outside',
    textfont: { size: 11, color: LOOK.title },
    cliponaxis: false,
    customdata: top.map((s) => [
      fmtDate(firstDate(s)),
      s.open ? `${fmtDate(lastDate(s))} (the last day of the record)` : fmtDate(lastDate(s)),
      s.days,
    ]),
    marker: {
      color: top.map((s) => (s.open ? 'rgba(232, 131, 58, 0.5)' : WARM)),
      line: { color: WARM, width: 1 },
    },
    hovertemplate:
      '<b>%{customdata[2]} days</b> without rain<br>%{customdata[0]} to %{customdata[1]}<extra></extra>',
  } satisfies BarTrace;

  const figure: FigureInput = {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : `The ${top.length} longest dry spells: ${summer} began in summer; the longest ran ${longest.days} days, to ${fmtDate(lastDate(longest))}`,
      },
      showlegend: false,
      margin: { l: 72, r: 24 },
      xaxis: {
        type: 'date',
        range: [`2000-0${CALENDAR_START}-01`, axisEnd],
        dtick: 'M1',
        tickformat: '%b',
        ticklabelmode: 'period',
        title: { text: `Days of the year without measurable rain (through ${fmtDate(LAST_DATE)})` },
      },
      yaxis: {
        tickvals: top.map((_, k) => k),
        ticktext: top.map(label),
        showgrid: false,
        zeroline: false,
        range: [top.length - 0.4, -0.6],
      },
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
