import { RectPrimitive, type DataTransform } from '@mk7s/holochart-render';
import { rng } from '../_lib/rng.ts';
import { createDevStage } from '../_lib/stage.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Rect primitive (plan E2.7). Top: a seeded bar chart in data space (category index × value, mapped
 * through a DataTransform) with borders, per-bar corner radii, and negative bars (inverted rects,
 * y1 < y0). Bottom: 1 px borders at fractional positions, pixel snapping off (left) vs on (right).
 */
export const meta: ExampleMeta = {
  title: 'Rects: bars and pixel snapping',
  description:
    'Instanced bars with borders and corner radii; 1 px borders at fractional positions, snap off vs on.',
  tags: ['dev', 'primitives', 'rects'],
  size: { width: 800, height: 500 },
};

const BARS = 14;

/** Hex → sRGB 0–1 RGBA. */
function rgba(hex: string, alpha = 1): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

export function run(el: HTMLElement): ExampleHandle {
  const stage = createDevStage(el, { background: '#ffffff' });
  const { width, height } = stage.size;

  // --- Bar chart: x = category index, y = value in [-40, 100], plotted in the top 60%.
  const random = rng(7);
  const x0 = new Float64Array(BARS);
  const x1 = new Float64Array(BARS);
  const y0 = new Float64Array(BARS);
  const y1 = new Float64Array(BARS);
  const fill = new Float32Array(BARS * 4);
  const radius = new Float32Array(BARS);
  for (let i = 0; i < BARS; i++) {
    x0[i] = i - 0.38;
    x1[i] = i + 0.38;
    y0[i] = 0;
    y1[i] = random() < 0.2 ? -10 - random() * 30 : 10 + random() * 90;
    fill.set(y1[i]! < 0 ? rgba('#ef553b', 0.85) : rgba('#636efa', 0.85), i * 4);
    radius[i] = (i % 4) * 4; // 0, 4, 8, 12 px (clamped to half the bar width when larger)
  }
  const plotBottom = height * 0.42;
  const plotTop = height - 24;
  const transform: DataTransform = {
    scaleX: (width - 80) / BARS,
    offsetX: 40 + (width - 80) / BARS / 2,
    scaleY: (plotTop - plotBottom) / 140,
    offsetY: plotBottom + (40 * (plotTop - plotBottom)) / 140,
  };
  const bars = new RectPrimitive(stage.context, {
    x0,
    x1,
    y0,
    y1,
    fill,
    borderColor: rgba('#1f2a44'),
    borderWidth: 1.5,
    cornerRadius: radius,
  });
  bars.setTransform(transform);
  stage.add(bars);

  // Baseline: a sub-pixel-tall rect in data space, snapped to exactly one device pixel.
  const baseline = new RectPrimitive(stage.context, {
    x0: [-0.5],
    x1: [BARS - 0.5],
    y0: [-0.15],
    y1: [0.15],
    fill: rgba('#444444'),
    snap: true,
  });
  baseline.setTransform(transform);
  stage.add(baseline);

  // --- Snapping comparison: identical grids of cells at fractional px positions.
  const cols = 9;
  const rows = 4;
  const cellW = 17.6;
  const cellH = 13.3;
  const makeGrid = (left: number) => {
    const n = cols * rows;
    const g = {
      x0: new Float64Array(n),
      x1: new Float64Array(n),
      y0: new Float64Array(n),
      y1: new Float64Array(n),
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        g.x0[i] = left + c * 37.37 + r * 0.25;
        g.x1[i] = g.x0[i]! + cellW + c * 0.9;
        g.y0[i] = 30.4 + r * 34.63;
        g.y1[i] = g.y0[i]! + cellH + r * 0.7;
      }
    }
    return g;
  };
  const style = {
    fill: rgba('#fdfdfd'),
    borderColor: rgba('#111111'),
    borderWidth: 1,
  };
  stage.add(new RectPrimitive(stage.context, { ...makeGrid(22.3), ...style, snap: false }));
  stage.add(
    new RectPrimitive(stage.context, { ...makeGrid(width / 2 + 22.3), ...style, snap: true }),
  );
  // Divider between the two panels (snapped, 1 px).
  stage.add(
    new RectPrimitive(stage.context, {
      x0: [width / 2 - 0.5],
      x1: [width / 2 + 0.5],
      y0: [12],
      y1: [plotBottom - 60],
      fill: rgba('#bbbbbb'),
      snap: true,
    }),
  );

  return { renderer: stage.renderer, dispose: () => stage.dispose() };
}
