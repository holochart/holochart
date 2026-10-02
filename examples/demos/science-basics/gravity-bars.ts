import { createChart, type BarTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { PLANETS } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Weight on other planets: mass stays the same wherever you are, but weight is the pull of gravity
 * on that mass, `weight = mass × g`. A vertical `bar` per planet for a person of 50 kg, in newtons
 * (50 × the planet's surface gravity), in the planets' colors with the value written on each bar
 * (`text`, `textposition: 'inside'`). The Earth's bar is outlined and a dotted `shape` carries its
 * 490 N across the chart, so every other bar reads as lighter or heavier than at home.
 */
export const meta: ExampleMeta = {
  title: 'Planets: your weight on each planet',
  description:
    'Bars of the weight in newtons of a 50 kg person on each of the eight planets, with the Earth as the reference line.',
  tags: ['demo', 'bar', 'text', 'shapes', 'annotations', 'astronomy'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const MASS = 50; // kg

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const weight = PLANETS.map((p) => MASS * p.gravity);
  const earth = MASS * (PLANETS.find((p) => p.name === 'Earth')?.gravity ?? 9.8);

  const bars: BarTrace = {
    type: 'bar',
    x: PLANETS.map((p) => p.name),
    y: weight,
    width: 0.62,
    text: weight.map((w) => `${w.toFixed(0)} N`),
    textposition: 'inside',
    insidetextanchor: 'end',
    textfont: { size: 11, color: LOOK.bg, weight: 'bold' },
    marker: {
      color: PLANETS.map((p) => p.color),
      line: {
        color: PLANETS.map((p) => (p.name === 'Earth' ? LOOK.title : p.color)),
        width: PLANETS.map((p) => (p.name === 'Earth' ? 2 : 0)),
      },
    },
    customdata: PLANETS.map((p) => [p.gravity.toFixed(1), (p.gravity / 9.8).toFixed(2)]),
    hovertemplate:
      '<b>%{x}</b>: %{y:.0f} N<br>gravity %{customdata[0]} m/s², ' +
      '%{customdata[1]} times the Earth’s<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [bars],
    layout: {
      title: { text: narrow ? '' : 'What a 50 kg person weighs on each planet' },
      showlegend: false,
      xaxis: { type: 'category', showgrid: false },
      yaxis: { title: { text: 'Weight (newtons)' }, range: [0, 1250] },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          y0: earth,
          y1: earth,
          line: { color: LOOK.title, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          x: 0,
          y: earth,
          xanchor: 'left',
          xshift: 6,
          yanchor: 'bottom',
          showarrow: false,
          text: narrow ? 'On Earth' : `On Earth: 50 kg × 9.8 m/s² = ${earth.toFixed(0)} N`,
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
