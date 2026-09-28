import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { wind } from './datasets.mts';

/**
 * Express wind rose (plan E23.6): `px.bar_polar` on long-form rows — one `barpolar` trace per
 * strength bin, its wedges at the 16 compass directions stacked outward, colored in order from a
 * sequential palette (`colorDiscreteSequence`), as the classic px wind rose.
 */
export const meta: ExampleMeta = {
  title: 'Express: wind rose with barPolar',
  description:
    'A wind rose from long-form rows: frequency per direction, stacked by strength bin from calm to strong.',
  tags: ['express', 'barpolar', 'polar', 'wind rose', 'stacked'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.barPolar(wind(), {
    r: 'frequency',
    theta: 'direction',
    color: 'strength',
    colorDiscreteSequence: [
      '#0d0887',
      '#5302a3',
      '#8b0aa5',
      '#b83289',
      '#db5c68',
      '#f48849',
      '#febd2a',
    ],
    labels: { strength: 'Strength (m/s)', frequency: 'Frequency (%)' },
    title: 'Wind rose',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
