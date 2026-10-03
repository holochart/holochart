import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { G, linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The path of a ball thrown at 20 m/s at five angles, without air resistance (g = 9.81 m/s²):
 * x = v t cos θ, y = v t sin θ − ½ g t², one `scatter` line per angle. `yaxis.scaleanchor: 'x'`
 * gives both axes the same scale, so the curves have their true shape. Hover (a `hovertemplate`
 * reading `customdata`) gives the time since the throw at each point.
 *
 * The range is v² sin 2θ / g: longest at 45° (40.8 m), and equal for two angles that add up to
 * 90°, so 30° and 60° land on the same spot (35.3 m), as do 15° and 75° (20.4 m). The two
 * annotations say so.
 */
export const meta: ExampleMeta = {
  title: 'Motion: a ball thrown at five angles',
  description:
    'Height against distance for a ball thrown at 20 m/s at 15°, 30°, 45°, 60° and 75° without air resistance, on equal axis scales.',
  tags: ['demo', 'scatter', 'lines', 'scaleanchor', 'annotations', 'hover'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const SPEED = 20;
const ANGLES = [15, 30, 45, 60, 75];
const COLORS = [
  LOOK.colorway[6],
  LOOK.colorway[1],
  LOOK.colorway[0],
  LOOK.colorway[5],
  LOOK.colorway[2],
];

const reach = (deg: number): number => (SPEED ** 2 * Math.sin((2 * deg * Math.PI) / 180)) / G;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const traces = ANGLES.map((deg, k): ScatterTrace => {
    const rad = (deg * Math.PI) / 180;
    const flight = (2 * SPEED * Math.sin(rad)) / G;
    const t = linspace(0, flight, 81);
    return {
      type: 'scatter',
      mode: 'lines',
      name: `${deg}°`,
      x: t.map((s) => SPEED * Math.cos(rad) * s),
      // The last point is the landing: exactly 0, not a rounding error below it.
      y: t.map((s, i) => (i === 80 ? 0 : SPEED * Math.sin(rad) * s - 0.5 * G * s * s)),
      customdata: t,
      line: { color: COLORS[k], width: deg === 45 ? 3 : 2 },
      hovertemplate:
        `Thrown at ${deg}°<br>%{customdata:.2f} s after the throw` +
        '<br>%{x:.1f} m away, <b>%{y:.1f} m</b> high<extra></extra>',
    };
  });

  const note = (x: number, text: string, ay: number): LayoutAnnotation => ({
    x,
    y: 0,
    ax: 0,
    ay,
    text,
    arrowcolor: LOOK.text,
    arrowwidth: 1,
    font: { size: 11, color: LOOK.title },
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'A ball thrown at 20 m/s, no air resistance' },
      hovermode: 'closest',
      legend: {
        title: { text: 'Launch angle' },
        orientation: 'h',
        x: 1,
        xanchor: 'right',
        y: 1.02,
        yanchor: 'bottom',
      },
      xaxis: {
        title: { text: 'Distance (m)' },
        range: [0, 43],
        constrain: 'domain',
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Height (m)' },
        range: [0, 21],
        scaleanchor: 'x',
        constrain: 'domain',
        zeroline: true,
        zerolinecolor: LOOK.zero,
      },
      annotations: [
        note(reach(45), `45° goes farthest: ${reach(45).toFixed(1)} m`, -64),
        note(reach(30), `30° and 60° land on the same spot, ${reach(30).toFixed(1)} m`, -215),
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
