import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A surface on `x` / `y` vectors (plan E14.3): one x per column and one y per row of `z`, here
 * unevenly spaced (x on a log-like ramp, denser near 0), so the grid cells stretch with the data.
 * The coordinates live in textures next to the heights; the surface stays one GPU draw.
 */
export const meta: ExampleMeta = {
  title: 'Surface: x and y vectors',
  description: 'A response surface on unevenly spaced x and y coordinates, with axis titles.',
  tags: ['surface', '3d', 'scientific'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Dose (uneven: denser at low doses) and time.
  const dose = linspace(0, 1, 40).map((t) => 100 * t ** 2);
  const time = linspace(0, 48, 30);
  const z = sample(dose, time, (d, t) => (d / (d + 12)) * (1 - Math.exp(-t / 10)) * 100);
  const chart = createChart(el, {
    data: [
      {
        type: 'surface',
        x: dose,
        y: time,
        z,
        colorbar: { title: { text: 'response (%)' } },
      },
    ],
    layout: {
      title: { text: 'Dose response over time' },
      scene: {
        xaxis: { title: { text: 'dose (mg)' } },
        yaxis: { title: { text: 'time (h)' } },
        zaxis: { title: { text: 'response' } },
        aspectmode: 'cube',
        camera: { eye: { x: 1.6, y: -1.4, z: 0.8 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
