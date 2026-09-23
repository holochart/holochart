import { ArcPrimitive } from '@mk7s/holochart-render';
import { rng } from '../_lib/rng.ts';
import { createDevStage } from '../_lib/stage.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Arc primitive (plan E2.8), all wedges in ONE primitive (one draw call): a pie with thin inside
 * borders, a donut with d3-style pad angle + corner radius, a gauge (3/4 background ring + value
 * arc with fully rounded ends), and a full ring with a border (no seam at the start angle).
 * Slices are laid out Plotly-style: first slice starts at 12 o'clock, going clockwise.
 */
export const meta: ExampleMeta = {
  title: 'Arcs: pie, donut, gauge',
  description:
    'Instanced annular sectors: pie, padded rounded donut, 3/4 gauge and a full ring in one draw call.',
  tags: ['dev', 'primitives', 'arcs'],
  size: { width: 800, height: 500 },
};

const PALETTE = ['#636efa', '#ef553b', '#00cc96', '#ab63fa', '#ffa15a', '#19d3f3', '#ff6692'];

/** Hex → sRGB 0–1 RGBA. */
function rgba(hex: string, alpha = 1): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

interface Wedge {
  cx: number;
  cy: number;
  r0: number;
  r1: number;
  a0: number;
  a1: number;
  corner?: number;
  pad?: number;
  fill: string;
  border?: string;
  borderWidth?: number;
}

/** Plotly-style pie layout: rotation 0 → start at 12 o'clock; clockwise direction. */
function slices(values: number[], base: Omit<Wedge, 'a0' | 'a1' | 'fill'>): Wedge[] {
  const total = values.reduce((a, b) => a + b, 0);
  let theta = Math.PI / 2;
  return values.map((v, i) => {
    const a0 = theta;
    theta -= (v / total) * Math.PI * 2;
    return { ...base, a0, a1: theta, fill: PALETTE[i % PALETTE.length]! };
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const stage = createDevStage(el, { background: '#ffffff' });
  const { width, height } = stage.size;
  const random = rng(11);
  const cy = height * 0.55;
  const col = (k: number) => (width / 4) * (k + 0.5);
  const R = Math.min(width / 9, height * 0.3);

  const wedges: Wedge[] = [
    // Pie with thin white inside borders.
    ...slices(
      Array.from({ length: 5 }, () => 1 + random() * 4),
      { cx: col(0), cy, r0: 0, r1: R, border: '#ffffff', borderWidth: 1 },
    ),
    // Donut: constant-width 2·padRadius·sin(pad/2) px gaps, rounded corners.
    ...slices(
      Array.from({ length: 6 }, () => 1 + random() * 3),
      { cx: col(1), cy, r0: R * 0.58, r1: R, pad: 0.04, corner: 6 },
    ),
    // Gauge: 3/4 ring background (from 225° clockwise to -45°) and a 68% value arc.
    {
      cx: col(2),
      cy,
      r0: R * 0.78,
      r1: R,
      a0: (5 * Math.PI) / 4,
      a1: -Math.PI / 4,
      corner: R,
      fill: '#e5e7eb',
    },
    {
      cx: col(2),
      cy,
      r0: R * 0.78,
      r1: R,
      a0: (5 * Math.PI) / 4,
      a1: (5 * Math.PI) / 4 - 0.68 * 1.5 * Math.PI,
      corner: R,
      fill: '#00cc96',
    },
    // Full ring with a border: the start angle must not show a seam.
    {
      cx: col(3),
      cy,
      r0: R * 0.7,
      r1: R,
      a0: 1,
      a1: 1 + Math.PI * 2,
      fill: '#dbeafe',
      border: '#1d4ed8',
      borderWidth: 2,
    },
  ];

  const n = wedges.length;
  const f64 = (get: (w: Wedge) => number) => Float64Array.from(wedges, get);
  const f32 = (get: (w: Wedge) => number) => Float32Array.from(wedges, get);
  const colors = (get: (w: Wedge) => string | undefined) => {
    const out = new Float32Array(n * 4);
    wedges.forEach((w, i) => {
      const c = get(w);
      out.set(c ? rgba(c) : [0, 0, 0, 0], i * 4);
    });
    return out;
  };

  stage.add(
    new ArcPrimitive(stage.context, {
      x: f64((w) => w.cx),
      y: f64((w) => w.cy),
      innerRadius: f32((w) => w.r0),
      outerRadius: f32((w) => w.r1),
      startAngle: f32((w) => w.a0),
      endAngle: f32((w) => w.a1),
      cornerRadius: f32((w) => w.corner ?? 0),
      padAngle: f32((w) => w.pad ?? 0),
      fill: colors((w) => w.fill),
      borderColor: colors((w) => w.border),
      borderWidth: f32((w) => w.borderWidth ?? 0),
    }),
  );

  return { renderer: stage.renderer, dispose: () => stage.dispose() };
}
