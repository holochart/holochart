import { createChart, type BarTrace, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  BASE,
  dailyReturns,
  EVENTS,
  fmtDate,
  halfOf,
  HALVES,
  LABEL,
  pct,
  PERIODS,
  type Fund,
  type Half,
} from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, settled } from './ui.mts';

/**
 * A fund's ten best and ten worst days of the four years (1,002 sessions) as horizontal bars
 * sorted by return: gains run right of the zero line and losses left, and the bar's color says
 * which half the day fell in (one `bar` trace per half on a shared category axis ordered with
 * `categoryarray`, `barmode: 'overlay'`). The return is printed at the end of each bar
 * (`textposition: 'outside'`); the date sits on the other side of the zero line (a `text`-mode
 * scatter trace), with the name of the event where the day is one of the demo's dated turning
 * points. The fund picker rebuilds the figure with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: the ten best and ten worst days',
  description:
    'Horizontal bars of a fund’s ten best and ten worst daily returns from October 2022 to September 2026, colored by half, with a fund picker.',
  tags: ['demo', 'bar', 'horizontal', 'overlay', 'text', 'category', 'react', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** How many days on each side. */
const N = 10;

interface Day {
  date: string;
  /** Return in percent. */
  r: number;
  half: Half;
  /** Row label: unique per day, so it can be a category. */
  key: string;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const eventOn = new Map(EVENTS.map((e) => [e.date, e.label]));

  function figure(fund: Fund): {
    data: (BarTrace | ScatterTrace)[];
    layout: Record<string, unknown>;
  } {
    const { dates, r } = dailyReturns(fund);
    const days = r
      .map((v, i): Day => {
        const date = dates[i] as string;
        const event = eventOn.get(date);
        return {
          date,
          r: v * 100,
          half: halfOf(BASE + 1 + i),
          key: event && !narrow ? `${fmtDate(date)} · ${event}` : fmtDate(date),
        };
      })
      .sort((a, b) => b.r - a.r);
    const shown = [...days.slice(0, N), ...days.slice(-N)];
    const inFirst = (list: Day[]): number => list.filter((d) => d.half === 'first').length;
    const max = (shown[0] as Day).r;
    const min = (shown.at(-1) as Day).r;
    const span = max - min;
    /** The space between the zero line and a date, in percent of return. */
    const gap = span * 0.01;

    const bars = HALVES.map((half): BarTrace => {
      const mine = shown.filter((d) => d.half === half);
      return {
        type: 'bar',
        orientation: 'h',
        name: PERIODS[half].label,
        y: mine.map((d) => d.key),
        x: mine.map((d) => d.r),
        text: mine.map((d) => pct(d.r / 100, 2)),
        textposition: 'outside',
        textfont: { size: 10, color: LOOK.title },
        marker: { color: PERIODS[half].color },
        hovertemplate: `<b>%{y}</b><br>${fund} %{text}<extra>${PERIODS[half].short}</extra>`,
      };
    });
    // The dates, written across the zero line from their bars.
    const labels = [true, false].map((up): ScatterTrace => {
      const mine = shown.filter((d) => d.r > 0 === up);
      return {
        type: 'scatter',
        mode: 'text',
        showlegend: false,
        hoverinfo: 'skip',
        y: mine.map((d) => d.key),
        x: mine.map(() => (up ? -gap : gap)),
        text: mine.map((d) => d.key),
        textposition: up ? 'middle left' : 'middle right',
        textfont: { size: 10, color: LOOK.text },
      };
    });

    return {
      data: [...bars, ...labels],
      layout: {
        title: {
          text: narrow
            ? ''
            : `${fund} (${LABEL[fund]}): ${inFirst(shown.slice(0, N))} of the ${N} best days and ` +
              `${inFirst(shown.slice(N))} of the ${N} worst came in 2022–24`,
        },
        barmode: 'overlay',
        bargap: 0.25,
        hovermode: 'closest',
        legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
        margin: { l: 24, r: 24 },
        xaxis: {
          title: { text: 'Daily return' },
          ticksuffix: '%',
          range: [min - span * 0.09, max + span * 0.09],
          zeroline: true,
          zerolinecolor: LOOK.tick,
        },
        yaxis: {
          type: 'category',
          categoryorder: 'array',
          categoryarray: shown.map((d) => d.key).reverse(),
          showticklabels: false,
          showline: false,
          ticks: '',
          tickcolor: LOOK.bg,
          showgrid: false,
          range: [-0.6, 2 * N - 0.4],
        },
      },
    };
  }

  const chart: Chart = createChart(chartEl, { ...figure('SPY'), config: chartConfig(narrow) });
  fundPicker(toolbar, (fund) => {
    void chart.react({ ...figure(fund), config: chartConfig(narrow) });
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
