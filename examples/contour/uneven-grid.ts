import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Contours on an uneven grid (plan E11.2): a resonance map sampled densely near its peak and
 * sparsely elsewhere (x from a geometric sequence, y refined around 1). Marching squares runs in
 * grid-index space and every crossing is placed by interpolating between the actual grid
 * coordinates, so the levels land where the data puts them whatever the spacing; the grid points
 * are drawn on top as small markers.
 */
export const meta: ExampleMeta = {
  title: 'Contour: uneven grid',
  description: 'A resonance peak sampled on a non-uniform grid, with the grid points shown.',
  tags: ['contour', 'scientific', 'uneven'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 24 }, (_, i) => +(0.2 * 1.12 ** i).toFixed(4));
  const y = [0, 0.3, 0.55, 0.75, 0.88, 0.95, 1, 1.05, 1.12, 1.25, 1.45, 1.75, 2.1];
  const z = y.map((py) =>
    x.map((px) => {
      const d = px - 1.6;
      return 1 / (1 + 4 * d * d + 6 * (py - 1) ** 2) + 0.05 * px;
    }),
  );
  const gx: number[] = [];
  const gy: number[] = [];
  for (const py of y) {
    for (const px of x) {
      gx.push(px);
      gy.push(py);
    }
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        x,
        y,
        z,
        ncontours: 12,
        contours: { showlabels: true, labelfont: { size: 8, color: '#0a0a0f' } },
        line: { color: 'rgba(10, 10, 15, 0.55)' },
        colorbar: { title: { text: 'response' } },
      },
      {
        type: 'scatter',
        mode: 'markers',
        x: gx,
        y: gy,
        marker: { size: 2.5, color: 'rgba(236, 238, 244, 0.7)' },
        hoverinfo: 'skip',
        showlegend: false,
      },
    ],
    layout: {
      title: { text: 'Resonance on an uneven grid' },
      xaxis: { title: { text: 'frequency' } },
      yaxis: { title: { text: 'damping' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
