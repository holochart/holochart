import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  FUNDS,
  pct,
  TICKERS,
  UNDERLYING,
  yearStats,
  type Ticker,
  type YearStats,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Risk and return year by year: one bubble per ticker per calendar year at its annualized
 * volatility (x) and total return (y), sized by the year's deepest drawdown, colored per ticker (a
 * fund and its reference share a hue; the references lighter). Animated with `frames` (one per
 * year, 2011 to 2026 year to date), a Play / Pause update menu and a year slider; `ids` match each
 * ticker's bubble across frames so it glides, and a thin line joins each fund to its unleveraged
 * reference. Behind them, every year of every ticker as a faint dot, so the current year sits in
 * its history. Shown (and tested) on 2025: TQQQ +34% on 70% volatility next to QQQ +21% on 24%.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: risk and return, year by year',
  description:
    'Animated bubbles of each year’s return against volatility for TQQQ, QQQ, SOXL and SOXX, sized by max drawdown, with play and a year slider.',
  tags: ['demo', 'bubble', 'scatter', 'animation', 'frames', 'sliders', 'updatemenus', 'financial'],
  size: { width: 960, height: 540 },
  testTolerance: 0.004,
};

const FIRST_YEAR = 2011;
const START_YEAR = 2025;
/** Bubble diameter of a 100% drawdown, in px (sized by area). */
const MAX_SIZE = 44;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const stats = new Map<Ticker, Map<number, YearStats>>(
    TICKERS.map((t) => [t, new Map(yearStats(t).map((s) => [s.year, s]))]),
  );
  const years = [...(stats.get('TQQQ') as Map<number, YearStats>).keys()].filter(
    (y) => y >= FIRST_YEAR,
  );
  const yearLabel = (y: number): string =>
    (stats.get('TQQQ')?.get(y)?.partial ?? false) ? `${y} YTD` : String(y);
  const at = (t: Ticker, y: number): YearStats => stats.get(t)?.get(y) as YearStats;
  const sizeref = 1 / MAX_SIZE ** 2;

  /** The moving traces of one year: a fund-to-reference line per family, then a bubble per ticker. */
  const moving = (year: number): Record<string, unknown>[] => [
    ...FUNDS.map((f) => {
      const a = at(UNDERLYING[f], year);
      const b = at(f, year);
      return { x: [a.vol, b.vol], y: [a.ret, b.ret] };
    }),
    ...TICKERS.map((t) => {
      const s = at(t, year);
      return {
        x: [s.vol],
        y: [s.ret],
        ids: [t],
        text: [t],
        customdata: [[yearLabel(year), pct(s.maxDrawdown)]],
        marker: { size: [Math.abs(s.maxDrawdown)] },
      };
    }),
  ];

  const first = moving(START_YEAR);
  const links = FUNDS.map((f, k): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: `${f} vs ${UNDERLYING[f]}`,
    showlegend: false,
    hoverinfo: 'skip',
    line: { color: COLOR[f], width: 1, dash: 'dot' },
    ...first[k],
  }));
  const bubbles = TICKERS.map((t, k): ScatterTrace => {
    const fund = t === 'TQQQ' || t === 'SOXL';
    return {
      type: 'scatter',
      mode: 'markers+text',
      name: t,
      ...first[FUNDS.length + k],
      textposition: 'middle right',
      textfont: { color: COLOR[t], size: 11 },
      marker: {
        ...(first[FUNDS.length + k]?.['marker'] as object),
        color: COLOR[t],
        opacity: fund ? 0.85 : 0.7,
        sizemode: 'area',
        sizeref,
        sizemin: 4,
        line: { color: LOOK.title, width: 1 },
      },
      hovertemplate:
        `<b>${t} %{customdata[0]}</b><br>Return %{y:+.1%}<br>Volatility %{x:.1%}<br>` +
        `Max drawdown %{customdata[1]}<extra></extra>`,
    };
  });
  // Every year of every ticker, faint: the history the moving bubbles step through.
  const history = TICKERS.map((t): ScatterTrace => {
    const all = years.map((y) => at(t, y));
    return {
      type: 'scatter',
      mode: 'markers',
      name: `${t}, every year`,
      showlegend: false,
      x: all.map((s) => s.vol),
      y: all.map((s) => s.ret),
      text: years.map(yearLabel),
      marker: { color: COLOR[t], size: 5, opacity: 0.3 },
      hovertemplate: `${t} %{text}: %{y:+.1%} on %{x:.0%} volatility<extra></extra>`,
    };
  });

  const transition = 450;
  const chart: Chart = createChart(chartEl, {
    data: [...links, ...bubbles, ...history],
    frames: years.map((y) => ({ name: String(y), data: moving(y) })),
    layout: {
      title: { text: narrow ? '' : 'Return against volatility, one bubble per ticker and year' },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 48 : 72, b: 112 },
      xaxis: {
        title: { text: 'Annualized volatility of daily returns' },
        range: [0, 1.55],
        tickformat: '.0%',
      },
      yaxis: {
        title: { text: 'Total return in the year' },
        range: [-1.18, 2.85],
        tickvals: [-1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5],
        ticktext: [-1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5].map((v) => (v === 0 ? '0%' : pct(v, 0))),
        zeroline: true,
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 1,
          xanchor: 'left',
          yanchor: 'top',
          showarrow: false,
          align: 'left',
          font: { size: 10, color: LOOK.tick },
          text: `Bubble area: max drawdown in the year<br>${years.at(-1)}*: year to date`,
        },
      ],
      updatemenus: [
        {
          type: 'buttons',
          direction: 'left',
          showactive: false,
          x: 0,
          xanchor: 'left',
          y: -0.16,
          yanchor: 'top',
          pad: { t: 12 },
          buttons: [
            {
              label: 'Play',
              method: 'animate',
              args: [
                null,
                {
                  frame: { duration: 900, redraw: false },
                  transition: { duration: transition, easing: 'cubic-in-out' },
                  fromcurrent: true,
                },
              ],
            },
            {
              label: 'Pause',
              method: 'animate',
              args: [
                [null],
                {
                  mode: 'immediate',
                  frame: { duration: 0, redraw: false },
                  transition: { duration: 0 },
                },
              ],
            },
          ],
        },
      ],
      sliders: [
        {
          active: years.indexOf(START_YEAR),
          x: 0.14,
          len: 0.86,
          y: -0.16,
          yanchor: 'top',
          pad: { t: 12 },
          currentvalue: { prefix: 'Year: ', xanchor: 'right' },
          transition: { duration: transition, easing: 'cubic-in-out' },
          steps: years.map((y) => ({
            label: narrow ? `’${String(y).slice(2)}` : yearLabel(y).replace(' YTD', '*'),
            method: 'animate',
            args: [
              [String(y)],
              {
                mode: 'immediate',
                frame: { duration: transition, redraw: false },
                transition: { duration: transition },
              },
            ],
          })),
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
