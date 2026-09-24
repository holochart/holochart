import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A lab measurement on log–log axes: the noise spectral density of a three-axis MEMS
 * accelerometer, with 1/f noise at low frequencies, a white floor, the sensor's mechanical
 * resonance and the anti-aliasing filter roll-off above it.
 *
 * The frequency axis writes values with SI prefixes and a unit suffix (`exponentformat: 'SI'`,
 * `ticksuffix: 'Hz'`), and `minexponent: 0` extends the prefixes to small values, so 0.1 Hz reads
 * `100mHz`. `autorangeoptions.minallowed` / `maxallowed` pin the autorange to the 0.1 Hz – 10 kHz
 * analysis band although the FFT bins extend past it. On the density axis
 * `exponentformat: 'power'` writes decades as powers of ten, and `autorangeoptions.clipmin` keeps
 * the filter roll-off from stretching the autorange down to 10⁻⁹. Both axes carry minor ticks and
 * a dotted minor grid at the 2–9 multiples of each decade.
 */
export const meta: ExampleMeta = {
  title: 'Axes: log–log noise spectrum',
  description:
    'Accelerometer noise density on log axes: SI and power exponent formats, minor log grid, autorange pinned and clipped.',
  tags: ['axes', 'log', 'science', 'line', 'minor-ticks'],
  size: { width: 760, height: 460 },
  testTolerance: 0.004,
};

/** Noise density model, g/√Hz: white floor, 1/f corner, resonance and a 4-pole low-pass. */
function density(f: number, floor: number, corner: number): number {
  const f0 = 5600;
  const q = 18;
  const r = f / f0;
  const resonance = 1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2);
  const lowpass = 1 / Math.sqrt(1 + (f / 9000) ** 8);
  return floor * Math.sqrt(1 + corner / f) * resonance * lowpass;
}

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(11);
  const normal = gaussian(random);
  // Log-spaced FFT bins from 0.05 Hz to 20 kHz.
  const n = 420;
  const freq = Float64Array.from(
    { length: n },
    (_, i) => 0.05 * 10 ** ((i / (n - 1)) * Math.log10(4e5)),
  );
  const axis = (floor: number, corner: number) =>
    Float64Array.from(freq, (f) => density(f, floor, corner) * Math.exp(normal() * 0.12));

  const chart = createChart(el, {
    data: [
      { name: 'X axis', x: freq, y: axis(2.2e-5, 3), line: { width: 1.5 } },
      { name: 'Y axis', x: freq, y: axis(2.6e-5, 2), line: { width: 1.5 } },
      { name: 'Z axis', x: freq, y: axis(4.1e-5, 6), line: { width: 1.5 } },
      {
        name: 'Datasheet limit',
        x: [0.1, 10000],
        y: [1.2e-4, 1.2e-4],
        mode: 'lines',
        line: { color: '#d85c5c', dash: 'dash', width: 1.5 },
      },
    ],
    layout: {
      title: { text: 'Accelerometer noise density, 25 °C, ±2 g range' },
      xaxis: {
        type: 'log',
        title: { text: 'Frequency' },
        exponentformat: 'SI',
        minexponent: 0,
        ticksuffix: 'Hz',
        hoverformat: '.3s',
        autorangeoptions: { minallowed: 0.1, maxallowed: 10000 },
        ticks: 'outside',
        minor: {
          ticks: 'outside',
          ticklen: 3,
          tickcolor: '#6b6e7c',
          showgrid: true,
          gridwidth: 0.5,
          griddash: 'dot',
        },
      },
      yaxis: {
        type: 'log',
        title: { text: 'Noise density (g/√Hz)' },
        exponentformat: 'power',
        hoverformat: '.2e',
        autorangeoptions: { clipmin: 1e-6 },
        ticks: 'outside',
        minor: {
          ticks: 'outside',
          ticklen: 3,
          tickwidth: 1,
          tickcolor: '#6b6e7c',
          showgrid: true,
          gridwidth: 0.5,
          griddash: 'dot',
        },
      },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
