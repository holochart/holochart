import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BASE_DATE, COLOR, fmtDate, growth, LABEL, type Ticker, usd } from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, settled } from './ui.mts';

/**
 * Growth of $10,000 in US stocks and in the other asset classes over the four years, dividends
 * and interest reinvested: the S&P 500 (SPY), international stocks (VXUS), US bonds (BND), long
 * Treasuries (TLT), gold (GLD) and T-bills (BIL). Lines on a date axis with the two halves marked
 * (`halfShapes`), cash dotted, and the final value at the end of every line as an annotation; the
 * labels are spread apart in pixels where two lines end close together.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: stocks, bonds, gold and cash',
  description:
    'Growth of $10,000 in SPY, VXUS, BND, TLT, GLD and BIL from October 2022 to September 2026, with the two halves marked.',
  tags: ['demo', 'line', 'date', 'shapes', 'annotations', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const SHOWN: readonly Ticker[] = ['SPY', 'VXUS', 'BND', 'TLT', 'GLD', 'BIL'];
/**
 * SPY keeps its color; the others take hues that are neither a half's (teal, amber) nor the
 * demo's rising and falling colors (green, red).
 */
const LINE: Readonly<Record<string, { color: string; dash: string }>> = {
  SPY: { color: COLOR.SPY, dash: 'solid' },
  VXUS: { color: '#9962c0', dash: 'solid' },
  BND: { color: '#b8267e', dash: 'solid' },
  TLT: { color: '#4b9fd8', dash: 'solid' },
  GLD: { color: '#997600', dash: 'solid' },
  BIL: { color: '#9a9db0', dash: 'dot' },
};

const Y_RANGE: [number, number] = [6000, 34_000];
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

  const paths = SHOWN.map((t) => ({ t, ...growth(t) }));
  const traces = paths.map(({ t, dates, value }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: LABEL[t],
    x: dates,
    y: value,
    line: { color: LINE[t]?.color, width: t === 'SPY' ? 2.25 : 1.5, dash: LINE[t]?.dash },
    hovertemplate: `${LABEL[t]} (${t})  %{y:$,.0f}<extra></extra>`,
  }));

  // End-of-line labels, spread to at least 12 px apart on the fixed y range.
  const plotHeight = Math.max(120, chartEl.clientHeight - MARGIN_T - MARGIN_B);
  const finals = paths.map(({ t, dates, value }) => ({
    t,
    x: dates.at(-1) as string,
    v: value.at(-1) as number,
  }));
  const shifts = spread(
    finals.map((f) => ((f.v - Y_RANGE[0]) / (Y_RANGE[1] - Y_RANGE[0])) * plotHeight),
    12,
  );
  const ends = finals.map((f, i): LayoutAnnotation => ({
    x: f.x,
    y: f.v,
    xref: 'x',
    yref: 'y',
    text: `${narrow ? f.t : LABEL[f.t]} ${usd(f.v)}`,
    showarrow: false,
    xanchor: 'left',
    xshift: 4,
    yshift: shifts[i] ?? 0,
    font: { color: LINE[f.t]?.color, size: narrow ? 9 : 10 },
  }));

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `$10,000 in stocks, bonds, gold and cash since ${fmtDate(BASE_DATE)}`,
      },
      hovermode: 'x unified',
      margin: { t: narrow ? 64 : MARGIN_T, b: MARGIN_B, r: narrow ? 76 : 160 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Value (USD)' },
        tickprefix: '$',
        tickformat: ',.0f',
        range: Y_RANGE,
        dtick: 4000,
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
