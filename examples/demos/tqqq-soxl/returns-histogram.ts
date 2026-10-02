import {
  createChart,
  type Chart,
  type HistogramTrace,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  COMMON_RETURNS,
  COMMON_START,
  fmtDate,
  FUNDS,
  mean,
  pct,
  stdev,
  type Fund,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * The distribution of TQQQ's and SOXL's daily returns since SOXL's first day (Mar 11, 2010): two
 * `histogram` traces overlaid (`barmode: 'overlay'`, `opacity`) on shared 1% bins (`xbins` and one
 * `bingroup`), each with the normal distribution of the same mean and standard deviation drawn as
 * a line, scaled to counts (days per 1% bin). On a linear count axis the bell curves look like a
 * fair fit; the Log/Linear toggle (`chart.relayout({ 'yaxis.type': … })`) shows the tails, where
 * the curves fall to a fraction of a day while real days keep coming out to ±35–55%. Annotations
 * mark the worst and best day of both funds (both happened on the same dates).
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: distribution of daily returns',
  description:
    'Overlaid histograms of TQQQ and SOXL daily returns since 2010 with fitted normal curves, on a log or linear count axis.',
  tags: ['demo', 'histogram', 'overlay', 'bingroup', 'line', 'log', 'annotations', 'relayout'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** Bin width, in percent. */
const BIN = 1;
/** Curve points below this many days are dropped (the log axis would otherwise run to 1e-30). */
const CURVE_FLOOR = 0.5;
/** The log axis range: 0.56 to 890 days, so one-day bins keep a visible bar. */
const LOG_RANGE = [-0.25, 2.95];
const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

interface Fit {
  fund: Fund;
  x: number[];
  m: number;
  sd: number;
  /** Days more than 4 standard deviations from the mean. */
  beyond4: number;
}

function fit(fund: Fund): Fit {
  const x = COMMON_RETURNS[fund].r.map((v) => v * 100);
  const m = mean(x);
  const sd = stdev(x);
  return { fund, x, m, sd, beyond4: x.filter((v) => Math.abs(v - m) > 4 * sd).length };
}

/** The normal curve with the fit's mean and stdev, in days per bin, where it is ≥ CURVE_FLOOR. */
function normalCurve(f: Fit, lo: number, hi: number): { x: number[]; y: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const scale = (f.x.length * BIN) / (f.sd * Math.sqrt(2 * Math.PI));
  for (let v = lo; v <= hi + 1e-9; v += 0.25) {
    const y = scale * Math.exp(-(((v - f.m) / f.sd) ** 2) / 2);
    if (y < CURVE_FLOOR) continue;
    xs.push(v);
    ys.push(y);
  }
  return { x: xs, y: ys };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const fits = FUNDS.map(fit);
  const all = fits.flatMap((f) => f.x);
  const lo = Math.floor(Math.min(...all) / BIN) * BIN - BIN;
  const hi = Math.ceil(Math.max(...all) / BIN) * BIN + BIN;
  const days = COMMON_RETURNS.TQQQ.dates;
  const n = days.length;

  const histograms = fits.map((f, k): HistogramTrace => ({
    type: 'histogram',
    legendrank: 2 * k + 1,
    name: `${f.fund} days`,
    legendgroup: f.fund,
    x: f.x,
    xbins: { start: lo, end: hi, size: BIN },
    bingroup: 'daily',
    opacity: 0.55,
    marker: { color: COLOR[f.fund] },
    hovertemplate: `${f.fund}  %{x}<br><b>%{y:,} days</b><extra></extra>`,
  }));
  const curves = fits.map((f, k): ScatterTrace => {
    const c = normalCurve(f, lo, hi);
    return {
      type: 'scatter',
      legendrank: 2 * k + 2,
      mode: 'lines',
      name: `${f.fund} normal fit`,
      legendgroup: f.fund,
      x: c.x,
      y: c.y,
      line: { color: f.fund === 'TQQQ' ? COLOR.QQQ : COLOR.SOXX, width: 1.75 },
      hovertemplate:
        `${f.fund} normal fit (μ ${f.m.toFixed(2)}%, σ ${f.sd.toFixed(2)}%)` +
        '<br>%{x:+.2f}%: <b>%{y:,.2f} days</b> per 1% bin<extra></extra>',
    };
  });

  // The worst and best day of each fund fall on the same dates: label both funds once per date.
  const extremes = (pick: (a: number, b: number) => boolean): number => {
    let k = 0;
    fits[1]!.x.forEach((v, i) => {
      if (pick(v, fits[1]!.x[k]!)) k = i;
    });
    return k;
  };
  const marks = [extremes((a, b) => a < b), extremes((a, b) => a > b)].map((i, j) => ({
    i,
    worst: j === 0,
    x: Math.max(...fits.map((f) => Math.abs(f.x[i]!))) * (j === 0 ? -1 : 1),
  }));
  const markY = (log: boolean): number => (log ? 0 : 1);
  const annotations: LayoutAnnotation[] = [
    ...marks.map((mk): LayoutAnnotation => ({
      x: mk.x,
      y: markY(true),
      xref: 'x',
      yref: 'y',
      text:
        `<b>${mk.worst ? 'Worst' : 'Best'} day</b>, ${fmtDate(days[mk.i]!)}<br>` +
        fits.map((f) => `${f.fund} ${pct(f.x[mk.i]! / 100)}`).join(' · '),
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.tick,
      ax: mk.worst ? 30 : -30,
      ay: -70,
      xanchor: mk.worst ? 'left' : 'right',
      align: mk.worst ? 'left' : 'right',
      font: { size: 10, color: LOOK.text },
    })),
    {
      xref: 'paper',
      yref: 'paper',
      x: 0.01,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      align: 'left',
      showarrow: false,
      font: { size: 10, color: LOOK.text },
      text:
        'Days more than 4σ from the mean<br>' +
        fits.map((f) => `${f.fund} <b>${f.beyond4}</b>`).join(' · ') +
        ` · expected if normal: <b>${(n * 6.334e-5).toFixed(1)}</b>`,
    },
  ];

  const yTitle = (log: boolean): string =>
    log ? 'Days per 1% bin (log scale)' : 'Days per 1% bin';
  const chart: Chart = createChart(chartEl, {
    // SOXL's wider histogram first, so TQQQ's taller, narrower one is drawn over it.
    data: [histograms[1]!, histograms[0]!, curves[0]!, curves[1]!],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Daily returns since ${fmtDate(COMMON_START)} (${n.toLocaleString('en-US')} days)`,
      },
      barmode: 'overlay',
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Daily return' },
        ticksuffix: '%',
        range: [lo, hi],
        zeroline: true,
        hoverformat: '+.0f',
      },
      yaxis: { type: 'log', title: { text: yTitle(true) }, tickvals: LOG_TICKS, range: LOG_RANGE },
      annotations,
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Y axis',
    [
      { value: 'log', text: 'Log' },
      { value: 'linear', text: 'Linear' },
    ],
    (value) => {
      const log = value === 'log';
      const update: Record<string, unknown> = {
        'yaxis.type': value,
        'yaxis.range': log ? LOG_RANGE : null,
        'yaxis.autorange': !log,
        'yaxis.tickvals': log ? LOG_TICKS : null,
        'yaxis.title.text': yTitle(log),
      };
      marks.forEach((_, k) => {
        update[`annotations[${k}].y`] = markY(log);
      });
      void chart.relayout(update);
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
