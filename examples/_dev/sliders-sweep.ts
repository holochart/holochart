import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A slider (plan E5.11) sweeping a parameter with `restyle`: each step replaces the wave's `y` for
 * one frequency. The slider sits below the plot and pushes the bottom margin (Plotly's
 * `autoMargin`); the current value shows `prefix + label + suffix` above the rail, tick labels
 * thin out when they would overlap. The handle is a `role="slider"` (arrow keys, Home/End,
 * PageUp/PageDown).
 */
export const meta: ExampleMeta = {
  title: 'Sliders: parameter sweep (restyle)',
  description:
    'A slider under the plot steps a sine wave through frequencies with restyle; current value label and thinned tick labels.',
  tags: ['dev', 'chart', 'sliders', 'restyle'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

const N = 200;
const X = Array.from({ length: N }, (_, i) => (i / (N - 1)) * 2 * Math.PI);
const FREQUENCIES = Array.from({ length: 21 }, (_, k) => 1 + k * 0.25);
const wave = (f: number): number[] => X.map((x) => Math.sin(f * x));

export function run(el: HTMLElement): ExampleHandle {
  const active = 4;
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'sin(ƒx)',
        x: X,
        y: wave(FREQUENCIES[active] as number),
      },
    ],
    layout: {
      title: { text: 'Frequency sweep' },
      yaxis: { range: [-1.2, 1.2] },
      sliders: [
        {
          active,
          currentvalue: { prefix: 'ƒ = ', suffix: ' Hz' },
          steps: FREQUENCIES.map((f) => ({
            label: f.toFixed(2),
            method: 'restyle',
            args: ['y', [wave(f)]],
          })),
        },
      ],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
