import { createChart, type Chart, type ScatterpolarTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CLIMATE,
  COLD,
  FIRST_DATE,
  N,
  slot,
  TMIN,
  YEAR,
  HOT,
  MONTH_NAMES,
  NORMAL_FROM,
  NORMAL_TO,
  type DayClimate,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { suspectLow } from './wind-seasons.mts';

/**
 * The year as a clock: the angle is the day of the year (January 1 at the top, going clockwise;
 * month names from `angularaxis.tickvals` / `ticktext`) and the radius the temperature. Four
 * closed `scatterpolar` lines: the 1991–2020 average high and low of each calendar day, and,
 * fainter, the highest high and the lowest low ever recorded on that day (outside and inside
 * them). The radial axis starts below zero (`radialaxis.range`), so 0 °F is a ring, not the
 * center.
 *
 * The loops are egg-shaped and lean toward late July and early August: summer pulls the whole
 * year outward. The record lows of winter reach much further from the average than the record
 * highs of summer.
 *
 * The record lows are recomputed here without one faulty reading (a low of 32 °F on Jun 24, 2025).
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: the year as a clock',
  description:
    'Average and record high and low temperature of every calendar day at Dallas Love Field as closed polar lines, January at the top.',
  tags: ['demo', 'polar', 'scatterpolar', 'lines', 'climatology', 'hover'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** Day-of-year slot (0–365) to degrees. */
const angle = (s: number): number => (s / 366) * 360;
/** `2000-07-04` → `Jul 4`. */
const dayName = (date: string): string =>
  `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Record lows again, leaving out a faulty reading (see `suspectLow`).
  const lowest = CLIMATE.map(() => ({ low: Infinity, year: 0 }));
  for (let i = 0; i < N; i++) {
    const t = TMIN[i];
    const e = lowest[slot(i)];
    if (t === null || t === undefined || !e || suspectLow(i) || t >= e.low) continue;
    e.low = t;
    e.year = YEAR[i] as number;
  }
  const climate: DayClimate[] = CLIMATE.map((d, s) => ({
    ...d,
    recordLow: (lowest[s] as { low: number }).low,
    recordLowYear: (lowest[s] as { year: number }).year,
  }));
  // Closed loops: the first day again at the end.
  const days: DayClimate[] = [...climate, climate[0] as DayClimate];
  const theta = days.map((d, k) => (k === days.length - 1 ? 360 : angle(d.slot)));
  const names = days.map((d) => dayName(d.date));

  const loop = (
    name: string,
    r: number[],
    color: string,
    record: ((d: DayClimate) => number) | null,
  ): ScatterpolarTrace => ({
    type: 'scatterpolar',
    mode: 'lines',
    name,
    theta,
    r,
    thetaunit: 'degrees',
    customdata: days.map((d, k) => [names[k], record ? record(d) : '']),
    line: record ? { color, width: 1 } : { color, width: 2.5 },
    opacity: record ? 0.55 : 1,
    hovertemplate: record
      ? `%{customdata[0]}<br>${name.toLowerCase()} <b>%{r:.0f} °F</b>, set in %{customdata[1]}<extra></extra>`
      : `%{customdata[0]}<br>${name.toLowerCase()} <b>%{r:.1f} °F</b><extra></extra>`,
  });

  const hottest = CLIMATE.reduce((a, b) => (b.avgHigh > a.avgHigh ? b : a));
  const coldest = CLIMATE.reduce((a, b) => (b.avgLow < a.avgLow ? b : a));
  const monthStarts = MONTH_NAMES.map((_, k) => {
    const day = `${String(k + 1).padStart(2, '0')}-01`;
    const first = CLIMATE.find((d) => d.date.slice(5) === day);
    return angle((first as DayClimate).slot);
  });

  const chart: Chart = createChart(chartEl, {
    data: [
      loop(
        'Record high',
        days.map((d) => d.recordHigh),
        HOT,
        (d) => d.recordHighYear,
      ),
      loop(
        'Average high',
        days.map((d) => d.avgHigh),
        HOT,
        null,
      ),
      loop(
        'Average low',
        days.map((d) => d.avgLow),
        COLD,
        null,
      ),
      loop(
        'Record low',
        days.map((d) => d.recordLow),
        COLD,
        (d) => d.recordLowYear,
      ),
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Warmest around ${dayName(hottest.date)} (average high ${hottest.avgHigh.toFixed(0)} °F), ` +
            `coldest around ${dayName(coldest.date)} (average low ${coldest.avgLow.toFixed(0)} °F)`,
      },
      hovermode: 'closest',
      legend: { orientation: 'v', x: 1, xanchor: 'right', y: 1, yanchor: 'top' },
      margin: { t: 64, b: 36, l: 24, r: 24 },
      polar: {
        domain: { x: [0, 0.84], y: [0, 1] },
        angularaxis: {
          direction: 'clockwise',
          rotation: 90,
          tickmode: 'array',
          tickvals: monthStarts,
          ticktext: [...MONTH_NAMES],
        },
        radialaxis: {
          range: [-10, 115],
          tickmode: 'array',
          tickvals: [0, 32, 60, 90],
          ticksuffix: ' °F',
          angle: 0,
          tickfont: { size: 9 },
        },
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 0,
          xanchor: 'right',
          yanchor: 'bottom',
          showarrow: false,
          align: 'right',
          text: `Averages ${NORMAL_FROM}–${NORMAL_TO}<br>records since ${FIRST_DATE.slice(0, 4)}`,
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
