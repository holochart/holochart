import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BASE_DATE, fmtDate, growth, LABEL, pct, STOCKS, type Ticker, usd } from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, settled } from './ui.mts';

/**
 * Growth of $10,000 in each of eight of the S&P 500's largest companies (`STOCKS`, all among the
 * fund's eleven largest holdings) over the four years, against the index itself (SPY) and its
 * equal-weight version (RSP), which holds every company at the same weight and so has little of
 * these eight. The y axis is logarithmic (`type: 'log'`, dollar ticks through `tickvals` /
 * `ticktext`), so a line's slope is its rate of growth and a stock that multiplied almost
 * nineteen-fold fits on the same chart as one that gained a third. The two funds are thicker,
 * neutral lines (the equal-weight one dashed). Every line ends in a label with its final value;
 * four of them finish within a few percent of each other, so the labels are spread apart in
 * pixels (annotations with `yshift`). The halves are marked with `halfShapes`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: eight megacap stocks against the index',
  description:
    'Growth of $10,000 in NVIDIA, Apple, Microsoft, Amazon, Alphabet, Meta, Tesla and Broadcom on a log axis, with SPY and equal-weight RSP for reference.',
  tags: ['demo', 'line', 'date', 'log', 'shapes', 'annotations', 'financial'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

/** One hue per stock; the two reference funds are neutral so they read as the backdrop. */
const LINE: Readonly<Record<string, string>> = {
  NVDA: '#118e36',
  AAPL: '#9962c0',
  MSFT: '#5e74d5',
  AMZN: '#cc540a',
  GOOGL: '#ea2a37',
  META: '#4b9fd8',
  TSLA: '#b8267e',
  AVGO: '#997600',
  SPY: '#eceef4',
  RSP: '#9a9db0',
};
const REFERENCE: readonly Ticker[] = ['SPY', 'RSP'];
/** Short names for the end labels (the legend has the full ones). */
const SHORT: Readonly<Record<string, string>> = { SPY: 'S&P 500', RSP: 'Equal weight' };

const Y_TICKS = [5000, 10_000, 20_000, 50_000, 100_000, 200_000];
const Y_RANGE: [number, number] = [Math.log10(3600), Math.log10(240_000)];
const MARGIN_T = 80;
const MARGIN_B = 48;

/**
 * Vertical shifts in pixels (up is positive) that keep labels at heights `at` (pixels) at least
 * `gap` apart: neighbors that are too close are pushed apart by the same amount until none are.
 */
function spread(at: readonly number[], gap: number): number[] {
  const order = at.map((_, i) => i).sort((a, b) => (at[a] as number) - (at[b] as number));
  const pos = order.map((i) => at[i] as number);
  for (let pass = 0; pass < 100; pass++) {
    let moved = false;
    for (let k = 1; k < pos.length; k++) {
      const short = gap - ((pos[k] as number) - (pos[k - 1] as number));
      if (short > 0.01) {
        pos[k - 1] = (pos[k - 1] as number) - short / 2;
        pos[k] = (pos[k] as number) + short / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const shift = at.map(() => 0);
  order.forEach((i, k) => {
    shift[i] = (pos[k] as number) - (at[i] as number);
  });
  return shift;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const shown: readonly Ticker[] = [...STOCKS, ...REFERENCE];
  const paths = shown.map((t) => ({ t, reference: REFERENCE.includes(t), ...growth(t) }));
  const traces = paths.map(({ t, reference, dates, value }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: LABEL[t],
    x: dates,
    y: value,
    line: {
      color: LINE[t],
      width: reference ? 2.75 : 1.25,
      dash: t === 'RSP' ? 'dash' : 'solid',
    },
    hovertemplate: `${LABEL[t]} (${t})  %{y:$,.0f}<extra></extra>`,
  }));

  // End-of-line labels, spread to at least 12 px apart on the fixed log range.
  const plotHeight = Math.max(120, chartEl.clientHeight - MARGIN_T - MARGIN_B);
  const finals = paths.map(({ t, dates, value }) => ({
    t,
    x: dates.at(-1) as string,
    v: value.at(-1) as number,
  }));
  const shifts = spread(
    finals.map((f) => ((Math.log10(f.v) - Y_RANGE[0]) / (Y_RANGE[1] - Y_RANGE[0])) * plotHeight),
    12,
  );
  const ends = finals.map((f, i): LayoutAnnotation => ({
    x: f.x,
    y: Math.log10(f.v),
    xref: 'x',
    yref: 'y',
    text: narrow ? `${f.t} ${pct(f.v / 10_000 - 1)}` : `${SHORT[f.t] ?? LABEL[f.t]} ${usd(f.v)}`,
    showarrow: false,
    xanchor: 'left',
    xshift: 4,
    yshift: shifts[i] ?? 0,
    font: { color: LINE[f.t], size: narrow ? 9 : 10 },
  }));

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `$10,000 in each of eight of the largest S&P 500 stocks since ${fmtDate(BASE_DATE)}`,
      },
      hovermode: 'x unified',
      margin: { t: narrow ? 88 : MARGIN_T, b: MARGIN_B, r: narrow ? 76 : 136 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: {
        type: 'log',
        title: { text: 'Value (USD, log scale)' },
        range: Y_RANGE,
        tickvals: Y_TICKS,
        ticktext: Y_TICKS.map(usd),
      },
      shapes: halfShapes(),
      annotations: [...halfLabels(), ...ends],
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
