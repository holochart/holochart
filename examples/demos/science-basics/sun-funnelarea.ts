import { createChart, type Chart, type FunnelareaTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { ELEMENT_COLOR, inkOn, type ElementSymbol } from './matter.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * What the Sun is made of by mass, as a `funnelarea`: each band's area is in proportion to the
 * element's share, from hydrogen at the wide top down to the sliver of everything else at the tip.
 * Labels come from a `texttemplate` (name and percent); the thin bands, too small for a label,
 * are named in the legend and on hover. Elements keep the colors of the composition donuts.
 *
 * The Sun is almost entirely the two lightest elements; all the oxygen, carbon, iron and the rest
 * add up to under 2% of its mass.
 */
export const meta: ExampleMeta = {
  title: 'Composition: what the Sun is made of',
  description:
    'A funnel area chart of the Sun’s mass by element: hydrogen 73.5%, helium 24.9%, and under 2% of everything else.',
  tags: ['demo', 'funnelarea', 'texttemplate', 'legend', 'chemistry'],
  size: { width: 720, height: 480 },
  testTolerance: 0.004,
};

const PARTS: readonly (readonly [ElementSymbol, string, number])[] = [
  ['H', 'Hydrogen', 73.5],
  ['He', 'Helium', 24.9],
  ['O', 'Oxygen', 0.8],
  ['C', 'Carbon', 0.3],
  ['other', 'Everything else', 0.5],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const trace: FunnelareaTrace = {
    type: 'funnelarea',
    name: 'Sun',
    labels: PARTS.map(([, name, v]) => `${name} ${v}%`),
    values: PARTS.map(([, , v]) => v),
    text: PARTS.map(([, name]) => name),
    texttemplate: '<b>%{text}</b><br>%{value}%',
    textposition: 'inside',
    insidetextfont: { size: 14, color: PARTS.map(([s]) => inkOn(s)) },
    aspectratio: 1.1,
    baseratio: 0.12,
    marker: {
      colors: PARTS.map(([s]) => ELEMENT_COLOR[s]),
      line: { color: LOOK.bg, width: 2 },
    },
    hovertemplate: '<b>%{text}</b><br>%{value}% of the Sun’s mass<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: { text: narrow ? '' : 'The Sun by mass: hydrogen, helium and a pinch of the rest' },
      showlegend: true,
      legend: narrow
        ? { orientation: 'h', x: 0.5, xanchor: 'center', y: 0, yanchor: 'top' }
        : { orientation: 'v', x: 1, xanchor: 'right', y: 0.5, yanchor: 'middle' },
      margin: narrow ? { t: 16, l: 8, r: 8, b: 72 } : { l: 24, r: 24, b: 24 },
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
