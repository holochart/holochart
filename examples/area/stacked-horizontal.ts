import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Horizontal stacked area (plan E9.4): `orientation: 'h'` stacks the x values instead of y, and
 * stacking then implies `fill: 'tonextx'`. The first trace of the group that sets `orientation`
 * decides for the group. This suits profiles over a vertical variable such as altitude or depth.
 */
export const meta: ExampleMeta = {
  title: 'Area: horizontal stack',
  description:
    "Stacked x values with orientation: 'h' (fill: 'tonextx'): a composition profile over altitude.",
  tags: ['area', 'stacked', 'horizontal', 'fill', 'scatter'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Closed-form particle counts per size class over altitude, in particles per cm³.
  const altitude = Array.from({ length: 41 }, (_, i) => i * 0.25);
  const classes = [
    { name: 'Fine', f: (h: number) => 60 * Math.exp(-h / 2.5) + 4 },
    { name: 'Medium', f: (h: number) => 35 * Math.exp(-(((h - 2) / 2.2) ** 2)) + 3 },
    { name: 'Coarse', f: (h: number) => 25 * Math.exp(-h / 1.2) + 1 },
  ];

  const chart = createChart(el, {
    data: classes.map((c, k) => ({
      type: 'scatter',
      name: c.name,
      x: altitude.map(c.f),
      y: altitude,
      stackgroup: 'profile',
      ...(k === 0 ? { orientation: 'h' } : {}),
    })),
    layout: {
      hovermode: 'y unified',
      xaxis: { title: { text: 'Particles per cm³' } },
      yaxis: { title: { text: 'Altitude (km)' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
