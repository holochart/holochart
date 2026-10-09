import {
  createChart,
  type Chart,
  type HistogramTrace,
  type LayoutAnnotation,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CORE,
  dailyReturns,
  fmtDate,
  HALVES,
  LABEL,
  pct,
  PERIODS,
  std,
  type Fund,
  type Half,
} from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * The distribution of a fund's daily returns in each half of the four years: two `histogram`
 * traces overlaid (`barmode: 'overlay'`, `opacity`) on the same quarter-percent bins (`xbins` and
 * one `bingroup`), the first half teal and the second amber, 501 sessions each. The x range is the
 * same for all four funds, so switching fund compares widths directly. On a linear count axis the
 * two halves look alike; the log axis (`yaxis.type: 'log'`, the default here) shows the tails,
 * where the second half's April 2025 days sit far outside anything in the first. Arrows mark the
 * best and worst day of the four years; a note gives each half's standard deviation and extremes.
 * Both toolbar toggles rebuild the figure and hand it to `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: distribution of daily returns, half by half',
  description:
    'Overlaid histograms of a fund’s daily returns in 2022–24 and 2024–26 on shared bins, on a log or linear count axis, with a fund picker.',
  tags: ['demo', 'histogram', 'overlay', 'bingroup', 'log', 'annotations', 'react', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** Bin width, in percent. */
const BIN = 0.25;
/** The log axis range: 0.63 to 160 sessions, so one-day bins keep a visible bar. */
const LOG_RANGE = [-0.2, 2.2];
const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100];

interface Side {
  half: Half;
  dates: readonly string[];
  /** Daily returns in percent. */
  x: number[];
  sd: number;
  best: number;
  worst: number;
}

function side(fund: Fund, half: Half): Side {
  const { dates, r } = dailyReturns(fund, half);
  const x = r.map((v) => v * 100);
  return {
    half,
    dates,
    x,
    sd: std(x),
    best: x.indexOf(Math.max(...x)),
    worst: x.indexOf(Math.min(...x)),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  // One x range for every fund: the widest day of any of them, rounded out to whole bins.
  const every = CORE.flatMap((t) => dailyReturns(t).r.map((v) => v * 100));
  const lo = Math.floor(Math.min(...every)) - 0.5;
  const hi = Math.ceil(Math.max(...every)) + 0.5;

  let fund: Fund = 'SPY';
  let log = true;

  const yTitle = (): string =>
    log ? `Sessions per ${BIN}% bin (log scale)` : `Sessions per ${BIN}% bin`;

  function figure(): { data: HistogramTrace[]; layout: Record<string, unknown> } {
    const sides = HALVES.map((half) => side(fund, half));
    const data = sides.map((s): HistogramTrace => ({
      type: 'histogram',
      name: PERIODS[s.half].label,
      x: s.x,
      xbins: { start: lo, end: hi, size: BIN },
      bingroup: 'daily',
      opacity: 0.6,
      marker: { color: PERIODS[s.half].color },
      hovertemplate: `${PERIODS[s.half].short}  %{x}<br><b>%{y} sessions</b><extra></extra>`,
    }));

    // The best and the worst day of the four years, each at the foot of its bar.
    const all = sides.flatMap((s) => s.x.map((v, i) => ({ v, date: s.dates[i] as string, s })));
    const best = all.reduce((a, b) => (b.v > a.v ? b : a));
    const worst = all.reduce((a, b) => (b.v < a.v ? b : a));
    const marks = [worst, best].map((d, k): LayoutAnnotation => ({
      x: d.v,
      y: log ? 0 : 1,
      xref: 'x',
      yref: 'y',
      text: `<b>${k === 0 ? 'Worst' : 'Best'} day</b><br>${fmtDate(d.date)}: ${pct(d.v / 100, 2)}`,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.tick,
      ax: k === 0 ? 24 : -24,
      ay: -64,
      xanchor: k === 0 ? 'left' : 'right',
      align: k === 0 ? 'left' : 'right',
      font: { size: 10, color: PERIODS[d.s.half].color },
    }));
    const notes = sides.map((s, k): LayoutAnnotation => ({
      xref: 'paper',
      yref: 'paper',
      x: 0.99,
      y: 0.98,
      yshift: -k * 30,
      xanchor: 'right',
      yanchor: 'top',
      align: 'right',
      showarrow: false,
      font: { size: 10, color: PERIODS[s.half].color },
      text:
        `<b>${PERIODS[s.half].short}</b>  standard deviation ${s.sd.toFixed(2)}%<br>` +
        `worst ${pct((s.x[s.worst] as number) / 100, 2)} · ` +
        `best ${pct((s.x[s.best] as number) / 100, 2)}`,
    }));

    return {
      data,
      layout: {
        title: { text: narrow ? '' : `${fund} (${LABEL[fund]}): daily returns in each half` },
        barmode: 'overlay',
        hovermode: 'closest',
        legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
        xaxis: {
          title: { text: 'Daily return' },
          ticksuffix: '%',
          range: [lo, hi],
          dtick: narrow ? 4 : 2,
          zeroline: true,
          hoverformat: '+.2f',
        },
        yaxis: log
          ? { type: 'log', title: { text: yTitle() }, tickvals: LOG_TICKS, range: LOG_RANGE }
          : { type: 'linear', title: { text: yTitle() } },
        annotations: narrow ? marks : [...marks, ...notes],
      },
    };
  }

  const chart: Chart = createChart(chartEl, { ...figure(), config: chartConfig(narrow) });
  const update = (): void => {
    void chart.react({ ...figure(), config: chartConfig(narrow) });
  };

  fundPicker(toolbar, (value) => {
    fund = value;
    update();
  });
  segmented(
    toolbar,
    'Y axis',
    [
      { value: 'log', text: 'Log' },
      { value: 'linear', text: 'Linear' },
    ],
    (value) => {
      log = value === 'log';
      update();
    },
    'log',
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
