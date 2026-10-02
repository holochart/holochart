import { createChart, type Chart, type Figure, type HeatmapTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CURRENT_YEAR,
  FIRST_YEAR,
  MONTH_NAMES,
  MONTHLY_MEAN,
  NORMAL_FROM,
  NORMAL_TO,
  TEMP_SCALE,
  YEARS,
} from './analysis.mts';
import { mean } from './temperature.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * Every month since 1940 as a `heatmap`: a column per year, a row per month (January on top,
 * `yaxis.autorange: 'reversed'`), colored by the month's mean temperature. Months without enough
 * data, and the months of this year still to come, are `null` and stay blank
 * (`hoverongaps: false`).
 *
 * The "Show" toggle (`chart.react`) switches to the difference from normal: each month minus the
 * 1991–2020 mean of that calendar month, on the same diverging scale centered on 0 (`zmid`). The
 * seasons drop out and the unusual months stand out: the frozen February of 2021, the hot summers
 * of 1980 and 2011.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: every month since 1940',
  description:
    'Mean temperature of every month as a year by month heatmap, with a toggle to the difference from the 1991 to 2020 normal.',
  tags: ['demo', 'heatmap', 'colorscale', 'zmid', 'colorbar', 'react', 'climate'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

type Mode = 'temp' | 'diff';

const ALL_YEARS = [...YEARS, CURRENT_YEAR];
/** 1991–2020 mean of each calendar month, from the monthly means. */
const NORMAL = MONTH_NAMES.map((_, k) =>
  mean(
    ALL_YEARS.flatMap((y, j) => {
      const v = MONTHLY_MEAN[j]?.[k];
      return y >= NORMAL_FROM && y <= NORMAL_TO && v !== null && v !== undefined ? [v] : [];
    }),
  ),
);
/** `[month][year]` grids: the mean, and its difference from the month's normal. */
const TEMP = MONTH_NAMES.map((_, k) => ALL_YEARS.map((__, j) => MONTHLY_MEAN[j]?.[k] ?? null));
const DIFF = TEMP.map((row, k) =>
  row.map((v) => (v === null ? null : Math.round((v - (NORMAL[k] as number)) * 10) / 10)),
);

function figure(mode: Mode, narrow: boolean): Figure {
  const values = (mode === 'temp' ? TEMP : DIFF).flat().filter((v): v is number => v !== null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const cap = Math.ceil(Math.max(-lo, hi));
  const custom = TEMP.map((row, k) =>
    row.map((v, j) => [MONTH_NAMES[k], v, DIFF[k]?.[j] ?? null, NORMAL[k] as number]),
  );
  const trace: HeatmapTrace = {
    type: 'heatmap',
    x: ALL_YEARS,
    y: [...MONTH_NAMES],
    z: mode === 'temp' ? TEMP : DIFF,
    customdata: custom,
    colorscale: TEMP_SCALE,
    hoverongaps: false,
    ...(mode === 'temp'
      ? { zmin: Math.floor(lo / 5) * 5, zmax: Math.ceil(hi / 5) * 5 }
      : { zmid: 0, zmin: -cap, zmax: cap }),
    colorbar: {
      title: { text: mode === 'temp' ? 'Mean of<br>the month' : 'Difference<br>from normal' },
      ticksuffix: ' °F',
      tickformat: mode === 'temp' ? '' : '+',
      thickness: 12,
      len: 0.9,
    },
    hovertemplate:
      '%{customdata[0]} %{x}<br>Mean <b>%{customdata[1]:.1f} °F</b><br>' +
      '%{customdata[2]:+.1f} °F from the usual %{customdata[3]:.1f} °F<extra></extra>',
  };
  return {
    data: [trace],
    layout: {
      title: {
        text: narrow
          ? ''
          : mode === 'temp'
            ? `Mean temperature of every month, ${FIRST_YEAR} to ${CURRENT_YEAR}`
            : `Every month against its ${NORMAL_FROM} to ${NORMAL_TO} normal: blue colder, red warmer than usual`,
      },
      margin: { t: narrow ? 16 : 48, l: 44, r: narrow ? 64 : 92, b: 36 },
      xaxis: { showgrid: false, dtick: 10 },
      yaxis: { type: 'category', autorange: 'reversed', showgrid: false, ticks: '' },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('temp', narrow));
  segmented<Mode>(
    toolbar,
    'Show',
    [
      { value: 'temp', text: 'Temperature' },
      { value: 'diff', text: 'Difference from normal' },
    ],
    (value) => void chart.react(figure(value, narrow)),
    'temp',
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
