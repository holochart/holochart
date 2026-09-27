import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Slices of a 3D array as facets (plan E23.6): `px.imshow(img, facet_col=0, facet_col_wrap=3)`
 * draws each `[time][row][col]` slice as its own heatmap in a wrapped grid, labelled `time=0`,
 * `time=1`, …. The slices share one colorscale (`coloraxis`) spanning the whole array, and their
 * axes `match`, so the panels compare directly.
 */
export const meta: ExampleMeta = {
  title: 'Express: imshow facets over a 3D array',
  description: 'A diffusing blob sampled at six times, one heatmap per time step.',
  tags: ['express', 'imshow', 'heatmap', 'facets', 'subplots', 'coloraxis'],
  size: { width: 720, height: 480 },
  testTolerance: 0.004,
};

const SIZE = 24;
const STEPS = 6;

/** A Gaussian blob drifting right and spreading out: `[time][row][col]`. */
function blob(): number[][][] {
  return Array.from({ length: STEPS }, (_, t) => {
    const cx = 6 + t * 2.4;
    const cy = 12 + Math.sin(t) * 2;
    const s2 = 2 * (2 + t) ** 2;
    const peak = 10 / (1 + t * 0.5);
    return Array.from({ length: SIZE }, (_, r) =>
      Array.from(
        { length: SIZE },
        (_, c) => peak * Math.exp(-((c - cx) ** 2 + (r - cy) ** 2) / s2),
      ),
    );
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.imshow(blob(), {
    facetCol: 0,
    facetColWrap: 3,
    colorContinuousScale: 'Viridis',
    labels: { facet_col: 'time', color: 'Concentration' },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
