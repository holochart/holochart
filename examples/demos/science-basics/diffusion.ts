import {
  createChart,
  type Chart,
  type Figure,
  type Histogram2dTrace,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { rng } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Simulated diffusion, the way a drop of ink spreads in still water: 20,000 particles start at the
 * center and each takes steps of length 1 in a random direction (a 2D random walk from the seeded
 * `rng`, so every run draws the same picture). A `histogram2d` counts the particles in 3 × 3
 * squares; the "Time" toggle shows the cloud after 10, 100 and 1,000 steps with `chart.react(…)`,
 * on fixed axis ranges and bins (`xbins`, `ybins`) so the three clouds are comparable. The dotted
 * circle (a layout `shape`) is the typical distance from the start, √steps: a hundred times
 * longer only spreads the cloud ten times wider.
 */
export const meta: ExampleMeta = {
  title: 'Diffusion: a random walk spreads out',
  description:
    'Simulated 2D random walk of 20,000 particles as a 2D histogram after 10, 100 and 1,000 steps, on fixed bins.',
  tags: ['demo', 'histogram2d', 'shapes', 'react', 'colorscale', 'simulation', 'physics'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

type Time = '10' | '100' | '1000';

const PARTICLES = 20_000;
const TIMES: readonly Time[] = ['10', '100', '1000'];
const HALF = 75;
const BIN = 3;

/** Positions of every particle after 10, 100 and 1,000 steps. */
function walk(): Record<Time, { x: Float32Array; y: Float32Array }> {
  const random = rng(20);
  const x = new Float32Array(PARTICLES);
  const y = new Float32Array(PARTICLES);
  const out = {} as Record<Time, { x: Float32Array; y: Float32Array }>;
  let step = 0;
  for (const time of TIMES) {
    for (; step < Number(time); step++) {
      for (let i = 0; i < PARTICLES; i++) {
        const a = 2 * Math.PI * random();
        x[i] = (x[i] as number) + Math.cos(a);
        y[i] = (y[i] as number) + Math.sin(a);
      }
    }
    out[time] = { x: x.slice(), y: y.slice() };
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const clouds = walk();

  const figure = (time: Time): Figure => {
    const steps = Number(time);
    const typical = Math.sqrt(steps);
    const cloud: Histogram2dTrace = {
      type: 'histogram2d',
      x: clouds[time].x,
      y: clouds[time].y,
      xbins: { start: -HALF, end: HALF, size: BIN },
      ybins: { start: -HALF, end: HALF, size: BIN },
      zmin: 0,
      colorscale: [
        [0, LOOK.bg],
        [0.15, '#27306b'],
        [0.5, '#5e74d5'],
        [1, '#eceef4'],
      ],
      colorbar: { title: { text: 'Particles per square', side: 'right' }, thickness: 12 },
      hovertemplate: 'x %{x}, y %{y}<br><b>%{z}</b> particles<extra></extra>',
    };
    const ring: LayoutShape = {
      type: 'circle',
      x0: -typical,
      x1: typical,
      y0: -typical,
      y1: typical,
      line: { color: '#e3b04b', width: 1.25, dash: 'dot' },
    };
    return {
      data: [cloud],
      layout: {
        title: {
          text: narrow
            ? ''
            : `Simulated diffusion: 20,000 particles after ${steps.toLocaleString('en-US')} random steps`,
        },
        xaxis: {
          title: { text: 'x (step lengths)' },
          range: [-HALF, HALF],
          constrain: 'domain',
          showgrid: false,
          zeroline: false,
        },
        yaxis: {
          title: { text: 'y (step lengths)' },
          range: [-HALF, HALF],
          scaleanchor: 'x',
          constrain: 'domain',
          showgrid: false,
          zeroline: false,
        },
        shapes: [ring],
        annotations: [
          {
            x: -HALF + 4,
            y: HALF - 4,
            xanchor: 'left',
            yanchor: 'top',
            showarrow: false,
            align: 'left',
            text:
              `Dotted circle: typical distance from the start,<br>` +
              `√${steps.toLocaleString('en-US')} ≈ ${typical.toFixed(1)} step lengths.<br>` +
              `The spread grows with the square root of time.`,
            font: { size: 10, color: '#e3b04b' },
          },
        ],
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('100'));

  segmented<Time>(
    toolbar,
    'Time',
    [
      { value: '10', text: '10 steps' },
      { value: '100', text: '100 steps' },
      { value: '1000', text: '1,000 steps' },
    ],
    (value) => void chart.react(figure(value)),
    '100',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
