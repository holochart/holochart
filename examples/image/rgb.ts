import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An RGB image from pixel values (plan E11.3): `z[row][column]` holds `[r, g, b]` components
 * (`colormodel: 'rgb'`, the default), drawn as one RGBA texture with square, unsmoothed pixels.
 * As in Plotly, the y axis defaults to reversed (row 0 at the top) and `scaleanchor` keeps the
 * pixels square. Hover shows the pixel's position and components.
 */
export const meta: ExampleMeta = {
  title: 'Image: RGB pixels',
  description: 'A 48 × 32 RGB test pattern from pixel values, with square pixels and pixel hover.',
  tags: ['image', 'scientific', 'rgb'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const w = 48;
  const h = 32;
  const z = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => {
      // Color bars on top, a gradient below, a checkerboard in the bottom-right corner.
      if (r < 12) {
        const bar = Math.floor(c / 6);
        return [bar & 1 ? 255 : 30, bar & 2 ? 255 : 30, bar & 4 ? 255 : 30];
      }
      if (c >= 36 && r >= 22) return (r + c) % 2 ? [240, 240, 240] : [20, 20, 20];
      return [Math.round((255 * c) / (w - 1)), Math.round((255 * (r - 12)) / (h - 13)), 128];
    }),
  );
  const chart = createChart(el, {
    data: [{ type: 'image', z }],
    layout: { title: { text: 'Test pattern' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
