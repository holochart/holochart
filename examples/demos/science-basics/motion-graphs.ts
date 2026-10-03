import { createChart, type Chart, type LayoutShape, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { G, linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Motion graphs of a ball thrown straight up at 15 m/s (no air resistance, g = 9.81 m/s²):
 * height h = v t − ½ g t², velocity v − g t and acceleration −g against time, until it lands
 * after 2v / g = 3.06 s. Three `scatter` traces in three stacked subplots that share the time
 * axis: the traces use `yaxis: 'y'`, `'y2'` and `'y3'`, whose `domain`s split the plot's height,
 * all anchored to one `xaxis`, so hover (`hovermode: 'x unified'`) reads all three at one time.
 *
 * A dotted line (a `shapes` line across the paper's height) and three markers pick out the top
 * of the flight at 1.53 s: the height peaks at 11.5 m, the velocity passes through zero, and
 * the acceleration is the same −9.81 m/s² as at every other moment.
 */
export const meta: ExampleMeta = {
  title: 'Motion: height, velocity and acceleration of a thrown ball',
  description:
    'Three stacked graphs on one time axis for a ball thrown straight up at 15 m/s: height, velocity and acceleration, with the top of the flight marked.',
  tags: ['demo', 'scatter', 'lines', 'subplots', 'shapes', 'annotations', 'hover'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

const SPEED = 15;
const FLIGHT = (2 * SPEED) / G;
const TOP = SPEED / G;
const PEAK = SPEED ** 2 / (2 * G);

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const t = linspace(0, FLIGHT, 121);
  const [cHeight, cVelocity, cAccel] = [LOOK.colorway[1], LOOK.colorway[3], LOOK.colorway[4]];

  const line = (
    name: string,
    y: number[],
    yaxis: 'y' | 'y2' | 'y3',
    color: string,
    unit: string,
  ): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x: t,
    y,
    yaxis,
    line: { color, width: 2 },
    hovertemplate: `%{y:.2f} ${unit}`,
  });
  const top = (y: number, yaxis: 'y' | 'y2' | 'y3', color: string): ScatterTrace => ({
    type: 'scatter',
    mode: 'markers',
    x: [TOP],
    y: [y],
    yaxis,
    marker: { color, size: 9, line: { color: LOOK.title, width: 1.5 } },
    hoverinfo: 'skip',
    showlegend: false,
  });

  const topLine: LayoutShape = {
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: TOP,
    x1: TOP,
    y0: 0,
    y1: 1,
    line: { color: LOOK.text, width: 1, dash: 'dot' },
  };
  const axis = (text: string, domain: [number, number]): Record<string, unknown> => ({
    title: { text },
    domain,
    zeroline: true,
    zerolinecolor: LOOK.zero,
  });

  const chart: Chart = createChart(chartEl, {
    data: [
      line(
        'Height',
        t.map((s, i) => (i === 120 ? 0 : SPEED * s - 0.5 * G * s * s)),
        'y',
        cHeight,
        'm',
      ),
      line(
        'Velocity',
        t.map((s) => SPEED - G * s),
        'y2',
        cVelocity,
        'm/s',
      ),
      line(
        'Acceleration',
        t.map(() => -G),
        'y3',
        cAccel,
        'm/s²',
      ),
      top(PEAK, 'y', cHeight),
      top(0, 'y2', cVelocity),
      top(-G, 'y3', cAccel),
    ],
    layout: {
      title: {
        text: narrow ? '' : 'A ball thrown straight up at 15 m/s, no air resistance',
      },
      hovermode: 'x unified',
      showlegend: false,
      margin: { l: 72, r: 24 },
      xaxis: {
        title: { text: 'Time since the throw (s)' },
        range: [0, FLIGHT],
        anchor: 'y3',
        hoverformat: '.2f',
        ticksuffix: ' s',
      },
      yaxis: { ...axis('Height (m)', [0.7, 1]), range: [0, 13.5] },
      yaxis2: { ...axis('Velocity (m/s)', [0.35, 0.65]), range: [-18, 18] },
      yaxis3: { ...axis('Acceleration (m/s²)', [0, 0.3]), range: [-12, 2], dtick: 5 },
      shapes: [topLine],
      annotations: [
        {
          x: TOP,
          y: PEAK,
          yref: 'y',
          xanchor: 'left',
          xshift: 10,
          yshift: -46,
          showarrow: false,
          align: 'left',
          text: `Top of the flight: ${PEAK.toFixed(1)} m after ${TOP.toFixed(2)} s`,
          font: { size: 11, color: LOOK.title },
        },
        {
          x: TOP,
          y: 0,
          yref: 'y2',
          xanchor: 'left',
          xshift: 10,
          yshift: 12,
          showarrow: false,
          text: 'Velocity is zero at the top: the ball stops for an instant',
          font: { size: 11, color: LOOK.title },
        },
        {
          x: TOP,
          y: -G,
          yref: 'y3',
          xanchor: 'left',
          xshift: 10,
          yshift: 14,
          showarrow: false,
          text: 'Gravity pulls just as hard all the way: −9.81 m/s²',
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
