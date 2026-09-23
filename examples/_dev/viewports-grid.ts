import {
  createMarkers,
  createRenderRoot,
  type Colorscale,
  type MarkerSet,
  type RGBA,
  type Viewport,
} from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3×3 scissored viewports in one WebGL context (E2.3, ADR-004): eight 2D marker panels and one 3D
 * perspective panel (center). Markers near panel edges are clipped to their own panel; the
 * bottom-right panel has `clip: false` so its markers may overflow (the `cliponaxis: false` path).
 */
export const meta: ExampleMeta = {
  title: 'Viewport grid',
  description:
    'Nine viewports (8 × 2D, 1 × 3D) sharing one canvas and context, scissored per panel.',
  tags: ['dev', 'viewports', 'markers'],
  size: { width: 720, height: 480 },
};

const GAP = 8;
const PALETTE: RGBA[] = [
  [0.12, 0.47, 0.71, 1],
  [1, 0.5, 0.05, 1],
  [0.17, 0.63, 0.17, 1],
  [0.84, 0.15, 0.16, 1],
  [0.58, 0.4, 0.74, 1],
  [0.55, 0.34, 0.29, 1],
  [0.89, 0.47, 0.76, 1],
  [0.5, 0.5, 0.5, 1],
];
const MAGMA: Colorscale = [
  [0, [0, 0, 0.02, 1]],
  [0.33, [0.45, 0.12, 0.51, 1]],
  [0.66, [0.93, 0.35, 0.37, 1]],
  [1, [0.99, 0.99, 0.75, 1]],
];

interface Panel {
  viewport: Viewport;
  markers: MarkerSet;
  is3d: boolean;
}

export function run(el: HTMLElement): ExampleHandle {
  const root = createRenderRoot(el, { background: [0.93, 0.94, 0.96, 1] });
  const random = rng(3);
  const normal = gaussian(random);
  const panels: Panel[] = [];

  for (let i = 0; i < 9; i++) {
    const is3d = i === 4;
    const viewport = root.addViewport({
      kind: is3d ? '3d' : '2d',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      background: is3d ? [0.1, 0.11, 0.14, 1] : [1, 1, 1, 1],
      clip: i !== 8,
    });
    let markers: MarkerSet;
    if (is3d) {
      // A helix of points in [-1, 1]³, colored by height.
      const n = 600;
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      const z = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 8;
        x[k] = Math.cos(t) * 0.8;
        z[k] = Math.sin(t) * 0.8;
        y[k] = (k / n) * 2 - 1;
      }
      markers = createMarkers(root.context, {
        x,
        y,
        z,
        colorValues: y,
        colorscale: MAGMA,
        cmin: -1,
        cmax: 1,
        size: 7,
        symbol: 'circle',
      });
      viewport.camera.position.set(2.6, 1.4, 2.6);
      viewport.camera.lookAt(0, 0, 0);
    } else {
      const n = 400;
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        x[k] = normal();
        y[k] = normal();
      }
      const index = i < 4 ? i : i - 1;
      markers = createMarkers(root.context, {
        x,
        y,
        size: 9,
        symbol: [0, 101, 2, 205, 17, 318, 26, 1][index]!,
        color: PALETTE[index]!,
        lineColor: [1, 1, 1, 1],
        lineWidth: 1,
        opacity: 0.85,
      });
    }
    viewport.add(markers);
    panels.push({ viewport, markers, is3d });
  }

  const layout = (): void => {
    const { width, height } = root.size;
    const cw = (width - GAP * 4) / 3;
    const ch = (height - GAP * 4) / 3;
    panels.forEach(({ viewport, markers, is3d }, i) => {
      const rect = {
        x: GAP + (i % 3) * (cw + GAP),
        y: GAP + Math.floor(i / 3) * (ch + GAP),
        width: cw,
        height: ch,
      };
      viewport.setRect(rect);
      if (!is3d) {
        // Data range ±2.5σ → panel; outliers fall outside and exercise clipping.
        const s = Math.min(cw, ch) / 5;
        markers.setTransform({ scaleX: s, scaleY: s, offsetX: cw / 2, offsetY: ch / 2 });
      }
    });
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
