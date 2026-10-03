import { createChart, type Chart, type SurfaceTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace, R_GAS } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The ideal gas law as a landscape: the pressure of 1 mol of gas, P = nRT / V with
 * R = 8.314 J/(mol·K), as a `surface` over the volume (5 to 50 L) and the temperature (100 to
 * 600 K), in kPa (with V in litres, RT/V comes out in kPa). Lines of equal pressure every 100 kPa
 * are drawn on the surface (`contours.z`) and the color follows the pressure.
 *
 * Along the temperature axis the surface rises in straight lines (pressure is proportional to
 * temperature); along the volume axis it climbs ever more steeply as the gas is squeezed (halve
 * the volume, double the pressure). At 22.4 L and 273 K it passes through about 101 kPa, 1 atm.
 */
export const meta: ExampleMeta = {
  title: 'Ideal gas: pressure by volume and temperature',
  description:
    'A 3D surface of the pressure of 1 mol of ideal gas, P = nRT/V, over 5–50 L and 100–600 K, with contour lines every 100 kPa.',
  tags: ['demo', 'surface', '3d', 'contour', 'colorscale', 'physics'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

const MOLES = 1;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const volume = linspace(5, 50, 91); // L
  const kelvin = linspace(100, 600, 51);
  // J per litre is kPa.
  const z = kelvin.map((t) => volume.map((v) => (MOLES * R_GAS * t) / v));

  const surface: SurfaceTrace = {
    type: 'surface',
    name: 'P = nRT / V',
    x: volume,
    y: kelvin,
    z,
    cmin: 0,
    cmax: 1000,
    colorscale: [
      [0, '#2a3a8c'],
      [0.1, '#5e74d5'],
      [0.25, '#12a38a'],
      [0.5, '#e0b93a'],
      [1, '#ea2a37'],
    ],
    contours: {
      z: { show: true, start: 100, end: 900, size: 100, color: LOOK.bg, width: 1 },
    },
    colorbar: {
      title: { text: 'Pressure (kPa)', side: 'right' },
      thickness: 12,
      len: 0.7,
    },
    hovertemplate: '%{x:.1f} L at %{y:.0f} K<br><b>%{z:.0f} kPa</b><extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [surface],
    layout: {
      title: { text: narrow ? '' : 'Squeeze it or heat it: the pressure of 1 mol of gas' },
      margin: { t: narrow ? 16 : 40, l: 0, r: 0, b: 0 },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1.2, y: 1.2, z: 0.8 },
        xaxis: { title: { text: 'Volume (L)' }, range: [5, 50] },
        yaxis: { title: { text: 'Temperature (K)' }, range: [100, 600] },
        zaxis: { title: { text: 'Pressure (kPa)' }, range: [0, 1000] },
        camera: { eye: { x: 1.75, y: -1.75, z: 0.8 }, center: { x: 0, y: 0, z: -0.1 } },
      },
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
