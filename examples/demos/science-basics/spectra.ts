import { createChart, type Chart, type ImageTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Emission line spectra as an `image` trace built from pixel values. A glowing gas gives off
 * light at a few exact wavelengths only, a fingerprint of the element: the visible lines of
 * hydrogen (656.3, 486.1, 434.0, 410.2 nm), helium (706.5, 667.8, 587.6, 501.6, 492.2, 471.3,
 * 447.1 nm), sodium (589.0 and 589.6 nm, too close to tell apart here) and mercury (579.1, 577.0,
 * 546.1, 435.8, 404.7 nm), under the continuous spectrum of white light from 380 to 750 nm.
 *
 * `z[row][column]` holds `[r, g, b, a]` (`colormodel: 'rgba'`): one column per 0.5 nm (`x0`,
 * `dx`), each spectrum a band of black pixel rows with a bright bar 1.5 nm wide at every line, in
 * the color of that wavelength (an approximate wavelength-to-RGB function; screens cannot show
 * pure spectral colors), and transparent rows between the bands. Images default to square pixels;
 * `yaxis.scaleanchor: false` lets this one fill the plot. The bands are named by `tickvals` and
 * `ticktext` on the y axis, and hover reads a per-pixel `text` with the wavelength of the line.
 */
export const meta: ExampleMeta = {
  title: 'Light: emission line spectra',
  description:
    'The visible emission lines of hydrogen, helium, sodium and mercury under the continuous spectrum, drawn as an RGBA image.',
  tags: ['demo', 'image', 'rgba', 'scientific', 'hover'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

const MIN = 380;
const MAX = 750;
const STEP = 0.5;
const COLUMNS = Math.round((MAX - MIN) / STEP);
/** Pixel rows per spectrum band, and transparent rows between bands. */
const BAND = 8;
const GAP = 3;
/** Half-width of a line's bar, in columns. */
const HALF = 1;

const SPECTRA: { name: string; lines: number[] }[] = [
  { name: 'White light', lines: [] },
  { name: 'Hydrogen', lines: [656.3, 486.1, 434.0, 410.2] },
  { name: 'Helium', lines: [706.5, 667.8, 587.6, 501.6, 492.2, 471.3, 447.1] },
  { name: 'Sodium', lines: [589.0, 589.6] },
  { name: 'Mercury', lines: [579.1, 577.0, 546.1, 435.8, 404.7] },
];

/**
 * An approximate screen color for light of one wavelength (nm), after Dan Bruton's piecewise
 * formula: violet to red, dimmer toward both ends of the visible range.
 */
function wavelengthToRgb(nm: number): [number, number, number] {
  const [r, g, b]: [number, number, number] =
    nm < 440
      ? [(440 - nm) / 60, 0, 1]
      : nm < 490
        ? [0, (nm - 440) / 50, 1]
        : nm < 510
          ? [0, 1, (510 - nm) / 20]
          : nm < 580
            ? [(nm - 510) / 70, 1, 0]
            : nm < 645
              ? [1, (645 - nm) / 65, 0]
              : [1, 0, 0];
  const fade =
    nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  const channel = (v: number): number => Math.round(255 * (v * fade) ** 0.8);
  return [channel(r), channel(g), channel(b)];
}

const nmOf = (column: number): number => MIN + (column + 0.5) * STEP;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const z: number[][][] = [];
  const text: string[][] = [];
  const centers: number[] = [];
  const clear = Array.from({ length: COLUMNS }, () => [0, 0, 0, 0]);
  const blank = Array.from({ length: COLUMNS }, () => '');
  SPECTRA.forEach((s, k) => {
    if (k > 0) {
      for (let g = 0; g < GAP; g++) {
        z.push(clear);
        text.push(blank);
      }
    }
    const pixels: number[][] = [];
    const labels: string[] = [];
    for (let c = 0; c < COLUMNS; c++) {
      const nm = nmOf(c);
      if (s.lines.length === 0) {
        pixels.push([...wavelengthToRgb(nm), 255]);
        labels.push(`${s.name}: every wavelength, here <b>${nm.toFixed(0)} nm</b>`);
        continue;
      }
      // The nearest line, if this column is inside its bar.
      const line = s.lines.reduce((a, b) => (Math.abs(b - nm) < Math.abs(a - nm) ? b : a));
      const on = Math.abs(line - nm) <= (HALF + 0.5) * STEP;
      pixels.push(on ? [...wavelengthToRgb(line), 255] : [0, 0, 0, 255]);
      labels.push(
        on ? `${s.name} line at <b>${line.toFixed(1)} nm</b>` : `${s.name}: no light here`,
      );
    }
    centers.push(z.length + (BAND - 1) / 2);
    for (let r = 0; r < BAND; r++) {
      z.push(pixels);
      text.push(labels);
    }
  });

  const image: ImageTrace = {
    type: 'image',
    z,
    colormodel: 'rgba',
    x0: MIN + STEP / 2,
    dx: STEP,
    text,
    hovertemplate: '%{text}<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [image],
    layout: {
      title: {
        text: narrow ? '' : 'Each element glows at its own wavelengths: a fingerprint in light',
      },
      margin: { l: 88, r: 24, b: 56 },
      xaxis: {
        title: { text: 'Wavelength (nm, billionths of a metre)' },
        range: [MIN, MAX],
        dtick: 50,
        showgrid: false,
        zeroline: false,
        constrain: 'range',
      },
      yaxis: {
        scaleanchor: false,
        range: [z.length - 0.5 + 1, -1.5],
        tickvals: centers,
        ticktext: SPECTRA.map((s) => s.name),
        tickfont: { color: LOOK.text },
        showgrid: false,
        zeroline: false,
        fixedrange: true,
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
