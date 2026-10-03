import { createChart, type Chart, type ParcoordsTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { PLANETS } from './data.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * The eight planets in parallel coordinates (`parcoords`): one line per planet through seven axes,
 * the planet itself (an ordinal axis from `tickvals` / `ticktext`), its distance from the Sun and
 * its mass (both spread over so many powers of ten that the axes carry the base-10 logarithm, with
 * the real values as tick text), diameter, density, surface gravity and mean temperature. Each
 * line takes its planet's color through an eight-step `line.colorscale`. The four rocky planets
 * run together (small, dense, close and warm) and the four giants run together (large, light for
 * their size, far and cold). Drag along an axis to select a range; the other lines dim.
 */
export const meta: ExampleMeta = {
  title: 'Planets: eight planets in parallel coordinates',
  description:
    'Parallel coordinates of the planets: distance from the Sun, mass, diameter, density, gravity and temperature, one colored line per planet.',
  tags: ['demo', 'parcoords', 'colorscale', 'log', 'astronomy'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const DISTANCE_TICKS = [0.4, 1, 2, 5, 10, 30];
const MASS_TICKS = [0.1, 1, 10, 100, 300];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const n = PLANETS.length;

  // One flat color step per planet: line k (0–7) falls in the middle of step k.
  const colorscale: [number, string][] = PLANETS.flatMap((p, k): [number, string][] => [
    [k / n, p.color],
    [(k + 1) / n, p.color],
  ]);

  const trace: ParcoordsTrace = {
    type: 'parcoords',
    labelfont: { size: 11 },
    tickfont: { size: 9 },
    line: {
      color: PLANETS.map((_, k) => k),
      colorscale,
      cmin: -0.5,
      cmax: n - 0.5,
      showscale: false,
    },
    dimensions: [
      {
        label: 'Planet',
        values: PLANETS.map((_, k) => k),
        tickvals: PLANETS.map((_, k) => k),
        ticktext: PLANETS.map((p) => p.name),
        range: [n - 0.5, -0.5],
      },
      {
        label: narrow ? 'Distance (AU)' : 'Distance from the Sun (AU)',
        values: PLANETS.map((p) => Math.log10(p.distance)),
        tickvals: DISTANCE_TICKS.map(Math.log10),
        ticktext: DISTANCE_TICKS.map(String),
        range: [Math.log10(0.3), Math.log10(40)],
      },
      {
        label: 'Mass (Earth = 1)',
        values: PLANETS.map((p) => Math.log10(p.mass / 5.97)),
        tickvals: MASS_TICKS.map(Math.log10),
        ticktext: MASS_TICKS.map(String),
        range: [Math.log10(0.04), Math.log10(400)],
      },
      {
        label: 'Diameter (km)',
        values: PLANETS.map((p) => p.diameter),
        range: [0, 150_000],
        tickformat: ',d',
      },
      {
        label: 'Density (kg/m³)',
        values: PLANETS.map((p) => p.density),
        range: [0, 6000],
        tickformat: ',d',
      },
      {
        label: 'Gravity (m/s²)',
        values: PLANETS.map((p) => p.gravity),
        range: [0, 25],
      },
      {
        label: narrow ? 'Temp. (°C)' : 'Mean temperature (°C)',
        values: PLANETS.map((p) => p.temperature),
        range: [-250, 500],
      },
    ].filter((_, i) => !narrow || [0, 1, 3, 4, 6].includes(i)),
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Two families of planets: small, dense and close, or large, light and far',
      },
      margin: { t: narrow ? 48 : 88, l: 64, r: 72, b: 32 },
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
