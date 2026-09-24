import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate, fmtT, pct, ROLLING, WEEKLY } from './analysis.mts';
import { chartConfig, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Is OpenRouter's growth rate holding up? (demo page `demos/openrouter`): the rolling 4-week
 * compound weekly growth rate as bars on a date axis, with the exponential fit's average rate as a
 * dashed horizontal line (a `shape` spanning the plot, `xref: 'paper'`) and its label as an
 * annotation in the right margin. A pure exponential would scatter around the line.
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: rolling 4-week growth rate',
  description:
    'Rolling 4-week compound weekly growth as bars, with the average rate as a dashed reference line.',
  tags: ['demo', 'bar', 'shapes', 'annotations', 'hover', 'date', 'percent'],
  size: { width: 960, height: 300 },
  testTolerance: 0.004,
};

const DAY = 864e5;

export function run(el: HTMLElement): ExampleHandle {
  const narrow = isNarrow(el);
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'Rolling 4-week growth',
        x: ROLLING.map((p) => p.week),
        y: ROLLING.map((p) => p.g),
        width: 7 * DAY * 0.72,
        marker: { color: LOOK.colorway[0] },
        customdata: ROLLING.map((p) => [
          fmtDate(p.week),
          pct(p.g),
          `${fmtT(p.from)} → ${fmtT(p.to)}`,
          `${(p.to / p.from).toFixed(2)}×`,
        ]),
        hovertemplate:
          '<b>4 weeks to %{customdata[0]}</b><br>' +
          '%{customdata[1]} per week<br>' +
          '%{customdata[2]} (%{customdata[3]})<extra></extra>',
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'Rolling 4-week compound growth, per week' },
      showlegend: false,
      margin: { r: 64 },
      xaxis: { type: 'date', tickformat: '%b', dtick: 'M1' },
      yaxis: { tickformat: '.0%', zeroline: true },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          yref: 'y',
          y0: WEEKLY,
          y1: WEEKLY,
          line: { color: LOOK.title, width: 1.5, dash: 'dash' },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          x: 1,
          xanchor: 'left',
          xshift: 6,
          yref: 'y',
          y: WEEKLY,
          text: `<b>avg ${pct(WEEKLY)}</b>`,
          showarrow: false,
          font: { color: LOOK.title, size: 10 },
        },
      ],
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
