import { createMarkers, createRenderRoot, type Colorscale } from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/** ~100k seeded points colored by a value through a Viridis LUT (E2.12), one draw call. */
export const meta: ExampleMeta = {
  title: 'Markers colored by a colorscale',
  description:
    '100k seeded markers whose fill comes from a 256-texel Viridis LUT via cmin/cmax uniforms.',
  tags: ['dev', 'markers', 'colorscale'],
  size: { width: 640, height: 400 },
};

/** Plotly's Viridis stops (8-bit sRGB, converted to 0–1 below). */
const VIRIDIS_STOPS: readonly (readonly [number, number, number, number])[] = [
  [0, 68, 1, 84],
  [0.13, 71, 44, 122],
  [0.25, 59, 81, 139],
  [0.38, 44, 113, 142],
  [0.5, 33, 144, 141],
  [0.63, 39, 173, 129],
  [0.75, 92, 200, 99],
  [0.88, 170, 220, 50],
  [1, 253, 231, 37],
];
const VIRIDIS: Colorscale = VIRIDIS_STOPS.map(([p, r, g, b]) => [
  p,
  [r / 255, g / 255, b / 255, 1],
]);

const COUNT = 100_000;
const MARGIN = 24;

export function run(el: HTMLElement): ExampleHandle {
  const root = createRenderRoot(el, { background: [0.97, 0.97, 0.98, 1] });
  const viewport = root.addViewport({ background: [1, 1, 1, 1] });

  const random = rng(42);
  const normal = gaussian(random);
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  const value = new Float64Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const cluster = i % 3;
    const cx = [-1.5, 1.2, 0.2][cluster]!;
    const cy = [-0.6, 0.4, 1.6][cluster]!;
    x[i] = cx + normal() * 0.8;
    y[i] = cy + normal() * 0.6;
    value[i] = Math.hypot(x[i]!, y[i]!);
  }

  const markers = createMarkers(root.context, {
    x,
    y,
    colorValues: value,
    colorscale: VIRIDIS,
    cmin: 0,
    cmax: 3.5,
    size: 3,
    opacity: 0.8,
  });
  viewport.add(markers);

  const layout = (): void => {
    const { width, height } = root.size;
    const rect = { x: MARGIN, y: MARGIN, width: width - 2 * MARGIN, height: height - 2 * MARGIN };
    viewport.setRect(rect);
    // Data range [-4.5, 4] × [-3, 4] → viewport pixels.
    const sx = rect.width / 8.5;
    const sy = rect.height / 7;
    markers.setTransform({ scaleX: sx, scaleY: sy, offsetX: 4.5 * sx, offsetY: 3 * sy });
  };
  const offResize = root.on('resize', layout);
  layout();
  root.renderNow();

  return {
    renderer: root.renderer,
    ready: Promise.resolve(),
    dispose() {
      offResize();
      root.destroy();
    },
  };
}
