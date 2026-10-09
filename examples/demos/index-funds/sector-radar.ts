import { createChart, type Chart, type ScatterpolarTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { HALVES, LABEL, pct, PERIODS, SECTORS, totalReturn } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, rgba, settled } from './ui.mts';

/**
 * The shape of each half's sector leadership as a radar: the eleven sector funds around the
 * circle (a category angular axis, clockwise from the top in the order of their first-half
 * return), one closed, filled polygon per half (`scatterpolar`, `fill: 'toself'`): teal for
 * 2022–24, amber for 2024–26, with circle and diamond markers so the two do not rest on color
 * alone. The grid is a polygon (`gridshape: 'linear'`), as a radar's should be. The radial axis is
 * the total return in percent, lies along the Financials spoke with level tick labels, and starts
 * below zero, so a sector that lost money in a half stays inside the 0% ring instead of collapsing
 * onto the center. Sorting by
 * the first half makes the teal polygon a smooth spiral; wherever the amber one breaks that
 * shape, the order of the sectors changed.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: sector returns as a radar',
  description:
    'Radar chart of the eleven S&P 500 sector funds’ total return in 2022–24 and in 2024–26, one filled polygon per half.',
  tags: ['demo', 'scatterpolar', 'polar', 'radar', 'fill', 'categories', 'financial'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** `'Consumer discretionary'` → two lines, so the labels around the circle stay narrow. */
const wrap = (label: string): string => label.replace(' ', '<br>');

const TICKS = [0, 0.25, 0.5, 0.75, 1];
/** The spoke that carries the radial axis' tick labels: the one closest to level, on the right. */
const AXIS_SECTOR = 'XLF';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const order = [...SECTORS].sort((a, b) => totalReturn(b, 'first') - totalReturn(a, 'first'));
  const name = (t: (typeof order)[number]): string => (narrow ? t : wrap(LABEL[t]));
  const closed = <T>(v: readonly T[]): T[] => [...v, v[0] as T];
  const ticks = narrow ? TICKS.filter((v) => v % 0.5 === 0) : TICKS;
  // Sectors run clockwise from the top (90°), one spoke every 360° / 11.
  const axisAngle = 90 - (order.indexOf(AXIS_SECTOR) * 360) / order.length;

  const traces = HALVES.map((half): ScatterpolarTrace => {
    const { color, short, label } = PERIODS[half];
    return {
      type: 'scatterpolar',
      mode: 'lines+markers',
      name: short,
      theta: closed(order.map(name)),
      r: closed(order.map((t) => totalReturn(t, half))),
      customdata: closed(order.map((t) => [t, LABEL[t], pct(totalReturn(t, half), 1)])),
      fill: 'toself',
      fillcolor: rgba(color, 0.22),
      line: { color, width: 2 },
      marker: {
        color,
        size: 7,
        symbol: half === 'first' ? 'circle' : 'diamond',
        line: { color: LOOK.bg, width: 1 },
      },
      hovertemplate: `<b>%{customdata[0]} · %{customdata[1]}</b><br>${label}: %{customdata[2]}<extra></extra>`,
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Sector total returns, one polygon per half' },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 56 : 96, b: 48, l: narrow ? 40 : 96, r: narrow ? 40 : 96 },
      polar: {
        gridshape: 'linear',
        angularaxis: {
          type: 'category',
          direction: 'clockwise',
          rotation: 90,
          tickfont: { size: narrow ? 9 : 11 },
        },
        radialaxis: {
          range: [-0.15, 1.05],
          tickvals: ticks,
          // The outermost ring is left unlabelled: its label would run into the spoke's sector name.
          ticktext: ticks.map((v) => (v === 0 ? '0%' : v >= 1 ? '' : pct(v))),
          // Along one spoke (a polygon grid snaps the axis to a vertex), with level tick labels:
          // the tick angle is relative to the axis.
          angle: axisAngle,
          tickangle: axisAngle,
          tickfont: { size: 9 },
        },
      },
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
