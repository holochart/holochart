import { createMarkers, createRenderRoot, SYMBOL_COUNT, type RGBA } from '@mk7s/holochart-render';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Every marker symbol in every variant. Four blocks (filled, `-open`, `-dot`, `-open-dot`, in
 * reading order), each an 11 × 5 grid whose row-major order is the Plotly base code 0–54 documented
 * in `packages/render/src/markers/symbols.ts`.
 */
export const meta: ExampleMeta = {
  title: 'Marker symbols',
  description: 'All 55 Plotly marker symbols × {filled, open, dot, open-dot}, one draw call.',
  tags: ['dev', 'markers'],
  size: { width: 720, height: 400 },
};

const COLS = 11;
const ROWS = 5;
const FILL: RGBA = [0.34, 0.55, 0.85, 1];
const LINE: RGBA = [0.12, 0.16, 0.24, 1];

export function run(el: HTMLElement): ExampleHandle {
  const root = createRenderRoot(el, { background: [1, 1, 1, 1] });
  const viewport = root.addViewport({
    rect: { x: 0, y: 0, width: root.size.width, height: root.size.height },
  });

  const n = SYMBOL_COUNT * 4;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const symbol = new Float32Array(n);
  let i = 0;
  for (let variant = 0; variant < 4; variant++) {
    const bx = (variant % 2) * (COLS + 1);
    const by = Math.floor(variant / 2) * (ROWS + 1);
    for (let code = 0; code < SYMBOL_COUNT; code++) {
      x[i] = bx + (code % COLS);
      // Rows go down the screen; world y points up.
      y[i] = -(by + Math.floor(code / COLS));
      symbol[i] = code + 100 * variant;
      i++;
    }
  }

  const markers = createMarkers(root.context, {
    x,
    y,
    symbol,
    size: 18,
    color: FILL,
    lineColor: LINE,
    lineWidth: 1.5,
  });
  viewport.add(markers);

  const layout = (): void => {
    const { width, height } = root.size;
    viewport.setRect({ x: 0, y: 0, width, height });
    const gridW = 2 * COLS + 1;
    const gridH = 2 * ROWS + 1;
    const cell = Math.min(width / gridW, height / gridH);
    markers.setTransform({
      scaleX: cell,
      scaleY: cell,
      offsetX: (width - cell * gridW) / 2 + cell / 2,
      offsetY: height - (height - cell * gridH) / 2 - cell / 2,
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
