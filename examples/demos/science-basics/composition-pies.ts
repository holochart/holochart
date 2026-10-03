import { createChart, type Chart, type PieTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { ELEMENT_COLOR, ELEMENT_NAME, inkOn, type ElementSymbol } from './matter.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * What three everyday things are made of, as three `pie` donuts placed with `domain`: the human
 * body and the Earth's crust by mass, and dry air by volume. An element keeps its color in every
 * donut (`marker.colors`), so oxygen, the largest share of the body and the crust and a fifth of
 * the air, is the same red three times, and the shared legend lists each element once. The name
 * of each donut sits in its hole (trace `title`), slices keep the data order (`sort: false`) and
 * show the symbol and percent (`text`); small slices drop their label (`uniformtext`).
 *
 * On a narrow container the donuts are stacked instead of side by side.
 */
export const meta: ExampleMeta = {
  title: 'Composition: the human body, the Earth’s crust and air',
  description:
    'Three donuts of the elements in the human body and the Earth’s crust (by mass) and in dry air (by volume), one color per element.',
  tags: ['demo', 'pie', 'donut', 'domain', 'legend', 'chemistry'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

interface Mix {
  name: string;
  basis: string;
  parts: readonly (readonly [ElementSymbol, number])[];
  /** What "other" stands for in this mix. */
  other: string;
}

const MIXES: readonly Mix[] = [
  {
    name: 'Human body',
    basis: 'by mass',
    parts: [
      ['O', 65],
      ['C', 18.5],
      ['H', 9.5],
      ['N', 3.2],
      ['Ca', 1.5],
      ['P', 1.0],
      ['other', 1.3],
    ],
    other: 'potassium, sulfur, sodium, chlorine, magnesium and traces',
  },
  {
    name: 'Earth’s crust',
    basis: 'by mass',
    parts: [
      ['O', 46.1],
      ['Si', 28.2],
      ['Al', 8.2],
      ['Fe', 5.6],
      ['Ca', 4.2],
      ['Na', 2.4],
      ['Mg', 2.3],
      ['K', 2.1],
      ['other', 0.9],
    ],
    other: 'titanium, hydrogen, phosphorus and traces',
  },
  {
    name: 'Dry air',
    basis: 'by volume',
    parts: [
      ['N', 78.08],
      ['O', 20.95],
      ['Ar', 0.93],
      ['other', 0.04],
    ],
    other: 'carbon dioxide, neon, helium, methane',
  },
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const n = MIXES.length;
  const gap = 0.03;

  const traces = MIXES.map((mix, i): PieTrace => {
    const lo = i / n + gap / 2;
    const hi = (i + 1) / n - gap / 2;
    return {
      type: 'pie',
      name: mix.name,
      labels: mix.parts.map(([s]) => ELEMENT_NAME[s]),
      values: mix.parts.map(([, v]) => v),
      text: mix.parts.map(([s, v]) => `${s === 'other' ? 'other' : s} ${v}%`),
      customdata: mix.parts.map(([s]) => (s === 'other' ? `<br>${mix.other}` : '')),
      textinfo: 'text',
      textposition: 'inside',
      insidetextorientation: 'horizontal',
      insidetextfont: { color: mix.parts.map(([s]) => inkOn(s)) },
      sort: false,
      direction: 'clockwise',
      hole: 0.5,
      // Stacked top to bottom on a phone, side by side otherwise.
      domain: narrow ? { x: [0, 1], y: [1 - hi, 1 - lo] } : { x: [lo, hi], y: [0, 1] },
      marker: {
        colors: mix.parts.map(([s]) => ELEMENT_COLOR[s]),
        line: { color: LOOK.bg, width: 2 },
      },
      title: {
        text: `${mix.name}<br>${mix.basis}`,
        position: 'middle center',
        font: { size: narrow ? 11 : 13, color: LOOK.title },
      },
      hovertemplate: `<b>%{label}</b><br>%{value}% of ${mix.name.toLowerCase()} ${mix.basis}%{customdata}<extra></extra>`,
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'What a body, the ground and the air are made of' },
      showlegend: true,
      legend: narrow
        ? { orientation: 'v', x: 1, xanchor: 'left', y: 0.5, yanchor: 'middle' }
        : { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.02, yanchor: 'top' },
      margin: narrow ? { t: 16, l: 8, r: 8, b: 8 } : { l: 16, r: 16, b: 72 },
      uniformtext: { minsize: 9, mode: 'hide' },
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
