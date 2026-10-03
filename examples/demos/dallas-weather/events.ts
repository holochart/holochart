import {
  createChart,
  type BarTrace,
  type Chart,
  type Figure,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CLIMATE,
  COLD,
  DATE,
  dayIndex,
  fmtDate,
  HOT,
  NEUTRAL,
  slot,
  TMAX,
  TMIN,
  WARM,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';
import { alpha, fmtDay, longest, runs } from './years-events.mts';

/**
 * Four famous spells, day by day, on a real date axis: each day is a vertical `bar` from its low
 * to its high (`base` is the low, `y` the difference), over a grey band between the average low
 * and the average high of those calendar days (two `scatter` lines, the second with
 * `fill: 'tonexty'`). A dotted reference line (a `shapes` line) marks 32 °F for the cold spells
 * and 100 °F for the hot summers, and the bars of the days that count (a high at or below
 * freezing, or of 100 °F or more) are drawn in the strong color (`marker.color` per bar).
 *
 * The toolbar toggle swaps the spell with `chart.react(…)`. Each title states the longest run of
 * such days in a row, counted from the data.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: four famous spells, day by day',
  description:
    'Daily high-to-low bars for the February 2021 freeze, the summers of 1980 and 2011 and the December 1983 cold wave, over the normal range for those days, with a toggle.',
  tags: ['demo', 'bar', 'scatter', 'date', 'timeseries', 'shapes', 'react'],
  size: { width: 960, height: 500 },
  testTolerance: 0.004,
};

type Spell = 'freeze2021' | 'summer1980' | 'summer2011' | 'cold1983';

const SPELLS: Record<Spell, { text: string; from: string; to: string; kind: 'cold' | 'hot' }> = {
  freeze2021: { text: 'Feb 2021 freeze', from: '2021-02-01', to: '2021-02-28', kind: 'cold' },
  summer1980: { text: 'Summer 1980', from: '1980-06-15', to: '1980-09-15', kind: 'hot' },
  summer2011: { text: 'Summer 2011', from: '2011-06-01', to: '2011-09-15', kind: 'hot' },
  cold1983: { text: 'Dec 1983 cold', from: '1983-12-10', to: '1984-01-05', kind: 'cold' },
};
const ORDER: Spell[] = ['freeze2021', 'summer1980', 'summer2011', 'cold1983'];

const DAY_MS = 86_400_000;
const shift = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const figure = (spell: Spell): Figure => {
    const { text, from, to, kind } = SPELLS[spell];
    const first = dayIndex(from);
    const last = dayIndex(to);
    const all = Array.from({ length: last - first + 1 }, (_, k) => first + k);
    const idx = all.filter((i) => TMAX[i] !== null && TMIN[i] !== null);
    const high = (i: number): number => TMAX[i] as number;
    const low = (i: number): number => TMIN[i] as number;
    const cold = kind === 'cold';
    const threshold = cold ? 32 : 100;
    const counts = (i: number): boolean => {
      const t = TMAX[i];
      if (t === null || t === undefined) return false;
      return cold ? t <= 32 : t >= 100;
    };
    const strong = cold ? COLD : HOT;
    const weak = cold ? NEUTRAL : WARM;

    const streak = longest(runs(counts, first, last));
    const total = idx.filter(counts).length;
    const extreme = cold ? Math.min(...idx.map(low)) : Math.max(...idx.map(high));
    const extremeDay = idx.find((i) => (cold ? low(i) : high(i)) === extreme) as number;
    const streakText = streak
      ? `${streak.length} days in a row ${cold ? 'that never got above freezing' : 'at 100 °F or more'}, from ${fmtDay(DATE[streak.start] as string)}`
      : cold
        ? 'no day stayed at or below freezing'
        : 'no day reached 100 °F';

    const normalLow: ScatterTrace = {
      type: 'scatter',
      mode: 'lines',
      name: 'Average low',
      x: all.map((i) => DATE[i] as string),
      y: all.map((i) => CLIMATE[slot(i)]?.avgLow ?? null),
      line: { color: alpha(LOOK.text, 0.45), width: 1 },
      hoverinfo: 'skip',
      showlegend: false,
    };
    const normalHigh: ScatterTrace = {
      type: 'scatter',
      mode: 'lines',
      name: 'Normal range for the date',
      x: all.map((i) => DATE[i] as string),
      y: all.map((i) => CLIMATE[slot(i)]?.avgHigh ?? null),
      line: { color: alpha(LOOK.text, 0.45), width: 1 },
      fill: 'tonexty',
      fillcolor: alpha(LOOK.text, 0.14),
      hoverinfo: 'skip',
    };
    const bars: BarTrace = {
      type: 'bar',
      name: 'Daily low to high',
      x: idx.map((i) => DATE[i] as string),
      base: idx.map(low),
      y: idx.map((i) => high(i) - low(i)),
      customdata: idx.map((i) => [
        fmtDate(DATE[i] as string),
        high(i),
        low(i),
        CLIMATE[slot(i)]?.avgHigh ?? 0,
        CLIMATE[slot(i)]?.avgLow ?? 0,
      ]),
      marker: { color: idx.map((i) => (counts(i) ? strong : weak)) },
      hovertemplate:
        '<b>%{customdata[0]}</b><br>high <b>%{customdata[1]} °F</b>, low <b>%{customdata[2]} °F</b><br>' +
        'normal for the date: %{customdata[3]:.0f} °F and %{customdata[4]:.0f} °F<extra></extra>',
    };

    const lows = idx.map(low);
    const highs = idx.map(high);
    const yMin = Math.min(...lows, threshold) - 4;
    const yMax = Math.max(...highs, threshold) + (cold ? 6 : 8);

    return {
      data: [normalLow, normalHigh, bars],
      layout: {
        title: { text: narrow ? '' : `${text}: ${streakText}` },
        hovermode: 'closest',
        bargap: 0.25,
        legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
        margin: { t: narrow ? 40 : 84, r: 48 },
        xaxis: {
          type: 'date',
          range: [shift(from, -1), shift(to, 1)],
          tickformat: '%b %-d',
          hoverformat: '%b %-d, %Y',
        },
        yaxis: {
          title: { text: 'Temperature (°F)' },
          range: [yMin, yMax],
          ticksuffix: '°',
          zeroline: false,
        },
        shapes: [
          {
            type: 'line',
            xref: 'paper',
            x0: 0,
            x1: 1,
            yref: 'y',
            y0: threshold,
            y1: threshold,
            line: { color: strong, width: 1.25, dash: 'dot' },
          },
        ],
        annotations: [
          {
            xref: 'paper',
            x: 1,
            xanchor: 'left',
            xshift: 4,
            y: threshold,
            yanchor: 'middle',
            showarrow: false,
            text: `${threshold} °F`,
            font: { size: 10, color: strong },
          },
          // In the legend row, right-aligned, clear of the bars.
          {
            xref: 'paper',
            yref: 'paper',
            x: 1,
            xanchor: 'right',
            y: 1.02,
            yanchor: 'bottom',
            yshift: 4,
            align: 'right',
            showarrow: false,
            text: narrow
              ? ''
              : cold
                ? `${total} days with a high of 32 °F or less (blue) · coldest night ${extreme} °F on ${fmtDate(DATE[extremeDay] as string)}`
                : `${total} days of 100 °F or more (red) · hottest ${extreme} °F on ${fmtDate(DATE[extremeDay] as string)}`,
            font: { size: 11, color: LOOK.title },
          },
        ],
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('freeze2021'));

  segmented<Spell>(
    toolbar,
    'Spell',
    ORDER.map((value) => ({ value, text: SPELLS[value].text })),
    (value) => void chart.react(figure(value)),
    'freeze2021',
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
