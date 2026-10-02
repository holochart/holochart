import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, HOT, MONTH_NAMES, N, slot, slotDate, TMAX, WARM, YEAR, YEARS } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { alpha, fmtDay } from './years-events.mts';

/**
 * Has the calendar shifted? The average daily high through the year for three 30-year periods
 * (the first 30 complete years, the middle 30 and the last 30), as `scatter` lines on a
 * day-of-year date axis (dates in the year 2000, `tickformat: '%b'`). Each curve is a 15-day
 * centered moving average over all the days of the period, wrapping around the year end, so
 * February 29 and single odd days do not show.
 *
 * The lower panel shares the x axis (`yaxis2` with its own `domain`) and draws the difference,
 * last period minus first, filled to zero (`fill: 'tozeroy'`). The annotation marks the time of
 * year that warmed the most, and the title names the months with the largest and smallest
 * average change, all computed from the curves.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: which part of the year warmed',
  description:
    'Average daily high through the year for three 30-year periods on a day-of-year axis, with a lower panel showing the last period minus the first.',
  tags: ['demo', 'scatter', 'lines', 'date', 'subplots', 'fill', 'annotations'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

const SPAN = 30;
/** Half-width of the moving average, in days (15 days in all). */
const HALF = 7;
const SLOTS = 366;

/** The smoothed average high of each calendar day over the years `from`–`to`. */
function curve(from: number, to: number): number[] {
  const sum = new Array<number>(SLOTS).fill(0);
  const count = new Array<number>(SLOTS).fill(0);
  for (let i = 0; i < N; i++) {
    const t = TMAX[i];
    const y = YEAR[i] as number;
    if (t === null || t === undefined || y < from || y > to) continue;
    const s = slot(i);
    sum[s] = (sum[s] as number) + t;
    count[s] = (count[s] as number) + 1;
  }
  // Pooled over the window, so a slot with few readings (Feb 29) weighs what it should.
  return sum.map((_, s) => {
    let a = 0;
    let n = 0;
    for (let d = -HALF; d <= HALF; d++) {
      const k = (s + d + SLOTS) % SLOTS;
      a += sum[k] as number;
      n += count[k] as number;
    }
    return a / n;
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const firstYear = YEARS[0] as number;
  const lastYear = YEARS[YEARS.length - 1] as number;
  const midStart = firstYear + Math.floor((YEARS.length - SPAN) / 2);
  const periods = [
    { from: firstYear, to: firstYear + SPAN - 1, color: COLD, width: 1.5 },
    { from: midStart, to: midStart + SPAN - 1, color: WARM, width: 1.5 },
    { from: lastYear - SPAN + 1, to: lastYear, color: HOT, width: 2.25 },
  ].map((p) => ({ ...p, name: `${p.from}–${p.to}`, values: curve(p.from, p.to) }));
  const [first, , last] = periods as [
    (typeof periods)[number],
    (typeof periods)[number],
    (typeof periods)[number],
  ];
  const dates = Array.from({ length: SLOTS }, (_, s) => slotDate(s));
  const diff = last.values.map((v, s) => v - (first.values[s] as number));

  const peak = diff.indexOf(Math.max(...diff));
  const byMonth = MONTH_NAMES.map((_, m) => {
    const v = diff.filter((_d, s) => Number(slotDate(s).slice(5, 7)) === m + 1);
    return v.reduce((a, b) => a + b, 0) / v.length;
  });
  const top = byMonth.indexOf(Math.max(...byMonth));
  const bottom = byMonth.indexOf(Math.min(...byMonth));
  const FULL = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const signed = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} °F`;

  const lines = periods.map((p): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: p.name,
    x: dates,
    y: p.values,
    line: { color: p.color, width: p.width },
    hovertemplate: `%{x|%b %-d}: average high <b>%{y:.1f} °F</b><extra>${p.name}</extra>`,
  }));
  const difference: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: `${last.name} minus ${first.name}`,
    x: dates,
    y: diff,
    yaxis: 'y2',
    line: { color: LOOK.title, width: 1.5 },
    fill: 'tozeroy',
    fillcolor: alpha(HOT, 0.3),
    showlegend: false,
    hovertemplate: `%{x|%b %-d}: <b>%{y:+.1f} °F</b><extra>${last.name} minus ${first.name}</extra>`,
  };

  const lo = Math.min(...diff);
  const hi = Math.max(...diff);
  const chart: Chart = createChart(chartEl, {
    data: [...lines, difference],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Afternoons warmed most in ${FULL[top]} (${signed(byMonth[top] as number)}) and least in ${FULL[bottom]} (${signed(byMonth[bottom] as number)})`,
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 40 : 84, r: 24 },
      xaxis: {
        type: 'date',
        anchor: 'y2',
        range: ['2000-01-01', '2000-12-31'],
        tickformat: '%b',
        dtick: 'M1',
        ticklabelmode: 'period',
        hoverformat: '%b %-d',
      },
      yaxis: {
        domain: [0.42, 1],
        title: { text: narrow ? 'Average high (°F)' : 'Average daily high (°F)' },
        ticksuffix: '°',
        zeroline: false,
      },
      yaxis2: {
        domain: [0, 0.3],
        anchor: 'x',
        range: [Math.min(-0.5, Math.floor(lo) - 0.5), Math.ceil(hi) + 1.5],
        title: { text: 'Change (°F)' },
        tickformat: '+.0f',
        zerolinecolor: LOOK.zero,
      },
      annotations: [
        {
          x: dates[peak] as string,
          y: diff[peak] as number,
          yref: 'y2',
          text: narrow
            ? `${fmtDay(dates[peak] as string)}: ${signed(diff[peak] as number)}`
            : `Biggest change around ${fmtDay(dates[peak] as string)}: ${signed(diff[peak] as number)}`,
          showarrow: true,
          arrowhead: 0,
          arrowwidth: 1,
          arrowcolor: LOOK.tick,
          ax: peak > SLOTS / 2 ? -70 : 70,
          ay: -18,
          font: { size: 11, color: LOOK.title },
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
