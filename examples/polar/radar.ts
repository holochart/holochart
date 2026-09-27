import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Radar chart (plan E11.4): two `scatterpolar` traces over category angles, closed and filled
 * with `fill: 'toself'`. Category angular axes spread their categories evenly around the circle
 * (`angularaxis.period` defaults to the category count).
 */
export const meta: ExampleMeta = {
  title: 'Polar: radar chart',
  description: 'Two filled radar traces over six categories.',
  tags: ['polar', 'scatterpolar', 'radar', 'fill', 'categories'],
  testTolerance: 0.004,
};

const SKILLS = ['Speed', 'Power', 'Range', 'Armor', 'Stealth', 'Agility'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatterpolar',
        r: [4.2, 3.1, 4.6, 2.2, 3.4, 4.1, 4.2],
        theta: [...SKILLS, SKILLS[0]!],
        fill: 'toself',
        name: 'Scout',
      },
      {
        type: 'scatterpolar',
        r: [2.4, 4.8, 3.0, 4.7, 1.6, 2.3, 2.4],
        theta: [...SKILLS, SKILLS[0]!],
        fill: 'toself',
        name: 'Tank',
      },
    ],
    layout: {
      title: { text: 'Radar chart' },
      polar: { radialaxis: { range: [0, 5] } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
