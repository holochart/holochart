import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  addWeeks,
  CURRENT,
  expFn,
  FIRST_WEEK,
  FULL,
  fmtDate,
  fmtT,
  LAST_FULL_WEEK,
  linFn,
  N,
  pct,
  PROJ,
  WEEKLY,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * OpenRouter's weekly token volume (demo page `demos/openrouter`, after mk7s/exporouter): complete
 * weeks as bars, the current partial week lighter with OpenRouter's forecast for it as an
 * outline-only bar (`barmode: 'overlay'`), the exponential fit with a dotted 4-week projection and
 * the linear fit dashed. Hover templates read per-bar `customdata` (week, tokens, change, fit, top
 * models). A DOM toggle switches the y axis between linear and log with
 * `chart.relayout({ 'yaxis.type': … })`; the end-of-line labels are annotations, which follow
 * the fits when the legend hides them (`restyle` event) and move with the axis type (annotations
 * on log axes are placed by exponent, as in Plotly).
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: weekly tokens with exponential and linear fits',
  description:
    'Weekly tokens as bars, the partial week with its forecast outline, an exponential fit with a projection, a linear fit, and a linear/log toggle.',
  tags: ['demo', 'bar', 'scatter', 'annotations', 'hover', 'log', 'date', 'relayout'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const DAY = 864e5;
/** Bar width: 72% of a week, in ms (date axis). */
const BAR_WIDTH = 7 * DAY * 0.72;

const BAR = LOOK.colorway[0];
/** The partial week: the bar color at reduced strength. */
const PARTIAL = 'rgba(234, 42, 55, 0.4)';
const FIT = LOOK.title;
const LIN = LOOK.tick;

/** Top models of a week as hover lines: `model id  1.16T`. */
const topLines = (top: readonly [string, number][]): string[] =>
  [0, 1, 2].map((k) => {
    const m = top[k];
    return m ? `${m[0]}  <b>${fmtT(m[1])}</b>` : '';
  });

export interface Options {
  /** Start with the log y axis. */
  log?: boolean;
}

export function run(el: HTMLElement): ExampleHandle {
  return mount(el);
}

/** `run`, with options (the `weekly-tokens-log` example starts on the log axis). */
export function mount(el: HTMLElement, options: Options = {}): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const startLog = options.log ?? false;

  const fullX = FULL.map((d) => d.week);
  const projX = Array.from({ length: PROJ + 1 }, (_, k) => addWeeks(LAST_FULL_WEEK, k));
  const fitEnd = N - 1 + PROJ;
  const endX = projX[PROJ] as string;
  const linStart = Array.from({ length: fitEnd + 1 }, (_, i) => i).find((i) => linFn(i) > 0) ?? 0;
  const linX = Array.from({ length: fitEnd + 1 - linStart }, (_, k) =>
    addWeeks(FIRST_WEEK, linStart + k),
  );
  // Log view: from a little under the smallest week to a little over the projection.
  const logRange = [
    Math.log10(Math.min(...FULL.map((d) => d.tokensT)) * 0.6),
    Math.log10(Math.max(expFn(fitEnd), CURRENT?.forecastT ?? 0) * 1.25),
  ];
  // Log ticks at 1-2-5 steps inside that range, all labelled with the `T` suffix (the automatic
  // log ticks label only the powers of ten fully).
  const logTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(
    (v) => Math.log10(v) >= (logRange[0] as number) && Math.log10(v) <= (logRange[1] as number),
  );
  const logAxis = { type: 'log', range: logRange, tickmode: 'array', tickvals: logTicks };
  // Narrow containers (phones): the page heading names the chart, so drop the title and let a
  // wrapped legend take the top margin.
  const narrow = isNarrow(el);

  const fullCustom = FULL.map((d, i) => {
    const prev = FULL[i - 1];
    return [
      fmtDate(d.week, { month: 'short', day: 'numeric', year: 'numeric' }),
      fmtT(d.tokensT),
      prev ? pct(d.tokensT / prev.tokensT - 1) : '—',
      `${fmtT(expFn(i))} (${pct(d.tokensT / expFn(i) - 1, 0)})`,
      ...topLines(d.top),
    ];
  });

  const traces: Record<string, unknown>[] = [
    {
      type: 'bar',
      name: 'Complete week',
      x: fullX,
      y: FULL.map((d) => d.tokensT),
      width: BAR_WIDTH,
      marker: { color: BAR },
      customdata: fullCustom,
      hovertemplate:
        '<b>Week of %{customdata[0]}</b><br>' +
        '%{customdata[1]} tokens<br>' +
        'vs prior week: %{customdata[2]}<br>' +
        'Exponential fit: %{customdata[3]}<br>' +
        '<br>Top models<br>%{customdata[4]}<br>%{customdata[5]}<br>%{customdata[6]}' +
        '<extra></extra>',
    },
  ];

  if (CURRENT) {
    const i = N;
    traces.push(
      {
        type: 'bar',
        name: 'Current week (partial)',
        x: [CURRENT.week],
        y: [CURRENT.tokensT],
        width: BAR_WIDTH,
        marker: { color: PARTIAL },
        customdata: [
          [
            fmtDate(CURRENT.week),
            fmtT(CURRENT.tokensT),
            CURRENT.forecastT === undefined ? '—' : fmtT(CURRENT.forecastT),
            fmtT(expFn(i)),
            ...topLines(CURRENT.top),
          ],
        ],
        hovertemplate:
          '<b>Week of %{customdata[0]} · in progress</b><br>' +
          '%{customdata[1]} so far<br>' +
          'OpenRouter forecast: %{customdata[2]}<br>' +
          'Exponential fit: %{customdata[3]}<br>' +
          '<br>Top models<br>%{customdata[4]}<br>%{customdata[5]}<br>%{customdata[6]}' +
          '<extra></extra>',
      },
      ...(CURRENT.forecastT === undefined
        ? []
        : [
            {
              // An outline-only bar: transparent fill, colored outline.
              type: 'bar',
              name: 'OpenRouter forecast',
              x: [CURRENT.week],
              y: [CURRENT.forecastT],
              width: BAR_WIDTH,
              marker: { color: 'rgba(0, 0, 0, 0)', line: { color: BAR, width: 1 } },
              hoverinfo: 'skip',
            },
          ]),
    );
  }

  traces.push(
    {
      type: 'scatter',
      mode: 'lines',
      name: `Exponential fit (+${(WEEKLY * 100).toFixed(1)}%/wk)`,
      legendgroup: 'exp',
      x: fullX,
      y: FULL.map((_, i) => expFn(i)),
      line: { color: FIT, width: 2 },
      hoverinfo: 'skip',
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: '4-week projection',
      legendgroup: 'exp',
      showlegend: false,
      x: projX,
      y: projX.map((_, k) => expFn(N - 1 + k)),
      line: { color: FIT, width: 2, dash: 'dot' },
      opacity: 0.55,
      hoverinfo: 'skip',
    },
    {
      // The straight line crosses zero in the second week: draw it from the first positive week,
      // as the original does (and a log axis could not show the rest).
      type: 'scatter',
      mode: 'lines',
      name: 'Linear fit',
      legendgroup: 'lin',
      x: linX,
      y: linX.map((_, k) => linFn(linStart + k)),
      line: { color: LIN, width: 1.25, dash: 'dash' },
      hoverinfo: 'skip',
    },
  );

  /** End-of-line labels; `y` is an exponent on a log axis. */
  const labels = (log: boolean): Record<string, unknown>[] => {
    const y = (v: number): number => (log ? Math.log10(v) : v);
    return [
      {
        x: endX,
        y: y(expFn(fitEnd)),
        xref: 'x',
        yref: 'y',
        text: `<b>${narrow ? '' : 'exp · '}+${(WEEKLY * 100).toFixed(1)}%/wk</b>`,
        showarrow: false,
        xanchor: 'left',
        xshift: 6,
        font: { color: FIT, size: 10 },
      },
      {
        x: endX,
        y: y(linFn(fitEnd)),
        xref: 'x',
        yref: 'y',
        text: 'linear',
        showarrow: false,
        xanchor: 'left',
        xshift: 6,
        font: { color: LIN, size: 10 },
      },
    ];
  };

  const expIndex = traces.findIndex((t) => t['legendgroup'] === 'exp');
  const linIndex = traces.findIndex((t) => t['legendgroup'] === 'lin');

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'OpenRouter · tokens processed per week' },
      barmode: 'overlay',
      hovermode: 'closest',
      margin: { r: narrow ? 60 : 96 },
      xaxis: {
        type: 'date',
        tickformat: '%b',
        dtick: 'M1',
        range: [addWeeks(FIRST_WEEK, -1), addWeeks(endX, 1)],
      },
      yaxis: {
        title: { text: 'Tokens per week (T = trillion)' },
        ticksuffix: 'T',
        rangemode: 'tozero',
        ...(startLog ? logAxis : {}),
      },
      annotations: labels(startLog),
    },
    config: chartConfig(narrow),
  });

  const visibility = (index: number): unknown =>
    (chart.data[index] as { visible?: unknown } | undefined)?.visible ?? true;
  // The legend toggles traces with a restyle (the projection follows its fit: same
  // `legendgroup`). Keep the end-of-line labels in step with their fits.
  const offRestyle = chart.on('restyle', () => {
    const exp = visibility(expIndex);
    void chart.relayout({
      'annotations[0].visible': exp === true,
      'annotations[1].visible': visibility(linIndex) === true,
    });
  });

  segmented(
    toolbar,
    'Y axis',
    [
      { value: 'linear', text: 'Linear' },
      { value: 'log', text: 'Log' },
    ],
    (value) => {
      const log = value === 'log';
      const [expLabel, linLabel] = labels(log);
      void chart.relayout({
        'yaxis.type': value,
        ...(log
          ? { 'yaxis.range': logRange, 'yaxis.tickmode': 'array', 'yaxis.tickvals': logTicks }
          : { 'yaxis.autorange': true, 'yaxis.tickmode': 'auto', 'yaxis.tickvals': null }),
        'annotations[0].y': expLabel?.['y'],
        'annotations[1].y': linLabel?.['y'],
      });
    },
    startLog ? 'log' : 'linear',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      offRestyle();
      chart.destroy();
      dispose();
    },
  };
}
