import { createChart, type BoxTrace, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { G, linspace, normal, rng } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Timing a pendulum, simulated: for strings of 0.2, 0.4, 0.6, 0.8 and 1.0 m, twelve stopwatch
 * readings of the period (the time for one swing there and back). The "readings" are made up
 * with a seeded generator: the true period T = 2π√(L / g) plus normal noise of 0.03 s, about what
 * a hand on a stopwatch adds. One `box` per length on a numeric x axis (each trace's `x` is its
 * length, `width` in metres), with every reading drawn beside its box (`boxpoints: 'all'`,
 * `jitter`, `pointpos`). A `scatter` line draws the theory curve through them.
 *
 * The period grows with the square root of the length: a string four times as long (0.2 m to
 * 0.8 m) swings twice as slowly. The mass of the bob does not appear in the formula at all.
 */
export const meta: ExampleMeta = {
  title: 'Pendulum: period against length',
  description:
    'Box plots of twelve simulated stopwatch readings of a pendulum’s period at five lengths, with the theory curve T = 2π√(L/g).',
  tags: ['demo', 'box', 'scatter', 'points', 'jitter', 'statistical', 'simulated'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const LENGTHS = [0.2, 0.4, 0.6, 0.8, 1.0];
const READINGS = 12;
const NOISE = 0.03; // s

const period = (length: number): number => 2 * Math.PI * Math.sqrt(length / G);

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const noise = normal(rng(1602));

  const boxes = LENGTHS.map((length, k): BoxTrace => {
    const y = Array.from({ length: READINGS }, () => period(length) + NOISE * noise());
    return {
      type: 'box',
      name: 'Stopwatch readings (simulated)',
      legendgroup: 'readings',
      showlegend: k === 0,
      x: y.map(() => length),
      y,
      width: 0.07,
      boxpoints: 'all',
      jitter: 0.6,
      pointpos: -1.5,
      line: { color: LOOK.colorway[1], width: 1.25 },
      fillcolor: `${LOOK.colorway[1]}33`,
      marker: { color: LOOK.colorway[1], size: 4, opacity: 0.8 },
      hoverlabel: { namelength: 0 },
    };
  });
  const lengths = linspace(0.1, 1.1, 101);
  const theory: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Theory: T = 2π√(L / g)',
    x: lengths,
    y: lengths.map(period),
    line: { color: LOOK.colorway[0], width: 2 },
    hovertemplate: 'A %{x:.2f} m pendulum should take <b>%{y:.2f} s</b><extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [...boxes, theory],
    layout: {
      title: {
        text: narrow ? '' : 'A longer pendulum swings more slowly (12 simulated readings each)',
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Length of the pendulum (m)' },
        range: [0.08, 1.12],
        tickvals: LENGTHS,
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Period: time for one full swing (s)' },
        range: [0.7, 2.2],
        hoverformat: '.2f',
      },
      annotations: [
        {
          x: 0.8,
          y: period(0.8),
          ax: 40,
          ay: 70,
          text:
            `Four times the length, twice the period:<br>` +
            `${period(0.2).toFixed(2)} s at 0.2 m, ${period(0.8).toFixed(2)} s at 0.8 m`,
          align: 'left',
          arrowcolor: LOOK.text,
          arrowwidth: 1,
          font: { size: 11, color: LOOK.title },
        },
      ],
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
