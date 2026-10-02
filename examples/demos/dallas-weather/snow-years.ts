import {
  createChart,
  type BarTrace,
  type Chart,
  type FigureInput,
  type LayoutAnnotation,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { LAST_DATE, MONTH, N, SNOW, SNOW_COLOR, YEAR } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Snowfall of every winter since 1940, as bars on a date axis. A winter runs from July to June
 * and is named after the year it ends in, so the snow of December 2020 and February 2021 lands in
 * one bar, "2021". Winters are added up from the daily snowfall readings; winters whose cold
 * months (November to March) have gaps in the snowfall record are not drawn and are shaded
 * instead (rect shapes below the bars). Annotations name the snowiest winters and count the
 * winters with no snow at all.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: snowfall per winter',
  description:
    'Snowfall of each winter (July to June) since 1940 as bars on a date axis, with the snowiest winters labelled and the gaps in the record shaded.',
  tags: ['demo', 'bar', 'date', 'timeseries', 'shapes', 'annotations', 'gaps'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

interface Winter {
  /** The year the winter ends in. */
  year: number;
  snow: number;
  /** Days from November to March without a snowfall reading. */
  missing: number;
  /** Days with snowfall of 0.1 in or more. */
  days: number;
}

/** A winter with more missing cold-season days than this is left out. */
const MAX_MISSING = 14;
/** How many of the snowiest winters get a label. */
const LABELLED = 3;

function winters(): Winter[] {
  const by = new Map<number, Winter>();
  for (let i = 0; i < N; i++) {
    const month = MONTH[i] as number;
    const year = (YEAR[i] as number) + (month >= 7 ? 1 : 0);
    const w = by.get(year) ?? { year, snow: 0, missing: 0, days: 0 };
    const s = SNOW[i];
    if (s === null || s === undefined) {
      if (month >= 11 || month <= 3) w.missing++;
    } else if (s > 0) {
      w.snow += s;
      w.days++;
    }
    by.set(year, w);
  }
  // Winters that have reached the end of March; the first one (1939–40) starts in the record.
  const lastYear = Number(LAST_DATE.slice(0, 4)) - (LAST_DATE.slice(5) < '04-01' ? 1 : 0);
  return [...by.values()]
    .filter((w) => w.year <= lastYear)
    .map((w) => ({ ...w, snow: Math.round(w.snow * 10) / 10 }));
}

/** Runs of consecutive years, as `[first, last]` pairs. */
function runs(years: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const y of years) {
    const last = out[out.length - 1];
    if (last && last[1] === y - 1) last[1] = y;
    else out.push([y, y]);
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const all = winters();
  const known = all.filter((w) => w.missing <= MAX_MISSING);
  const gaps = runs(all.filter((w) => w.missing > MAX_MISSING).map((w) => w.year));
  const none = known.filter((w) => w.snow === 0).length;
  const top = [...known].sort((a, b) => b.snow - a.snow).slice(0, LABELLED);
  const mean = known.reduce((a, w) => a + w.snow, 0) / known.length;
  const at = (year: number): string => `${year}-01-01`;
  const name = (year: number): string => `${year - 1}–${String(year).slice(2)}`;
  const peak = top[0]!.snow;

  const bars = {
    type: 'bar',
    name: 'Snowfall',
    x: known.map((w) => at(w.year)),
    y: known.map((w) => w.snow),
    customdata: known.map((w) => [
      name(w.year),
      w.snow === 0 ? 'no snow' : `on ${w.days} day${w.days === 1 ? '' : 's'}`,
    ]),
    marker: { color: SNOW_COLOR, line: { width: 0 } },
    hovertemplate:
      'Winter %{customdata[0]}<br><b>%{y:.1f} in</b> of snow, %{customdata[1]}<extra></extra>',
  } satisfies BarTrace;

  const shapes: LayoutShape[] = gaps.map(([from, to]) => ({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: `${from - 1}-07-01`,
    x1: `${to}-07-01`,
    y0: 0,
    y1: 1,
    layer: 'below',
    fillcolor: 'rgba(138, 144, 166, 0.14)',
    line: { width: 0 },
  }));
  const labels: LayoutAnnotation[] = top.map((w, k) => ({
    xref: 'x',
    yref: 'y',
    x: at(w.year),
    y: w.snow,
    text: `<b>${name(w.year)}</b><br>${w.snow.toFixed(1)} in`,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: LOOK.tick,
    ax: k % 2 === 0 ? 34 : -34,
    ay: -14,
    font: { size: 10, color: LOOK.title },
  }));
  const gapNote = gaps.map(([a, b]) => (a === b ? name(a) : `${a - 1} to ${b}`)).join(' and ');

  const figure: FigureInput = {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Snow per winter: ${mean.toFixed(1)} inches on average, and none at all in ${none} of ${known.length} winters`,
      },
      showlegend: false,
      bargap: 0.2,
      xaxis: {
        type: 'date',
        range: ['1939-01-01', `${all[all.length - 1]!.year + 1}-01-01`],
        dtick: 'M120',
        tick0: '1940-01-01',
        tickformat: '%Y',
        showgrid: false,
        title: { text: 'Winter ending in' },
      },
      yaxis: {
        title: { text: 'Snowfall, inches' },
        range: [0, Math.ceil(peak / 2) * 2 + 2],
      },
      shapes,
      annotations: [
        ...labels,
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.97,
          xanchor: 'left',
          yanchor: 'top',
          align: 'left',
          showarrow: false,
          text:
            `<b>${none} of ${known.length}</b> winters had no snow at all.<br>` +
            `Shaded: no snowfall record (${gapNote}).`,
          font: { size: 11, color: LOOK.text },
        },
      ],
    },
    config: chartConfig(narrow),
  };
  const chart: Chart = createChart(chartEl, figure);

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
