import { LinePrimitive, type LineCap, type LineDash, type LineJoin } from '@mk7s/holochart-render';
import { createDevStage } from '../_lib/stage.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Line primitive matrix (plan E2.5): every join × cap combination on translucent zigzags (seams at
 * joins would show as darker wedges), then every Plotly dash style at several widths on wavy lines
 * (dash phase must run continuously through the vertices).
 */
export const meta: ExampleMeta = {
  title: 'Lines: joins, caps & dashes',
  description:
    'Miter/round/bevel joins × butt/round/square caps, and Plotly dash styles at widths 1–8 px.',
  tags: ['dev', 'primitives', 'lines'],
  size: { width: 800, height: 600 },
};

const JOINS: LineJoin[] = ['miter', 'round', 'bevel'];
const CAPS: LineCap[] = ['butt', 'round', 'square'];
const DASHES: LineDash[] = [
  'solid',
  'dot',
  'dash',
  'longdash',
  'dashdot',
  'longdashdot',
  '5px,10px,2px',
];
const WIDTHS = [1, 2, 4, 8];

export function run(el: HTMLElement): ExampleHandle {
  const stage = createDevStage(el, { background: '#ffffff' });
  const add = (line: LinePrimitive): void => {
    stage.add(line);
  };

  // Joins × caps: zigzag with a right angle, an obtuse turn, and a sharp (≈25°) turn that exceeds
  // the default miter limit (4) and falls back to bevel.
  JOINS.forEach((join, col) => {
    CAPS.forEach((cap, row) => {
      const x0 = 30 + col * 260;
      const y0 = 590 - (row + 1) * 88;
      const px = [0, 50, 100, 130, 210, 150].map((v) => x0 + v);
      const py = [0, 50, 0, 60, 60, 30].map((v) => y0 + v + 10);
      add(
        new LinePrimitive(stage.context, {
          x: Float64Array.from(px),
          y: Float64Array.from(py),
          width: 14,
          join,
          cap,
          color: [0.16, 0.38, 0.85, 0.55],
        }),
      );
      // Thin centerline on top to show where the vertices are.
      add(
        new LinePrimitive(stage.context, {
          x: Float64Array.from(px),
          y: Float64Array.from(py),
          width: 1,
          color: [0.9, 0.2, 0.1, 1],
        }),
      );
    });
  });

  // Dash styles × widths on wavy lines.
  DASHES.forEach((dash, row) => {
    WIDTHS.forEach((width, col) => {
      const n = 48;
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = 20 + col * 195 + (i / (n - 1)) * 175;
        y[i] = 300 - row * 42 - 15 + 8 * Math.sin((i / (n - 1)) * Math.PI * 3);
      }
      add(
        new LinePrimitive(stage.context, {
          x,
          y,
          width,
          dash,
          join: 'round',
          color: [0.1, 0.1, 0.12, 1],
        }),
      );
    });
  });

  stage.render();
  return { renderer: stage.renderer, ready: Promise.resolve(), dispose: () => stage.dispose() };
}
