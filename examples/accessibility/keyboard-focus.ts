import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Keyboard navigation (plan E6.5, E17.4): Tab focuses the plot area, which gets a focus ring in the
 * text color; the arrow keys move a cursor between points, showing each one's hover label (and
 * announcing it to screen readers), and Page Down switches to the next trace at the same month.
 * Here the chart is focused and navigated from code (four → presses, then Page Down) so the
 * picture is deterministic; `+` / `-` would zoom around the selected point.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: keyboard navigation',
  description:
    'Two monthly series with the plot area focused from the keyboard: the focus ring, and the hover label of the point selected with the arrow keys and Page Down.',
  tags: ['a11y', 'keyboard', 'line', 'config'],
  size: { width: 640, height: 400 },
  // The focus ring and the hover label are DOM, whose anti-aliasing varies between runs.
  testTolerance: 0.004,
};

const MONTHS = [
  '2024-01-01',
  '2024-02-01',
  '2024-03-01',
  '2024-04-01',
  '2024-05-01',
  '2024-06-01',
  '2024-07-01',
  '2024-08-01',
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Visitors',
        x: MONTHS,
        y: [320, 410, 380, 520, 610, 580, 690, 720],
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Sign-ups',
        x: MONTHS,
        y: [120, 150, 170, 160, 230, 260, 250, 310],
      },
    ],
    layout: {
      title: { text: 'Visitors and sign-ups' },
      xaxis: { title: { text: 'Month' } },
      yaxis: { title: { text: 'People' }, range: [0, 800] },
    },
  });

  /** Press `key` on the chart's focus target and wait for the hover it causes. */
  const press = (target: HTMLElement, key: string): Promise<void> =>
    new Promise((resolve) => {
      chart.once('hover', () => resolve());
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });

  const ready = chart.ready.then(async () => {
    const target = el.querySelector<HTMLElement>('.holochart-focus');
    if (!target) return;
    target.focus({ preventScroll: true });
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'PageDown']) {
      await press(target, key);
    }
  });
  return {
    ready,
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
