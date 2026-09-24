import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Horizontal violins (plan E10.5): samples given as `x` only lie along the x axis at their trace
 * names. `spanmode: 'hard'` stops each density at the extreme samples, which suits bounded values
 * such as ages, and a `bandwidth` set by hand smooths all three alike.
 */
export const meta: ExampleMeta = {
  title: 'Violin: horizontal, hard span',
  description:
    'Horizontal violins of bounded samples, with the density stopped at the extremes (spanmode hard) and a fixed bandwidth.',
  tags: ['violin', 'statistical', 'distribution', 'horizontal', 'kde'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(37));
  const ages = (mu: number, sigma: number) =>
    Array.from({ length: 150 }, () =>
      Math.round(Math.min(90, Math.max(18, mu + sigma * normal()))),
    );
  const style = { type: 'violin', spanmode: 'hard', bandwidth: 3, points: false };
  const chart = createChart(el, {
    data: [
      { ...style, name: 'Podcast', x: ages(31, 7) },
      { ...style, name: 'Newsletter', x: ages(44, 12) },
      { ...style, name: 'Radio', x: ages(58, 13) },
    ],
    layout: {
      title: { text: 'Audience age by channel' },
      xaxis: { title: { text: 'age' } },
      showlegend: false,
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
