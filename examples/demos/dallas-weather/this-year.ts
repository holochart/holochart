import { createChart, type Chart, type IndicatorTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLD,
  CURRENT_YEAR,
  daysOf,
  DOM,
  fmtDate,
  HOT,
  LAST_DATE,
  MONTH,
  NEUTRAL,
  NORMAL_FROM,
  NORMAL_TO,
  PRCP,
  RAIN,
  THUNDER,
  TMAX,
  TMIN,
  WARM,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { fmtDay } from './years-events.mts';

/**
 * The year so far against a normal year: five `indicator` traces in a row (`domain`), each a
 * number with a `delta` against the 1991–2020 average for the same part of the year (January 1
 * through the calendar day of the last reading, computed from the daily record). Days of 100 °F
 * or more, the hottest day, rain so far, freezing nights and days with thunder.
 *
 * The delta colors say what the difference means rather than "good" or "bad"
 * (`delta.increasing.color` / `decreasing.color`): more heat is red and less is blue, more rain is
 * cyan and less is orange, more freezing nights is blue. Years with gaps in the rain record
 * (1997, 1998) or with no thunder reports (1998) are left out of that average. Narrow containers
 * (phones) get two rows.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: this year against a normal year',
  description:
    'Five KPI cards for the current year so far (100 °F days, hottest day, rain, freezing nights, thunder days), each with its difference from the 1991–2020 average for the same part of the year.',
  tags: ['demo', 'indicator', 'kpi', 'dashboard', 'delta', 'number'],
  size: { width: 960, height: 300 },
  testTolerance: 0.004,
};

/** What one year had from January 1 through the calendar day of `LAST_DATE`. */
interface SoFar {
  days100: number;
  hottest: number;
  rain: number;
  /** Share of the days with a rain reading. */
  rainCoverage: number;
  freezes: number;
  thunder: number;
}

const END_MONTH = Number(LAST_DATE.slice(5, 7));
const END_DOM = Number(LAST_DATE.slice(8, 10));

function soFar(year: number): SoFar {
  const idx = daysOf(year).filter(
    (i) =>
      (MONTH[i] as number) < END_MONTH || (MONTH[i] === END_MONTH && (DOM[i] as number) <= END_DOM),
  );
  const highs = idx.map((i) => TMAX[i]).filter((v): v is number => v !== null && v !== undefined);
  const lows = idx.map((i) => TMIN[i]).filter((v): v is number => v !== null && v !== undefined);
  const rain = idx.map((i) => PRCP[i]).filter((v): v is number => v !== null && v !== undefined);
  return {
    days100: highs.filter((t) => t >= 100).length,
    hottest: Math.max(...highs),
    rain: rain.reduce((a, b) => a + b, 0),
    rainCoverage: rain.length / idx.length,
    freezes: lows.filter((t) => t <= 32).length,
    thunder: idx.filter((i) => THUNDER.has(i)).length,
  };
}

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const small = (s: string): string => `<span style="font-size:0.8em">${s}</span>`;

interface Card {
  name: string;
  value: number;
  normal: number;
  /** d3 format of the number and of the delta, and the unit after the number. */
  format: string;
  suffix: string;
  /** Delta colors when above and below normal. */
  more: string;
  less: string;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const now = soFar(CURRENT_YEAR);
  const past = Array.from({ length: NORMAL_TO - NORMAL_FROM + 1 }, (_, k) =>
    soFar(NORMAL_FROM + k),
  );
  const normal = {
    days100: mean(past.map((p) => p.days100)),
    hottest: mean(past.map((p) => p.hottest)),
    rain: mean(past.filter((p) => p.rainCoverage >= 0.95).map((p) => p.rain)),
    freezes: mean(past.map((p) => p.freezes)),
    // A year with no thunder at all by this date is a gap in the reports, not a quiet year.
    thunder: mean(past.filter((p) => p.thunder > 0).map((p) => p.thunder)),
  };

  const cards: Card[] = [
    {
      name: 'Days of 100 °F or more',
      value: now.days100,
      normal: normal.days100,
      format: '.0f',
      suffix: '',
      more: HOT,
      less: COLD,
    },
    {
      name: 'Hottest day',
      value: now.hottest,
      normal: normal.hottest,
      format: '.0f',
      suffix: ' °F',
      more: HOT,
      less: COLD,
    },
    {
      name: 'Rain so far',
      value: now.rain,
      normal: normal.rain,
      format: '.1f',
      suffix: ' in',
      more: RAIN,
      less: WARM,
    },
    {
      name: 'Freezing nights',
      value: now.freezes,
      normal: normal.freezes,
      format: '.0f',
      suffix: '',
      more: COLD,
      less: WARM,
    },
    {
      name: 'Days with thunder',
      value: now.thunder,
      normal: normal.thunder,
      format: '.0f',
      suffix: '',
      more: RAIN,
      less: NEUTRAL,
    },
  ];

  /** Paper domain of card `k`: one row of five, or rows of three and two on phones. */
  const domain = (k: number): { x: [number, number]; y: [number, number] } => {
    if (!narrow) {
      const w = 1 / cards.length;
      return { x: [k * w + 0.012, (k + 1) * w - 0.012], y: [0.14, 0.78] };
    }
    const top = k < 3;
    const n = top ? 3 : 2;
    const j = top ? k : k - 3;
    const w = 1 / n;
    return { x: [j * w + 0.02, (j + 1) * w - 0.02], y: top ? [0.56, 0.84] : [0.04, 0.32] };
  };

  const traces = cards.map((c, k): IndicatorTrace => ({
    type: 'indicator',
    mode: 'number+delta',
    name: c.name,
    value: c.value,
    number: {
      valueformat: c.format,
      suffix: c.suffix,
      font: { size: narrow ? 22 : 40, color: LOOK.title },
    },
    delta: {
      reference: c.normal,
      // One decimal for the differences: the averages are not whole numbers.
      valueformat: '.1f',
      suffix: c.suffix,
      increasing: { color: c.more },
      decreasing: { color: c.less },
      font: { size: narrow ? 11 : 15 },
    },
    title: {
      text: `${c.name}<br>${small(`normal ${c.normal.toFixed(1)}${c.suffix}`)}`,
      font: { size: narrow ? 10 : 13 },
    },
    domain: domain(k),
  }));

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `${CURRENT_YEAR} so far (Jan 1 to ${fmtDay(LAST_DATE)}) against the ${NORMAL_FROM}–${NORMAL_TO} average`,
      },
      margin: { l: 16, r: 16, t: narrow ? 16 : 56, b: 28 },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.5,
          y: 0,
          yanchor: 'top',
          showarrow: false,
          text: narrow
            ? `Through ${fmtDate(LAST_DATE)}; normal is ${NORMAL_FROM}–${NORMAL_TO}, same dates`
            : `Dallas Love Field through ${fmtDate(LAST_DATE)}. "Normal" is the ${NORMAL_FROM}–${NORMAL_TO} average for January 1 to ${fmtDay(LAST_DATE)}; the small figure is the difference from it.`,
          font: { size: 10, color: LOOK.tick },
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
