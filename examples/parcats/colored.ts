import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Colored paths (plan E10.11): a numeric `line.color` per sample, mapped through
 * `line.colorscale`, splits the paths by color, and `bundlecolors` (the default) keeps paths of one
 * color together inside every band. With `hoveron: 'color'`, hovering a band highlights only the
 * paths of the hovered color and shows conditional probabilities.
 */
export const meta: ExampleMeta = {
  title: 'Parallel categories: colored paths',
  description: 'Orders by channel, device and basket size, colored by whether they converted.',
  tags: ['parcats', 'statistical', 'domain', 'categorical', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(29);
  const n = 400;
  const channel: string[] = [];
  const device: string[] = [];
  const basket: string[] = [];
  const converted: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = ['Search', 'Social', 'Email', 'Direct'][Math.floor(random() * 4)]!;
    const d = random() < (c === 'Social' ? 0.8 : 0.5) ? 'Mobile' : 'Desktop';
    const b = random() < 0.5 ? 'Small' : random() < 0.7 ? 'Medium' : 'Large';
    channel.push(c);
    device.push(d);
    basket.push(b);
    converted.push(random() < (c === 'Email' ? 0.6 : 0.3) + (d === 'Desktop' ? 0.1 : 0) ? 1 : 0);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'parcats',
        hoveron: 'color',
        line: {
          color: converted,
          colorscale: [
            [0, '#5e74d5'],
            [1, '#ea2a37'],
          ],
        },
        dimensions: [
          { label: 'Channel', values: channel },
          { label: 'Device', values: device },
          { label: 'Basket', values: basket, categoryarray: ['Small', 'Medium', 'Large'] },
        ],
      },
    ],
    layout: {
      title: { text: 'Sessions by channel: converted (red) or not (blue)' },
      margin: { t: 48, l: 56, r: 56, b: 24 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
