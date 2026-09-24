import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Cell labels (plan E10.2): builds per weekday and 3-hour window of a CI system, binned on a
 * category x axis and numeric y (`ybins.size: 3`), each cell labelled with its count through
 * `texttemplate: '%{z}'`. Labels are sized to fit the cells and drawn black or white for contrast
 * with each cell's color.
 */
export const meta: ExampleMeta = {
  title: '2D histogram: cell labels',
  description: 'Builds per weekday and 3-hour window, each cell labelled with its count.',
  tags: ['histogram2d', 'statistical', 'texttemplate', 'category'],
  testTolerance: 0.004,
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(11);
  const day: string[] = [];
  const hour: number[] = [];
  for (let i = 0; i < 1500; i++) {
    const d = Math.floor(random() * 7);
    const weekend = d >= 5;
    if (weekend && random() < 0.7) continue;
    // Busy during working hours, a nightly batch at 2 am.
    const h =
      random() < 0.15
        ? 2 + random()
        : Math.min(23.9, Math.max(0, 9 + random() * 10 + (random() - 0.5) * 4));
    day.push(DAYS[d]!);
    hour.push(h);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram2d',
        x: day,
        y: hour,
        ybins: { start: 0, end: 24, size: 3 },
        texttemplate: '%{z}',
        xgap: 1,
        ygap: 1,
        colorbar: { title: { text: 'builds' } },
      },
    ],
    layout: {
      title: { text: 'CI builds by weekday and hour' },
      xaxis: { categoryorder: 'array', categoryarray: DAYS },
      yaxis: { title: { text: 'hour of day' }, dtick: 3 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
