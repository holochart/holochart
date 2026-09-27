import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * An RGB array as an image (plan E23.6): `px.imshow` of a `[row][col][channel]` array of 0–255
 * values. Express encodes it as a PNG (`binary_string`, the default for color images) and draws it
 * with an `image` trace, rows down from the top and square pixels; `x` / `y` place the pixel
 * centres in data units.
 */
export const meta: ExampleMeta = {
  title: 'Express: imshow of an RGB image',
  description: 'A synthetic landscape given as red, green and blue values per pixel.',
  tags: ['express', 'imshow', 'image', 'rgb', 'png'],
  size: { width: 640, height: 440 },
  testTolerance: 0.004,
};

const WIDTH = 160;
const HEIGHT = 100;

/** A landscape: a sky gradient, a sun, and two rolling hills. */
function landscape(): number[][][] {
  const image: number[][][] = [];
  for (let r = 0; r < HEIGHT; r++) {
    const row: number[][] = [];
    for (let c = 0; c < WIDTH; c++) {
      const t = r / HEIGHT;
      let pixel = [Math.round(40 + 200 * t), Math.round(90 + 110 * t), Math.round(200 - 40 * t)];
      if (Math.hypot(c - 118, r - 30) < 14) pixel = [255, 214, 90];
      const far = 62 + 8 * Math.sin(c / 17);
      const near = 76 + 10 * Math.sin(c / 11 + 2);
      if (r > far) pixel = [70, 130 - Math.round((r - far) * 0.8), 80];
      if (r > near) pixel = [40, 100 - Math.round((r - near) * 0.9), 45];
      row.push(pixel);
    }
    image.push(row);
  }
  return image;
}

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.imshow(landscape(), {
    x: Array.from({ length: WIDTH }, (_, i) => i * 0.5),
    y: Array.from({ length: HEIGHT }, (_, i) => i * 0.5),
    labels: { x: 'x (m)', y: 'y (m)' },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
