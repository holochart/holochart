import {
  createChart,
  type BarpolarTrace,
  type Chart,
  type Figure,
  type LayoutPolarRadialaxis,
  type ScatterpolarTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  COMMON_START,
  DOWN,
  FUNDS,
  MONTH_NAMES,
  periodReturns,
  type Fund,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Seasonality of TQQQ and SOXL: for each calendar month, the median return of that month over
 * every full month since SOXL's inception (16–17 Januaries, Februaries, …), as `barpolar` bars on
 * a clockwise month axis with January at the top (`angularaxis.direction: 'clockwise'`,
 * `rotation: 90`). The two funds sit side by side in each sector (`width` and `offset`, `polar.barmode: 'overlay'`).
 *
 * Negative values on a polar radius: the radial axis starts below zero
 * (`radialaxis.range: [−14, 20]`), so 0% is a ring part-way out (thicker, from `tickvals` plus a
 * closed `scatterpolar` line), bars grow outward from it for gains and inward for losses (the
 * default `base` of 0), and a losing month's bar is also outlined in red (`marker.line.color`), so
 * the sign never rests on position alone. Medians rather than means, because one month
 * (SOXL +165% in Apr 2026) would otherwise set April's bar on its own.
 *
 * The "Show" toggle swaps in the win rate (share of years in which the month closed up) with
 * `chart.react(…)`, on a 0–100% radius with the 50% ring marked: the same seasonality, without
 * the magnitudes.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: seasonality by calendar month',
  description:
    'Median monthly return (or win rate) of TQQQ and SOXL for each calendar month since 2010, as polar bars.',
  tags: ['demo', 'polar', 'barpolar', 'scatterpolar', 'categorical', 'react'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

type Stat = 'median' | 'win';

interface MonthStats {
  median: number[];
  win: number[];
  years: number[];
}

function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function monthStats(fund: Fund): MonthStats {
  const months = periodReturns(fund, 'month', COMMON_START).filter((p) => !p.partial);
  const by = MONTH_NAMES.map((_, k) => months.filter((p) => p.month === k + 1).map((p) => p.ret));
  return {
    median: by.map((v) => median(v) * 100),
    win: by.map((v) => (v.filter((r) => r > 0).length / v.length) * 100),
    years: by.map((v) => v.length),
  };
}

const RANGE: Record<Stat, [number, number]> = { median: [-14, 20], win: [0, 100] };
const TICKS: Record<Stat, number[]> = { median: [-10, 0, 10, 20], win: [25, 50, 75, 100] };
/** The reference ring: 0% return, or a 50% win rate. */
const RING: Record<Stat, number> = { median: 0, win: 50 };

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const stats = Object.fromEntries(FUNDS.map((f) => [f, monthStats(f)])) as Record<
    Fund,
    MonthStats
  >;

  const figure = (stat: Stat): Figure => {
    const bars = FUNDS.map((fund, k): BarpolarTrace => {
      const s = stats[fund];
      const r = s[stat];
      const below = r.map((v) => v < RING[stat]);
      return {
        type: 'barpolar',
        name: fund,
        theta: MONTH_NAMES,
        r,
        width: 0.42,
        offset: k === 0 ? -0.44 : 0.02,
        customdata: s.years.map((n, i) => [n, s.median[i], s.win[i]]),
        marker: {
          color: COLOR[fund],
          opacity: 0.85,
          line: { color: below.map((b) => (b ? DOWN : COLOR[fund])), width: 1.5 },
        },
        hovertemplate:
          `${fund}, %{theta}<br>median <b>%{customdata[1]:+.1f}%</b> · ` +
          'up in <b>%{customdata[2]:.0f}%</b> of %{customdata[0]} years<extra></extra>',
      };
    });
    // A closed circle on the reference ring, finer than the 12-gon a category axis would give.
    const ring: ScatterpolarTrace = {
      type: 'scatterpolar',
      mode: 'lines',
      name: stat === 'median' ? '0% return' : '50% win rate',
      r: Array.from({ length: 121 }, () => RING[stat]),
      theta: Array.from({ length: 121 }, (_, i) => i * 3),
      thetaunit: 'degrees',
      subplot: 'polar2',
      line: { color: LOOK.text, width: 1.25, dash: 'dot' },
      hoverinfo: 'skip',
    };
    const radial: LayoutPolarRadialaxis = {
      range: RANGE[stat],
      tickvals: TICKS[stat],
      ticksuffix: '%',
      hoverformat: stat === 'median' ? '+.1f' : '.0f',
      // Along the Mar–Apr boundary, beside March's short bars.
      angle: 15,
      tickangle: 15,
      tickfont: { size: 9 },
    };
    return {
      data: [...bars, ring],
      layout: {
        title: {
          text: narrow
            ? ''
            : stat === 'median'
              ? 'Median return by calendar month, full months since Apr 2010'
              : 'Share of years each month closed up, since Apr 2010',
        },
        legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
        margin: { t: 72, b: 32, l: 24, r: 24 },
        polar: {
          // Side by side, not stacked: the offsets only move bars within a sector.
          barmode: 'overlay',
          domain: { x: [0, 1], y: [0, 1] },
          angularaxis: { direction: 'clockwise', rotation: 90, type: 'category' },
          radialaxis: radial,
        },
        // A transparent twin of the subplot for the reference ring: a numeric angular axis
        // draws it as a smooth circle, on the same radial range.
        polar2: {
          domain: { x: [0, 1], y: [0, 1] },
          bgcolor: 'rgba(0, 0, 0, 0)',
          angularaxis: { visible: false, direction: 'clockwise', rotation: 90 },
          radialaxis: { ...radial, visible: false },
        },
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('median'));

  segmented<Stat>(
    toolbar,
    'Show',
    [
      { value: 'median', text: 'Median return' },
      { value: 'win', text: 'Win rate' },
    ],
    (value) => void chart.react(figure(value)),
    'median',
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
