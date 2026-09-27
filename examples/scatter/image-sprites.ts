import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Image sprites (plan E8.11): `marker.image` draws an image (URL or data URI) at each point in a
 * `size` × `size` square keeping its aspect ratio, one per trace or per point. Images are packed
 * into a mipmapped texture atlas; `marker.opacity` and `marker.angle` apply, `marker.color` and the
 * outline don't. The images here are SVG data URIs embedded in the example (no network).
 */
export const meta: ExampleMeta = {
  title: 'Scatter: image sprites',
  description:
    'marker.image with embedded SVG data URIs: per-point images, sizes and angles, a translucent trace, and points without an image keeping their symbol.',
  tags: ['scatter', 'markers', 'images'],
  testTolerance: 0.004,
};

function svg(width: number, height: number, body: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}

const SUN = svg(
  64,
  64,
  '<g stroke="#f2b134" stroke-width="5" stroke-linecap="round">' +
    [0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => `<line x1="32" y1="4" x2="32" y2="12" transform="rotate(${a} 32 32)"/>`)
      .join('') +
    '</g><circle cx="32" cy="32" r="14" fill="#f2b134"/>',
);
const CLOUD = svg(
  64,
  40,
  '<path d="M16 36A12 12 0 0 1 14 12A15 15 0 0 1 42 8A12 12 0 0 1 52 36Z" fill="#eceef4"/>' +
    '<path d="M16 36H52" stroke="#80838f" stroke-width="3"/>',
);
const RAIN = svg(
  64,
  64,
  '<path d="M14 34A11 11 0 0 1 13 12A14 14 0 0 1 40 8A11 11 0 0 1 50 34Z" fill="#80838f"/>' +
    '<g stroke="#5e74d5" stroke-width="4" stroke-linecap="round">' +
    '<line x1="20" y1="42" x2="16" y2="56"/><line x1="32" y1="42" x2="28" y2="56"/>' +
    '<line x1="44" y1="42" x2="40" y2="56"/></g>',
);
const BADGE = svg(
  48,
  48,
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ea2a37"/><stop offset="1" stop-color="#9962c0"/></linearGradient></defs>' +
    '<rect x="4" y="4" width="40" height="40" rx="10" fill="url(#g)"/>' +
    '<path d="M14 25L21 32L35 17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
);

export function run(el: HTMLElement): ExampleHandle {
  const days = [1, 2, 3, 4, 5, 6, 7];
  const weather = [SUN, SUN, CLOUD, RAIN, RAIN, CLOUD, SUN];
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        name: 'forecast',
        mode: 'lines+markers',
        x: days,
        y: [24, 26, 21, 17, 16, 19, 23],
        line: { color: '#3e3e4c' },
        marker: { image: weather, size: 34 },
      },
      {
        type: 'scatter',
        name: 'badges',
        mode: 'markers',
        x: [1.5, 3, 4.5, 6, 7],
        y: [12, 13.5, 11, 12.5, 13],
        marker: {
          image: BADGE,
          size: [18, 24, 30, 24, 18],
          angle: [0, -10, 0, 10, 0],
        },
      },
      {
        type: 'scatter',
        name: 'faded, gaps',
        mode: 'markers',
        x: [2, 3.5, 5, 6.5],
        y: [8, 8.5, 7.5, 8.2],
        marker: {
          image: [CLOUD, '', CLOUD, ''],
          symbol: 'diamond',
          size: 26,
          color: '#118e36',
          opacity: 0.55,
        },
      },
    ],
    layout: { xaxis: { range: [0.4, 7.6] }, yaxis: { range: [5, 29] } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
