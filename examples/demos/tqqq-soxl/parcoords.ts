import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { FUNDS, LAST_DATE, pct, RETURN_SCALE, yearStats, type YearStats } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * Every year of both funds as one line through seven axes (`parcoords`): the fund (an ordinal axis
 * from `tickvals` / `ticktext`), the year, the total return, volatility, deepest drawdown, best and
 * worst day, and the share of up days — full years 2011–2025 and 2026 to date. Lines are colored by
 * the year's return on the diverging return scale (clamped at ±100%), so the red bundle shows what
 * a losing year looks like on every other axis: high volatility, a deep drawdown and fewer than
 * half the days up. Drag along an axis to brush a range (`constraintrange`); the other lines dim.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: every year in parallel coordinates',
  description:
    'Parallel coordinates of TQQQ and SOXL by year: return, volatility, max drawdown, best and worst day and share of up days, colored by return.',
  tags: ['demo', 'parcoords', 'colorscale', 'statistical', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const FIRST_YEAR = 2011;
const RETURN_TICKS = [-0.5, 0, 0.5, 1, 1.5, 2, 2.5];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const rows: { fund: number; s: YearStats }[] = FUNDS.flatMap((f, k) =>
    yearStats(f)
      .filter((s) => s.year >= FIRST_YEAR)
      .map((s) => ({ fund: k, s })),
  );
  const col = (get: (s: YearStats) => number): number[] => rows.map((r) => get(r.s));
  const ytd = LAST_DATE.slice(0, 4);

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'parcoords',
        labelfont: { size: 11 },
        tickfont: { size: 9 },
        line: {
          color: col((s) => s.ret),
          colorscale: RETURN_SCALE,
          cmin: -1,
          cmax: 1,
          showscale: true,
          colorbar: {
            title: { text: 'Return', side: 'right' },
            tickvals: [-1, -0.5, 0, 0.5, 1],
            ticktext: ['−100%', '−50%', '0%', '+50%', '+100% and up'],
            thickness: 12,
          },
        },
        dimensions: [
          {
            label: 'Fund',
            values: rows.map((r) => r.fund),
            tickvals: [0, 1],
            ticktext: [...FUNDS],
            range: [-0.15, 1.15],
          },
          {
            label: 'Year',
            values: col((s) => s.year),
            tickvals: [2011, 2014, 2017, 2020, 2023, Number(ytd)],
            ticktext: ['2011', '2014', '2017', '2020', '2023', `${ytd} YTD`],
          },
          {
            label: 'Return',
            values: col((s) => s.ret),
            tickvals: RETURN_TICKS,
            ticktext: RETURN_TICKS.map((v) => (v === 0 ? '0%' : pct(v, 0))),
          },
          { label: 'Volatility', values: col((s) => s.vol), tickformat: '.0%' },
          { label: 'Max drawdown', values: col((s) => s.maxDrawdown), tickformat: '.0%' },
          { label: 'Best day', values: col((s) => s.best), tickformat: '+.0%' },
          { label: 'Worst day', values: col((s) => s.worst), tickformat: '.0%' },
          { label: 'Up days', values: col((s) => s.upShare), tickformat: '.0%' },
        ],
      },
    ],
    layout: {
      title: { text: narrow ? '' : `TQQQ and SOXL, every year ${FIRST_YEAR}–${ytd}` },
      margin: { t: narrow ? 48 : 80, l: 48, r: 120, b: 32 },
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
