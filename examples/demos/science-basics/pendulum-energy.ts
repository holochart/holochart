import { createChart, type BarTrace, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { G } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * A pendulum trading energy back and forth, as an animation: a 1 kg bob on a 1 m string,
 * released from 30°, through one full swing in 41 `frames` (every 1/40 of the period, 2.04 s).
 * The left subplot draws the pendulum (a `scatter` line from the pivot to a marker, on fixed axes
 * with equal scales); the right subplot is a `bar` trace with the kinetic energy ½ m v², the
 * potential energy m g h (h measured from the lowest point) and their total, 1.31 J at every
 * moment. Each frame names the three traces it changes (`traces`) and gives their new `x` / `y`;
 * scatter and bar traces tween between frames.
 *
 * The Play button runs `animate(null, …)` at 51 ms per frame, which is real time, and Pause stops
 * it (`layout.updatemenus`); the `layout.sliders` time slider follows playback and can be dragged
 * to any moment. Nothing plays until Play is pressed: the chart rests on the first frame, the bob
 * at its release point with all its energy potential. The angle is found by integrating the
 * pendulum equation θ″ = −(g / L) sin θ (Runge–Kutta), not the small-angle shortcut, so the total
 * is constant to the last digit.
 */
export const meta: ExampleMeta = {
  title: 'Pendulum: kinetic and potential energy',
  description:
    'An animated pendulum next to bars of its kinetic, potential and total energy over one swing, with Play and Pause buttons and a time slider.',
  tags: ['demo', 'animation', 'frames', 'scatter', 'bar', 'sliders', 'updatemenus', 'subplots'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const LENGTH = 1; // m
const MASS = 1; // kg
const RELEASE = (30 * Math.PI) / 180;
const STEPS = 40;

/** The arithmetic-geometric mean, for the exact period of a pendulum at any amplitude. */
function agm(a: number, b: number): number {
  while (Math.abs(a - b) > 1e-15) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return a;
}
const PERIOD = (2 * Math.PI * Math.sqrt(LENGTH / G)) / agm(1, Math.cos(RELEASE / 2));
const TOTAL = MASS * G * LENGTH * (1 - Math.cos(RELEASE));

interface Moment {
  t: number;
  x: number;
  y: number;
  kinetic: number;
  potential: number;
}

/** The swing at `STEPS + 1` evenly spaced times over one period (RK4, 200 substeps each). */
function swing(): Moment[] {
  const sub = 200;
  const dt = PERIOD / STEPS / sub;
  const acc = (theta: number): number => -(G / LENGTH) * Math.sin(theta);
  let theta = RELEASE;
  let omega = 0;
  const out: Moment[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const speed = LENGTH * omega;
    out.push({
      t: (i * PERIOD) / STEPS,
      x: LENGTH * Math.sin(theta),
      y: -LENGTH * Math.cos(theta),
      kinetic: 0.5 * MASS * speed * speed,
      potential: MASS * G * LENGTH * (1 - Math.cos(theta)),
    });
    for (let s = 0; s < sub; s++) {
      const k1t = omega;
      const k1w = acc(theta);
      const k2t = omega + (dt / 2) * k1w;
      const k2w = acc(theta + (dt / 2) * k1t);
      const k3t = omega + (dt / 2) * k2w;
      const k3w = acc(theta + (dt / 2) * k2t);
      const k4t = omega + dt * k3w;
      const k4w = acc(theta + dt * k3t);
      theta += (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
      omega += (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    }
  }
  return out;
}

const ENERGY_COLORS = [LOOK.colorway[4], LOOK.colorway[1], LOOK.text];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const moments = swing();
  const first = moments[0]!;
  const frameMs = Math.round((PERIOD * 1000) / STEPS);

  const rod = (m: Moment): { x: number[]; y: number[] } => ({ x: [0, m.x], y: [0, m.y] });
  const bob = (m: Moment): { x: number[]; y: number[] } => ({ x: [m.x], y: [m.y] });
  const bars = (m: Moment): { y: number[] } => ({
    y: [m.kinetic, m.potential, m.kinetic + m.potential],
  });

  const rodTrace: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    ...rod(first),
    line: { color: LOOK.text, width: 2 },
    hoverinfo: 'skip',
  };
  const bobTrace: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    ...bob(first),
    marker: { color: LOOK.colorway[0], size: 26, line: { color: LOOK.title, width: 1 } },
    hovertemplate: 'Bob: %{x:.2f} m to the side, %{y:.2f} m below the pivot<extra></extra>',
  };
  const barTrace: BarTrace = {
    type: 'bar',
    x: ['Kinetic<br>(moving)', 'Potential<br>(height)', 'Total'],
    ...bars(first),
    xaxis: 'x2',
    yaxis: 'y2',
    width: 0.6,
    marker: { color: ENERGY_COLORS },
    hovertemplate: '<b>%{y:.2f} J</b><extra></extra>',
  };
  // The path of the bob and the pivot: drawn once, not touched by the frames.
  const arc = Array.from({ length: 61 }, (_, i) => -RELEASE + (2 * RELEASE * i) / 60);
  const path: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    x: arc.map((a) => LENGTH * Math.sin(a)),
    y: arc.map((a) => -LENGTH * Math.cos(a)),
    line: { color: LOOK.zero, width: 1, dash: 'dot' },
    hoverinfo: 'skip',
  };
  const pivot: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    x: [0],
    y: [0],
    marker: { color: LOOK.text, size: 7 },
    hoverinfo: 'skip',
  };

  const animation = (duration: number): Record<string, unknown> => ({
    frame: { duration, redraw: false },
    transition: { duration, easing: 'linear' },
  });

  const chart: Chart = createChart(chartEl, {
    data: [rodTrace, bobTrace, barTrace, path, pivot],
    frames: moments.map((m, i) => ({
      name: String(i),
      traces: [0, 1, 2],
      data: [rod(m), bob(m), bars(m)],
    })),
    layout: {
      title: {
        text: narrow ? '' : 'A swinging pendulum: energy changes form, the total stays the same',
      },
      showlegend: false,
      hovermode: 'closest',
      bargap: 0.4,
      margin: { b: 120 },
      xaxis: {
        domain: [0, 0.46],
        range: [-0.75, 0.75],
        constrain: 'domain',
        title: { text: 'Sideways position (m)' },
        zeroline: false,
        fixedrange: true,
      },
      yaxis: {
        range: [-1.15, 0.15],
        scaleanchor: 'x',
        constrain: 'domain',
        title: { text: 'Height below the pivot (m)' },
        zeroline: false,
        fixedrange: true,
      },
      xaxis2: { domain: [0.6, 1], anchor: 'y2', type: 'category', fixedrange: true },
      yaxis2: {
        anchor: 'x2',
        range: [0, 1.7],
        title: { text: 'Energy (J)' },
        hoverformat: '.2f',
        fixedrange: true,
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.62,
          xanchor: 'left',
          align: 'left',
          y: 1,
          yanchor: 'top',
          showarrow: false,
          text:
            '1 kg on a 1 m string, let go at 30°<br>' +
            `${TOTAL.toFixed(2)} J in total, one swing takes ${PERIOD.toFixed(2)} s`,
          font: { size: 11, color: LOOK.title },
        },
      ],
      updatemenus: [
        {
          type: 'buttons',
          direction: 'left',
          showactive: false,
          x: 0,
          xanchor: 'left',
          y: -0.22,
          yanchor: 'top',
          pad: { t: 12 },
          buttons: [
            {
              label: 'Play',
              method: 'animate',
              args: [null, { ...animation(frameMs), fromcurrent: true }],
            },
            {
              label: 'Pause',
              method: 'animate',
              args: [[null], { ...animation(0), mode: 'immediate' }],
            },
          ],
        },
      ],
      sliders: [
        {
          active: 0,
          x: 0.16,
          len: 0.84,
          y: -0.22,
          yanchor: 'top',
          pad: { t: 12 },
          currentvalue: { prefix: 'Time: ', suffix: ' s', xanchor: 'right' },
          transition: { duration: frameMs, easing: 'linear' },
          steps: moments.map((m, i) => ({
            label: m.t.toFixed(2),
            method: 'animate',
            args: [[String(i)], { ...animation(frameMs), mode: 'immediate' }],
          })),
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
