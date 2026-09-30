import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A waterfall of ribbons (plan E14.10, a Holochart extension): the spectrum of a chirp at twelve
 * moments, each a `scatter3d` line at its time (y) drawn with `line.render: 'ribbon'`, a lit strip
 * swept along the y axis (`line.ribbon.axis: 'y'`) by `line.ribbon.width` (0.6 s, in y axis
 * units). The ribbons are colored by amplitude along their length (`line.color` numbers through a
 * shared colorscale), like a spectrogram in 3D.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: ribbons (a spectrogram waterfall)',
  description: 'Spectra over time as lit ribbons swept along the time axis.',
  tags: ['scatter3d', '3d', 'lines', 'ribbon', 'waterfall', 'holochart-extension'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const bins = 120;
  const freq = Array.from({ length: bins }, (_, i) => (i / (bins - 1)) * 1000);
  const data = Array.from({ length: 12 }, (_, k) => {
    const time = k;
    const peak = 150 + 60 * k;
    const amp = freq.map(
      (f) =>
        Math.exp(-(((f - peak) / 45) ** 2)) +
        0.45 * Math.exp(-(((f - 2 * peak) / 70) ** 2)) +
        0.05 * (1 + Math.sin(f / 23 + k)),
    );
    return {
      type: 'scatter3d',
      mode: 'lines',
      name: `t = ${time} s`,
      showlegend: false,
      x: freq,
      y: freq.map(() => time),
      z: amp,
      line: {
        render: 'ribbon',
        ribbon: { axis: 'y', width: 0.6 },
        color: amp,
        colorscale: 'Plasma',
        cmin: 0,
        cmax: 1.1,
        showscale: k === 0,
        colorbar: { title: { text: 'amplitude' } },
      },
    };
  });
  const chart = createChart(el, {
    data,
    layout: {
      title: { text: 'Chirp spectrum over time' },
      scene: {
        camera: { eye: { x: 1.2, y: -1.8, z: 0.9 } },
        aspectmode: 'manual',
        aspectratio: { x: 1.4, y: 1, z: 0.5 },
        xaxis: { title: { text: 'frequency (Hz)' } },
        yaxis: { title: { text: 'time (s)' } },
        zaxis: { title: { text: 'amplitude' } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
