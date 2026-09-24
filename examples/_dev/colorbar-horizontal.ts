import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Horizontal colorbar (E5.3) above a bar chart colored by value: `orientation: 'h'`, half the plot
 * width, pixel thickness, a top title, a background box with a border, and the top-margin push.
 */
export const meta: ExampleMeta = {
  title: 'Colorbar: horizontal, above the plot',
  description:
    'Bars colored by growth through the diverging scale centered on 0; a horizontal colorbar with a titled, bordered box pushes the top margin.',
  tags: ['dev', 'chart', 'colorbar', 'bar'],
  size: { width: 720, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const growth = [2.1, 3.4, -1.2, 0.5, 4.8, 6.2, 5.5, 3.9, 1.1, -0.4, 2.7, 7.3];

  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: months,
        y: growth,
        marker: {
          color: growth,
          cmid: 0,
          showscale: true,
          colorbar: {
            orientation: 'h',
            len: 0.5,
            thickness: 14,
            title: { text: 'Growth (%)', side: 'top' },
            bgcolor: '#15151d',
            bordercolor: '#3e3e4c',
            borderwidth: 1,
            ticks: 'inside',
            ticklen: 4,
          },
        },
      },
    ],
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
