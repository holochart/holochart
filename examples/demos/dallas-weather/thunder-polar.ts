import { createChart, type BarpolarTrace, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { MONTH_NAMES, NORMAL_FROM, NORMAL_TO, NORMALS } from './analysis.mts';
import { monthName } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Thunderstorm season on a month clock: the 1991–2020 average number of days with thunder in
 * each calendar month as `barpolar` bars on a clockwise category axis with January at the top
 * (`angularaxis.direction: 'clockwise'`, `rotation: 90`). Bars are colored by their own value
 * through a colorscale (`marker.color` with `marker.colorscale` and a colorbar), from dim violet
 * to bright yellow. Spring stands out: April to June have the most storm days, winter the fewest.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: thunderstorm days by month',
  description:
    'Average number of days with thunder in each calendar month (1991–2020) as polar bars on a clockwise month clock, colored by value.',
  tags: ['demo', 'polar', 'barpolar', 'categorical', 'colorscale', 'colorbar'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** Storm sky: dark violet for quiet months, bright yellow for the peak. */
const STORM_SCALE: [number, string][] = [
  [0, '#3b2f6b'],
  [0.35, '#6d4fb0'],
  [0.7, '#d08a3c'],
  [1, '#ffe066'],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const days = NORMALS.map((n) => n.thunderDays);
  const total = days.reduce((a, b) => a + b, 0);
  const peak = NORMALS.reduce((a, b) => (b.thunderDays > a.thunderDays ? b : a));
  const quiet = NORMALS.reduce((a, b) => (b.thunderDays < a.thunderDays ? b : a));
  const top = Math.ceil(peak.thunderDays / 2) * 2;
  const spring = NORMALS.filter((n) => n.month >= 4 && n.month <= 6).reduce(
    (a, n) => a + n.thunderDays,
    0,
  );

  const bars = {
    type: 'barpolar',
    name: 'Days with thunder',
    theta: MONTH_NAMES,
    r: days,
    width: 0.9,
    text: NORMALS.map((n) => monthName(n.month)),
    marker: {
      color: days,
      colorscale: STORM_SCALE,
      cmin: 0,
      cmax: top,
      showscale: !narrow,
      colorbar: {
        title: { text: 'Days with<br>thunder' },
        thickness: 12,
        len: 0.6,
        dtick: 2,
      },
      line: { color: LOOK.bg, width: 1 },
    },
    hovertemplate: '%{text}<br><b>%{r:.1f} days</b> with thunder on average<extra></extra>',
  } satisfies BarpolarTrace;

  const figure: FigureInput = {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Days with thunder: about ${peak.thunderDays.toFixed(0)} in ${monthName(peak.month)}, under ${Math.ceil(quiet.thunderDays)} in ${monthName(quiet.month)}`,
      },
      showlegend: false,
      margin: { t: narrow ? 28 : 72, b: 56, l: 40, r: 40 },
      polar: {
        angularaxis: { direction: 'clockwise', rotation: 90, type: 'category' },
        radialaxis: {
          range: [0, top],
          dtick: 2,
          // Straight up, along January's short bar.
          angle: 90,
          tickangle: 90,
          tickfont: { size: 9 },
        },
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.5,
          y: 0,
          xanchor: 'center',
          yanchor: 'top',
          yshift: -24,
          showarrow: false,
          text:
            `About ${total.toFixed(0)} days a year have thunder, ` +
            `${Math.round((spring / total) * 100)}% of them from April to June ` +
            `(${NORMAL_FROM}–${NORMAL_TO} averages)`,
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
