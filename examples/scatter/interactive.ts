import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A scatter plot to try the interactions on: hover a point for its label (a `hovertemplate` that
 * reads `customdata` and the trace name), drag to zoom, double-click to reset, and switch to pan,
 * box select or lasso from the modebar. The three series sit on a regular grid of ten points
 * each, so what a zoom or a selection picked is easy to read.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: hover, zoom and select',
  description:
    'Three series of ten markers with a hovertemplate and customdata, to try hover, zoom, pan, box select and lasso on.',
  tags: ['scatter', 'markers', 'interaction', 'hover'],
  size: { width: 640, height: 400 },
};

const NAMES = ['low', 'mid', 'high'];

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 10 }, (_, i) => i);
  const chart = createChart(el, {
    data: NAMES.map((name, k) => ({
      type: 'scatter',
      mode: 'markers',
      name,
      x,
      y: x.map((v) => v * 10 + k * 3),
      customdata: x.map((v) => `p${k}-${v}`),
      marker: { size: 10 },
      hovertemplate: 'x=%{x} y=%{y:.1f} %{customdata}<extra>%{fullData.name}</extra>',
    })),
    layout: {
      xaxis: { range: [-1, 10] },
      yaxis: { range: [-10, 100] },
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
