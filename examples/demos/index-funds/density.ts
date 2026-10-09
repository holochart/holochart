import { createChart, type Chart, type LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  correlation,
  dailyReturns,
  fmtDate,
  linreg,
  pct,
  PERIODS,
  type Half,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, periodPicker, rgba, settled } from './ui.mts';

/**
 * Where the days pile up: the Russell 2000's daily return (IWM, y) against the S&P 500's (SPY, x)
 * as a 2D density (`histogram2dcontour` on half-percent bins, filled bands from the plot's
 * transparent to the half's color at explicit levels, `contours.start` / `end` / `size`), with the
 * individual sessions as faint markers on top and a dashed 1:1 line for reference: on a day above
 * the line small caps beat large caps. Both axes span ±4% with square pixels (`scaleanchor`); the
 * nine sessions when either fund moved more than 4% are outside (three in the first half, six in
 * the second). The contour levels are the same for both halves, so the period picker (which swaps
 * the half with `chart.react`) compares like with like; a note gives the half's correlation and
 * least-squares slope.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: small caps against the S&P 500, day by day',
  description:
    'A 2D density contour of IWM’s daily return against SPY’s with the sessions as markers and a 1:1 line, for either half.',
  tags: [
    'demo',
    'histogram2dcontour',
    'contour',
    'scatter',
    'colorscale',
    'scaleanchor',
    'react',
    'financial',
  ],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

/** Both axes run from −SPAN to +SPAN percent. */
const SPAN = 4;
/** Bin size, in percent. */
const BIN = 0.5;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  function figure(half: Half): {
    data: Record<string, unknown>[];
    layout: Record<string, unknown>;
  } {
    const spy = dailyReturns('SPY', half);
    const iwm = dailyReturns('IWM', half);
    const x = spy.r.map((v) => v * 100);
    const y = iwm.r.map((v) => v * 100);
    const color = PERIODS[half].color;
    const fit = linreg(spy.r, iwm.r);
    const above = y.filter((v, i) => v > (x[i] as number)).length;
    const note: LayoutAnnotation = {
      xref: 'paper',
      yref: 'paper',
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      align: 'left',
      showarrow: false,
      font: { size: 10, color: LOOK.text },
      text:
        `<b>${PERIODS[half].label}</b>, ${x.length} sessions<br>` +
        `Correlation ${correlation('SPY', 'IWM', half).toFixed(2)} · ` +
        `slope ${fit.m.toFixed(2)}<br>` +
        `IWM beat SPY on ${above} sessions`,
    };
    return {
      data: [
        {
          type: 'histogram2dcontour',
          name: 'Sessions per bin',
          x,
          y,
          xbins: { start: -SPAN - BIN, end: SPAN + BIN, size: BIN },
          ybins: { start: -SPAN - BIN, end: SPAN + BIN, size: BIN },
          // Half-integer levels: a level equal to a bin's count would trace degenerate islands.
          contours: { coloring: 'fill', start: 1.5, end: 25.5, size: 4 },
          colorscale: [
            [0, rgba(color, 0)],
            [1, rgba(color, 0.85)],
          ],
          zmin: 0,
          zmax: 26,
          line: { color: rgba(color, 0.7), width: 0.75, smoothing: 1 },
          colorbar: {
            title: { text: `Sessions per ${BIN}% bin` },
            thickness: 10,
            len: 0.7,
          },
          hoverinfo: 'skip',
        },
        {
          type: 'scatter',
          mode: 'lines',
          name: 'IWM = SPY',
          x: [-SPAN, SPAN],
          y: [-SPAN, SPAN],
          line: { color: LOOK.text, width: 1, dash: 'dash' },
          hoverinfo: 'skip',
        },
        {
          type: 'scatter',
          mode: 'markers',
          name: 'Sessions',
          x,
          y,
          text: spy.dates.map(
            (d, i) =>
              `<b>${fmtDate(d)}</b><br>SPY ${pct(spy.r[i] as number, 2)}<br>` +
              `IWM ${pct(iwm.r[i] as number, 2)}`,
          ),
          marker: { color: LOOK.title, size: 3, opacity: 0.35 },
          hovertemplate: '%{text}<extra></extra>',
        },
      ],
      layout: {
        title: {
          text: narrow ? '' : `Russell 2000 against S&P 500 daily returns, ${PERIODS[half].label}`,
        },
        hovermode: 'closest',
        showlegend: false,
        xaxis: {
          title: { text: 'SPY daily return' },
          range: [-SPAN, SPAN],
          ticksuffix: '%',
          dtick: narrow ? 2 : 1,
          zeroline: true,
          zerolinecolor: LOOK.zero,
          constrain: 'domain',
        },
        yaxis: {
          title: { text: 'IWM daily return' },
          range: [-SPAN, SPAN],
          ticksuffix: '%',
          dtick: narrow ? 2 : 1,
          zeroline: true,
          zerolinecolor: LOOK.zero,
          scaleanchor: 'x',
          constrain: 'domain',
        },
        annotations: [
          note,
          {
            xref: 'x',
            yref: 'y',
            x: SPAN * 0.86,
            y: SPAN * 0.86,
            xanchor: 'right',
            yanchor: 'bottom',
            xshift: -6,
            showarrow: false,
            text: 'IWM = SPY',
            font: { size: 9, color: LOOK.text },
          },
        ],
      },
    };
  }

  const chart: Chart = createChart(chartEl, { ...figure('first'), config: chartConfig(narrow) });
  periodPicker(toolbar, (half) => {
    void chart.react({ ...figure(half), config: chartConfig(narrow) });
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
