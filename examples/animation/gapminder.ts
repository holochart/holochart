import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { gapminderFigure } from './gapminder.mts';

/**
 * Frames and `animate` (plan E7.4), Gapminder style: one bubble trace per continent, one frame per
 * year. Play runs `animate(null, { frame, transition, fromcurrent: true })` and Pause
 * `animate([null], { mode: 'immediate' })`, like plotly's examples; the year slider's steps animate
 * to one frame each, and the slider follows playback (`animatingframe`, E5.11). Bubbles are matched
 * across frames by `ids`, so each country glides from year to year. The data are synthetic.
 *
 * Shown (and tested) on its first frame, 1952.
 */
export const meta: ExampleMeta = {
  title: 'Animation: Gapminder-style bubbles with play and a year slider',
  description:
    'Bubbles per continent animated over years with frames; Play and Pause buttons and a year slider that follows playback.',
  tags: ['animation', 'frames', 'bubble', 'scatter', 'sliders', 'updatemenus'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, gapminderFigure());
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
