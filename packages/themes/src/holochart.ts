/**
 * Holochart's own themes (plan E8.1): `holochart` (the default look), `holochart-dark`,
 * `high-contrast` and `neon`. Design notes are in the docs (customization/themes-templates.md).
 */
import { DEFAULT_COLORWAY, DEFAULT_FONT_FAMILY, type Template } from '@mk7s/holochart-core';
import { bothAxes, colorbarDefaults, even, RDBU_BREWER, type Stops } from './shared.ts';

/**
 * The library defaults, spelled out: applying it changes nothing (tested), so it is what a chart
 * without `layout.template` looks like. White paper and plot area, `#444` text in Open Sans 12 px,
 * the D3 category10 colorway, light `#eee` grid, and Plotly's automatic colorscales (Reds, Blues,
 * RdBu). Use it as the base of a custom theme: `composeTemplates(holochart, { layout: … })`.
 */
export const holochart: Template = {
  layout: {
    paper_bgcolor: '#fff',
    plot_bgcolor: '#fff',
    font: { family: DEFAULT_FONT_FAMILY, size: 12, color: '#444' },
    colorway: [...DEFAULT_COLORWAY],
    colorscale: { sequential: 'Reds', sequentialminus: 'Blues', diverging: 'RdBu' },
    ...bothAxes({ gridcolor: '#eee', color: '#444' }),
  },
};

const DARK_BG = '#111418';
const DARK_INK = '#c9d1d9';
const DARK_AXIS = '#7d8590';

/**
 * The default look for dark UIs: a near-black blue-grey background (`#111418`), soft light text
 * (`#c9d1d9`, 11:1), a subtle `#262c36` grid under grey-blue axis lines, and a category10-ordered
 * colorway re-tuned for dark backgrounds (every color ≥ 6:1 against the background, so thin lines
 * and small markers stay legible). Viridis for sequential data (it stays bright where values are
 * high), ColorBrewer RdBu (blue low, red high) for diverging data.
 */
export const holochartDark: Template = /* @__PURE__ */ (() => {
  const colorbar = { outlinewidth: 0, tickcolor: DARK_AXIS };
  const colorbars = colorbarDefaults(colorbar, undefined);
  return {
    layout: {
      paper_bgcolor: DARK_BG,
      plot_bgcolor: DARK_BG,
      font: { color: DARK_INK },
      colorway: [
        '#4c9aff',
        '#ff9f43',
        '#34d399',
        '#f87171',
        '#c084fc',
        '#d4a373',
        '#f472b6',
        '#a1a1aa',
        '#e0d24a',
        '#22d3ee',
      ],
      colorscale: {
        sequential: 'Viridis',
        sequentialminus: 'Viridis',
        diverging: RDBU_BREWER.map(([p, c]): [number, string] => [1 - p, c]).reverse(),
      },
      ...colorbars.layout,
      ...bothAxes({
        color: DARK_AXIS,
        gridcolor: '#262c36',
        tickfont: { color: DARK_INK },
        title: { font: { color: DARK_INK } },
      }),
      legend: { bordercolor: DARK_AXIS },
      annotationdefaults: { arrowcolor: DARK_INK, font: { color: DARK_INK } },
      shapedefaults: { line: { color: DARK_INK } },
    },
    data: {
      ...colorbars.data,
      scatter: [{ type: 'scatter', marker: { colorbar } }],
      bar: [{ type: 'bar', marker: { colorbar } }],
    },
  };
})();

const HC_INK = '#000000';

/** ColorBrewer PuOr (11 colors): colorblind-safe, dark at both ends. */
const PUOR: Stops = /* @__PURE__ */ even([
  'rgb(127,59,8)',
  'rgb(179,88,6)',
  'rgb(224,130,20)',
  'rgb(253,184,99)',
  'rgb(254,224,182)',
  'rgb(247,247,247)',
  'rgb(216,218,235)',
  'rgb(178,171,210)',
  'rgb(128,115,172)',
  'rgb(84,39,136)',
  'rgb(45,0,75)',
]);

/**
 * For low vision, projectors and print (WCAG 2.2 oriented): black 14 px text on white (21:1),
 * black 1.5 px axis lines with outside ticks, a darker `#bdbdbd` grid, and a colorway in which
 * every color has at least 3:1 contrast against white (WCAG 1.4.11 non-text contrast; the first
 * four at least 5:1) with hues spread for color-vision deficiencies. Lines are 2.5 px, markers 8 px
 * with a white rim so overlapping points separate; bars get a black outline. Cividis (designed for
 * color-vision deficiency) for sequential data, ColorBrewer PuOr for diverging data. Hover labels
 * are white on black.
 */
export const highContrast: Template = /* @__PURE__ */ (() => {
  const colorbar = { outlinewidth: 1, outlinecolor: HC_INK, ticks: 'outside', tickcolor: HC_INK };
  const colorbars = colorbarDefaults(colorbar, undefined);
  return {
    layout: {
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      font: { color: HC_INK, size: 14 },
      colorway: [
        '#0057b8',
        '#c2410c',
        '#007a4d',
        '#9b1f8f',
        '#1a1a1a',
        '#b8860b',
        '#0e7c86',
        '#a3223a',
        '#5b3fc4',
        '#6b4e16',
      ],
      colorscale: { sequential: 'Cividis', sequentialminus: 'Cividis', diverging: PUOR },
      ...colorbars.layout,
      ...bothAxes({
        color: HC_INK,
        showline: true,
        linewidth: 1.5,
        ticks: 'outside',
        tickwidth: 1.5,
        ticklen: 6,
        gridcolor: '#bdbdbd',
        zerolinewidth: 1.5,
      }),
      legend: { bordercolor: HC_INK, borderwidth: 1 },
      hoverlabel: { bgcolor: HC_INK, bordercolor: '#ffffff', font: { color: '#ffffff' } },
      annotationdefaults: { arrowcolor: HC_INK, arrowwidth: 1.5 },
      shapedefaults: { line: { color: HC_INK, width: 1.5 } },
    },
    data: {
      ...colorbars.data,
      scatter: [
        {
          type: 'scatter',
          line: { width: 2.5 },
          marker: { size: 8, line: { color: '#ffffff', width: 1 }, colorbar },
        },
      ],
      bar: [{ type: 'bar', marker: { line: { color: HC_INK, width: 1 }, colorbar } }],
    },
  };
})();

const NEON_BG = '#07070f';
const NEON_PLOT = '#0b0b1a';
const NEON_INK = '#e8e8ff';
const NEON_CYAN = '#00f0ff';

/**
 * The glow showcase: saturated neon hues on a near-black indigo background, a faint cyan grid, a
 * magenta zero line, and a luminous title halo (`title.font.shadow`). Markers and bars get a thin
 * white-hot rim and lines are 2.5 px, which reads as a glowing core.
 *
 * Approximation: the plan's 3D glow is a bloom post-processing pass (E8.12), which does not exist
 * yet; in 2D the glow is approximated by the rims, the text halo and the palette's luminance
 * against the dark background. When bloom lands, this template turns it on. Colorscales are
 * interpolated in Oklab (`colorscaleInterpolation`), which keeps the neon ramps bright through
 * their midpoints.
 */
export const neon: Template = /* @__PURE__ */ (() => {
  const colorbar = { outlinewidth: 0, tickcolor: NEON_CYAN, ticks: 'outside' };
  const colorbars = colorbarDefaults(colorbar, undefined);
  const rim = { color: 'rgba(255,255,255,0.85)', width: 1 };
  return {
    layout: {
      paper_bgcolor: NEON_BG,
      plot_bgcolor: NEON_PLOT,
      font: { color: NEON_INK },
      title: { font: { color: '#ffffff', shadow: `0 0 6px ${NEON_CYAN}` } },
      colorway: [
        NEON_CYAN,
        '#ff2bd6',
        '#39ff14',
        '#ffe600',
        '#ff5f1f',
        '#b026ff',
        '#00ff9c',
        '#ff3860',
      ],
      colorscale: {
        sequential: [
          [0, '#240046'],
          [0.25, '#7b00d4'],
          [0.5, '#ff2bd6'],
          [0.75, '#ff9f1c'],
          [1, '#ffe600'],
        ],
        sequentialminus: [
          [0, '#ffe600'],
          [0.5, '#39ff14'],
          [1, NEON_CYAN],
        ],
        diverging: [
          [0, NEON_CYAN],
          [0.5, '#1b1b3a'],
          [1, '#ff2bd6'],
        ],
      },
      colorscaleInterpolation: 'oklab',
      ...colorbars.layout,
      ...bothAxes({
        color: 'rgba(0,240,255,0.55)',
        gridcolor: 'rgba(0,240,255,0.14)',
        zerolinecolor: 'rgba(255,43,214,0.6)',
        zerolinewidth: 1.5,
        tickfont: { color: '#b8bcff' },
        title: { font: { color: NEON_INK } },
      }),
      legend: { bordercolor: 'rgba(0,240,255,0.55)' },
      hoverlabel: { bgcolor: NEON_PLOT, bordercolor: NEON_CYAN, font: { color: NEON_INK } },
      annotationdefaults: { arrowcolor: NEON_CYAN, font: { color: NEON_INK } },
      shapedefaults: { line: { color: NEON_CYAN } },
    },
    data: {
      ...colorbars.data,
      scatter: [{ type: 'scatter', line: { width: 2.5 }, marker: { line: rim, colorbar } }],
      bar: [{ type: 'bar', marker: { line: rim, colorbar } }],
    },
  };
})();
