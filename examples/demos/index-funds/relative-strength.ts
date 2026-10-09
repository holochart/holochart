import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  adj,
  BASE,
  BASE_DATE,
  colorOf,
  END,
  fmtDate,
  LABEL,
  type Ticker,
  WINDOW,
} from './analysis.mts';
import {
  chartConfig,
  frame,
  halfLabels,
  halfShapes,
  isNarrow,
  LOOK,
  rgba,
  settled,
} from './ui.mts';

/**
 * Relative strength against the S&P 500: the total-return price of QQQ, DIA, IWM and RSP (the
 * S&P 500 with every stock at the same weight) divided by SPY's, rebased to 100 at the start of
 * the four years. A line above 100 has beaten the S&P 500 since then, a rising line is beating it
 * now. A dotted `shape` marks 100 (SPY itself); RSP, a fund of the same 500 stocks, is dashed. End
 * labels are annotations in the right margin, moved apart where two would overlap; the halves are
 * marked with `halfShapes`. `customdata` gives each fund's lead or lag in the hover label.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: relative strength against the S&P 500',
  description:
    'QQQ, DIA, IWM and the equal-weight S&P 500 (RSP) divided by SPY, total return, rebased to 100 at the close of September 30, 2022.',
  tags: ['demo', 'line', 'scatter', 'date', 'shapes', 'annotations', 'hover', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const AGAINST: readonly Ticker[] = ['QQQ', 'DIA', 'IWM', 'RSP'];
const DASHED: ReadonlySet<Ticker> = new Set<Ticker>(['RSP']);

/** `t` over SPY on every session of the four years, 100 at the base close. */
function relative(t: Ticker): number[] {
  const a = adj(t);
  const s = adj('SPY');
  const base = (a[BASE] as number) / (s[BASE] as number);
  const out: number[] = [];
  for (let i = BASE; i <= END; i++) out.push(((a[i] as number) / (s[i] as number) / base) * 100);
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const lines = AGAINST.map((t) => ({ t, value: relative(t) }));
  const all = lines.flatMap((l) => l.value);
  const lo = Math.floor(Math.min(...all) / 5) * 5;
  const hi = Math.ceil((Math.max(...all) + 2) / 5) * 5;

  const traces = lines.map(({ t, value }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: `${t} · ${LABEL[t]}`,
    x: WINDOW,
    y: value,
    customdata: value.map((v) => v / 100 - 1),
    line: { color: colorOf(t), width: 1.6, dash: DASHED.has(t) ? 'dash' : 'solid' },
    hovertemplate: `${t} / SPY  %{y:.1f}  (%{customdata:+.1%})<extra></extra>`,
  }));

  // End labels, lowest first; a label less than 13 px above the one below it moves up (the plot
  // is about 150 px shorter than the chart).
  const pxPerUnit = Math.max((chartEl.clientHeight || 400) - 150, 120) / (hi - lo);
  const ends = lines
    .map(({ t, value }) => ({ t, v: value.at(-1) as number }))
    .sort((a, b) => a.v - b.v);
  let previous = -Infinity;
  const endLabels = ends.map(({ t, v }): LayoutAnnotation => {
    const at = Math.max(v * pxPerUnit, previous + 13);
    previous = at;
    return {
      x: WINDOW.at(-1) as string,
      y: v,
      xref: 'x',
      yref: 'y',
      text: `${t} ${v.toFixed(0)}`,
      showarrow: false,
      xanchor: 'left',
      xshift: 5,
      yshift: at - v * pxPerUnit,
      font: { color: colorOf(t), size: 10 },
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `Each fund divided by SPY, total return, ${fmtDate(BASE_DATE)} = 100`,
      },
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { r: narrow ? 52 : 72 },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Relative to SPY (start = 100)' },
        range: [lo, hi],
        dtick: 10,
      },
      shapes: [
        ...halfShapes(),
        {
          type: 'line',
          xref: 'x domain',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: 100,
          y1: 100,
          line: { color: rgba(LOOK.title, 0.7), width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        ...halfLabels('x', 'y domain', false, 0.075),
        ...endLabels,
        {
          xref: 'x',
          yref: 'y',
          x: WINDOW.at(-1) as string,
          y: 100,
          text: narrow ? 'SPY' : 'SPY = 100',
          showarrow: false,
          xanchor: 'left',
          xshift: 5,
          font: { color: LOOK.title, size: 10 },
        },
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
