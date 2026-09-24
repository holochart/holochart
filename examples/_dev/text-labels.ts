import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
} from 'three';
import {
  createTextPrimitive,
  getDefaultFontMetricsOracle,
  preloadTextFont,
  TEXT_DEFAULT_FONT,
  type TextAnchorX,
  type TextAnchorY,
  type TextLabel,
} from '@mk7s/holochart-render';
import { createDevStage } from '../_lib/stage.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Text primitive (plan E2.9): one batched troika label set (one draw call, plus one for the outline
 * pass). Top left: the 12 anchor combinations with a red dot at each anchor point. Top right:
 * rotations in the Plotly `textangle` convention (clockwise positive). Middle: font sizes 8–32 px,
 * laid out left to right with the synchronous font metrics oracle. Bottom: wrapping (left and
 * centered), ellipsis truncation at a max width, and an outlined label.
 *
 * No font is configured: every label is drawn with the renderer's shipped default font (TeX Gyre
 * Heros), which is loaded before the sizes row is measured so the oracle measures that same font.
 */
export const meta: ExampleMeta = {
  title: 'Text: anchors, rotation, sizes, wrapping',
  description:
    'Batched SDF labels: 12 anchor combos, rotations, 8–32 px sizes, wrap and ellipsis boxes, outline.',
  tags: ['dev', 'primitives', 'text'],
  size: { width: 800, height: 500 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

/** Hex → sRGB 0–1 RGBA. */
function rgba(hex: string, alpha = 1): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

const INK = rgba('#2a3f5f');
const MUTED = rgba('#7f8fa6');

export function run(el: HTMLElement): ExampleHandle {
  const stage = createDevStage(el, { background: '#ffffff' });
  const labels: TextLabel[] = [];
  const dots: number[] = [];
  const boxes: number[] = [];
  const header = (text: string, x: number, y: number): void => {
    labels.push({ text, x, y, font: { size: 11 }, color: MUTED, anchorY: 'bottom' });
  };
  const box = (x0: number, y0: number, x1: number, y1: number): void => {
    boxes.push(
      x0,
      y0,
      0,
      x1,
      y0,
      0,
      x1,
      y0,
      0,
      x1,
      y1,
      0,
      x1,
      y1,
      0,
      x0,
      y1,
      0,
      x0,
      y1,
      0,
      x0,
      y0,
      0,
    );
  };

  labels.push({
    text: 'Text primitive',
    x: 20,
    y: 488,
    anchorY: 'top',
    font: { size: 18, weight: 'bold' },
  });

  // --- Anchors: columns = xanchor, rows = yanchor; the dot marks the label position.
  header('anchors (xanchor / yanchor)', 20, 432);
  const xs: TextAnchorX[] = ['left', 'center', 'right'];
  const ys: TextAnchorY[] = ['top', 'middle', 'bottom', 'baseline'];
  ys.forEach((anchorY, row) => {
    xs.forEach((anchorX, col) => {
      const x = 50 + col * 150;
      const y = 404 - row * 38;
      labels.push({ text: `${anchorX}/${anchorY}`, x, y, anchorX, anchorY, font: { size: 12 } });
      dots.push(x, y, 0);
    });
  });

  // --- Rotations, Plotly convention: positive angles turn clockwise on screen.
  header('rotation (textangle, clockwise +)', 430, 432);
  [0, 45, 90, -30].forEach((angle, i) => {
    const x = 450 + i * 90;
    const y = 360;
    labels.push({ text: `${angle}° label`, x, y, angle, anchorY: 'middle', font: { size: 13 } });
    dots.push(x, y, 0);
  });

  // --- Sizes, positioned with the synchronous metrics oracle (what the layout stage uses), once
  // the default font is loaded (below), so the oracle measures the font that is drawn.
  header('sizes 8–32 px (placed with the metrics oracle)', 20, 250);
  const placeSizes = (): void => {
    const oracle = getDefaultFontMetricsOracle();
    let cursor = 20;
    for (const size of [8, 10, 12, 14, 16, 20, 24, 32]) {
      const text = `${size}px`;
      labels.push({ text, x: cursor, y: 206, font: { size } });
      dots.push(cursor, 206, 0);
      cursor += oracle.measureWidth(text, { family: TEXT_DEFAULT_FONT.family, size }) + 18;
    }
  };

  // --- Wrapping and ellipsis at a max width; the boxes show the max width.
  const para =
    'Tick labels, titles, and annotations are SDF text: crisp at any zoom, in 2D and 3D alike.';
  header('wrap (maxWidth 180)', 20, 162);
  box(20, 40, 210, 160);
  labels.push({ text: para, x: 25, y: 155, anchorY: 'top', maxWidth: 180, font: { size: 13 } });

  header('wrap, centered', 230, 162);
  box(230, 40, 420, 160);
  labels.push({
    text: para,
    x: 325,
    y: 155,
    anchorX: 'center',
    anchorY: 'top',
    maxWidth: 180,
    font: { size: 13, style: 'italic' },
  });

  header('ellipsis (maxWidth 150)', 440, 162);
  box(440, 40, 600, 160);
  [
    'Short label',
    'A considerably longer category name',
    'Revenue (USD, inflation-adjusted)',
  ].forEach((text, i) => {
    labels.push({
      text,
      x: 445,
      y: 140 - i * 30,
      maxWidth: 150,
      overflow: 'ellipsis',
      anchorY: 'middle',
      font: { size: 13 },
    });
  });

  header('outline / halo', 620, 162);
  box(620, 40, 780, 160);
  labels.push({
    text: 'Halo',
    x: 700,
    y: 110,
    anchorX: 'center',
    anchorY: 'middle',
    font: { size: 28, weight: 'bold' },
    color: rgba('#ffffff'),
    outline: { width: 2, color: rgba('#636efa') },
  });
  labels.push({
    text: 'shadow',
    x: 700,
    y: 66,
    anchorX: 'center',
    anchorY: 'middle',
    font: { size: 18 },
    outline: { width: 0, blur: 2, offsetX: 1.5, offsetY: 1.5, color: rgba('#000000', 0.35) },
  });

  // Anchor dots and max-width boxes: plain three.js helpers, not primitives.
  const dotGeometry = new BufferGeometry();
  const dotMaterial = new PointsMaterial({ color: '#ef553b', size: 5, sizeAttenuation: false });
  const dotPoints = new Points(dotGeometry, dotMaterial);
  dotPoints.renderOrder = 1;
  stage.scene.add(dotPoints);

  const boxGeometry = new BufferGeometry();
  boxGeometry.setAttribute('position', new Float32BufferAttribute(boxes, 3));
  const boxMaterial = new LineBasicMaterial({ color: '#c8d4e3' });
  stage.scene.add(new LineSegments(boxGeometry, boxMaterial));

  let disposed = false;
  const ready = preloadTextFont({})
    .then(() => {
      if (disposed) return;
      placeSizes();
      dotGeometry.setAttribute('position', new Float32BufferAttribute(dots, 3));
      const text = createTextPrimitive(stage.context, { labels, style: { color: INK } });
      stage.add(text);
      return text.ready;
    })
    // Render synchronously once all glyphs are typeset, so the captured frame includes the text.
    .then(() => stage.render());

  return {
    ready,
    renderer: stage.renderer,
    dispose() {
      disposed = true;
      dotGeometry.dispose();
      dotMaterial.dispose();
      boxGeometry.dispose();
      boxMaterial.dispose();
      stage.dispose();
    },
  };
}
