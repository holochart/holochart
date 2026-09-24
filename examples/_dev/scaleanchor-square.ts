import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeInteraction } from './spikes-hook.mts';

/**
 * Aspect lock (plan E3.9): `yaxis.scaleanchor: 'x'` makes one unit as long on y as on x, so the
 * unit circle stays round in a wide subplot. Left, `constrain: 'range'` (the default): the x range
 * widens to fill the subplot. Right, `constrain: 'domain'` with `constraintoward: 'left'`: the x
 * axis keeps its range and its subplot shrinks instead, pinned to the left. Zooming either axis
 * zooms its partner, keeping the circle round.
 */
export const meta: ExampleMeta = {
  title: 'Aspect lock: scaleanchor with range and domain constraints',
  description:
    'A unit circle kept round by yaxis.scaleanchor: x, constrained by widening the range (left) or shrinking the domain (right).',
  tags: ['dev', 'axes', 'scaleanchor', 'constrain', 'subplots', 'scatter'],
  size: { width: 760, height: 380 },
  testTolerance: 0.004,
};

function polygon(sides: number, r: number, turn = 0): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i <= sides; i++) {
    const a = turn + (2 * Math.PI * i) / sides;
    x.push(Math.round(r * Math.cos(a) * 1e6) / 1e6);
    y.push(Math.round(r * Math.sin(a) * 1e6) / 1e6);
  }
  return { x, y };
}

export function run(el: HTMLElement): ExampleHandle {
  const circle = polygon(96, 1);
  const square = polygon(4, Math.SQRT2, Math.PI / 4);
  const triangle = polygon(3, 0.5, Math.PI / 2);
  const shapes = [
    { name: 'circle', ...circle },
    { name: 'square', ...square },
    { name: 'triangle', ...triangle },
  ];
  const chart = createChart(el, {
    data: [
      ...shapes.map((s) => ({ type: 'scatter', mode: 'lines', name: s.name, x: s.x, y: s.y })),
      ...shapes.map((s) => ({
        type: 'scatter',
        mode: 'lines',
        name: s.name,
        x: s.x,
        y: s.y,
        xaxis: 'x2',
        yaxis: 'y2',
      })),
    ],
    layout: {
      title: { text: 'scaleanchor: constrain range (left) and domain (right)' },
      showlegend: false,
      xaxis: { domain: [0, 0.48], zeroline: false },
      yaxis: { scaleanchor: 'x', zeroline: false },
      xaxis2: {
        domain: [0.52, 1],
        anchor: 'y2',
        zeroline: false,
        constrain: 'domain',
        constraintoward: 'left',
      },
      yaxis2: { anchor: 'x2', scaleanchor: 'x2', zeroline: false },
    },
  });
  const dispose = exposeInteraction(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
