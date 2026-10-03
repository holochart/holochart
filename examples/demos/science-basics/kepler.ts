import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { PLANETS } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Kepler's third law: the time a planet takes to go round the Sun (its year) against its distance
 * from the Sun, on logarithmic axes (`type: 'log'`). The eight planets are `scatter` markers in
 * their own colors with name labels (`mode: 'markers+text'`); the line is `T = a^1.5`, with T in
 * Earth years and a in astronomical units (the Earth's distance), a straight line on log–log axes.
 * Every planet sits on it: the hover gives the measured year next to the one the rule predicts.
 */
export const meta: ExampleMeta = {
  title: 'Planets: Kepler’s third law',
  description:
    'Orbital period against distance from the Sun for the eight planets on log–log axes, with the line T = a^1.5.',
  tags: ['demo', 'scatter', 'log', 'markers', 'text', 'annotations', 'astronomy'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const DAYS_PER_YEAR = 365.25;
/** Labels go above-left of the markers, except where that would run into the line's neighbours. */
const BELOW = new Set(['Venus', 'Mars', 'Saturn', 'Neptune']);

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const years = PLANETS.map((p) => p.period / DAYS_PER_YEAR);
  const line: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Kepler’s rule, T = a^1.5',
    x: [0.25, 50],
    y: [0.25 ** 1.5, 50 ** 1.5],
    line: { color: LOOK.text, width: 1.5, dash: 'dot' },
    hoverinfo: 'skip',
  };
  const planets: ScatterTrace = {
    type: 'scatter',
    mode: 'markers+text',
    name: 'Planets',
    x: PLANETS.map((p) => p.distance),
    y: years,
    text: PLANETS.map((p) => p.name),
    textposition: PLANETS.map((p) => (BELOW.has(p.name) ? 'bottom right' : 'top left')),
    textfont: { size: 11, color: PLANETS.map((p) => p.color) },
    marker: {
      size: 11,
      color: PLANETS.map((p) => p.color),
      line: { color: LOOK.bg, width: 1.5 },
    },
    customdata: PLANETS.map((p, i) => [
      (years[i] as number) < 2 ? (years[i] as number).toFixed(2) : (years[i] as number).toFixed(1),
      p.distance ** 1.5 < 2 ? (p.distance ** 1.5).toFixed(2) : (p.distance ** 1.5).toFixed(1),
    ]),
    hovertemplate:
      '<b>%{text}</b>, %{x} AU from the Sun<br>year: %{customdata[0]} Earth years<br>' +
      'rule predicts: %{customdata[1]}<extra></extra>',
    showlegend: false,
  };

  const chart: Chart = createChart(chartEl, {
    data: [line, planets],
    layout: {
      title: { text: narrow ? '' : 'The farther a planet is from the Sun, the longer its year' },
      hovermode: 'closest',
      showlegend: true,
      legend: { x: 0.02, y: 0.98, xanchor: 'left', yanchor: 'top' },
      xaxis: {
        type: 'log',
        title: { text: 'Distance from the Sun (AU, Earth = 1)' },
        range: [Math.log10(0.25), Math.log10(50)],
        tickvals: [0.3, 1, 3, 10, 30],
      },
      yaxis: {
        type: 'log',
        title: { text: 'Length of the year (Earth years)' },
        range: [Math.log10(0.12), Math.log10(400)],
        tickvals: [1, 10, 100],
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.98,
          y: 0.06,
          xanchor: 'right',
          yanchor: 'bottom',
          showarrow: false,
          align: 'right',
          text:
            'Farther planets have farther to go and move more slowly.<br>' +
            'The rule is exact: 4 times as far means 8 times as long (4 × √4).',
          font: { size: 11, color: LOOK.text },
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
