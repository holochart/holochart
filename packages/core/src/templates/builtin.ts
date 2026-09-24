/**
 * The templates every bundle knows (ADR-021): `holochart`, Holochart's default look, and
 * `plotly-classic` / `none`, Plotly's look. The runtime's shared registry registers them and makes
 * `holochart` its default; core itself applies none of them (a fresh `createRegistry()` has no
 * default template, so `supplyDefaults` stays Plotly-pure).
 *
 * They live in core, not in `@mk7s/holochart-themes`, so partial bundles (runtime + one trace
 * package) get the default look and `setDefaultTemplate('plotly-classic')` without the themes
 * package. The themes package re-exports these same objects.
 */
import { DEFAULT_COLORWAY, DEFAULT_FONT_FAMILY } from '../layout/schema.ts';
import type { Template } from './templates.ts';

/** Name of the template the runtime's shared registry applies when `layout.template` is unset. */
export const DEFAULT_TEMPLATE_NAME = 'holochart';

/**
 * Font family of the default look. Charts draw it with the first family that is registered
 * (`fonts.register`) and otherwise with the renderer's bundled default font.
 */
export const HOLOCHART_FONT_FAMILY = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * Colorway of the default look: saturated mid-luminance hues, ordered so neighbours differ in hue
 * (red, blue, indigo, emerald, orange, teal, gold, magenta), each legible as a 1.25 px line on
 * the `#0a0a0f` background.
 */
export const HOLOCHART_COLORWAY = [
  '#ea2a37',
  '#5e74d5',
  '#9962c0',
  '#118e36',
  '#cc540a',
  '#128b8b',
  '#997600',
  '#b8267e',
] as const;

const BG = '#0a0a0f';
const GRID = '#1a1a22';
const AXIS = '#2c2c38';
const ZERO = '#3e3e4c';
const TEXT = '#a4a7b5';
const TICK = '#80838f';
const TITLE = '#eceef4';

/**
 * Holochart's default look (ADR-021): a dark, dense chart. `#0a0a0f` paper and plot area, a faint
 * `#1a1a22` grid, `#2c2c38` axis lines with short outside ticks, 9 px text (8 px tick labels, an
 * 11 px left-aligned title) in Helvetica Neue, tight margins that axes grow as needed
 * (`automargin`), a transparent horizontal legend above the plot area, dark hover labels, thin
 * lines and small markers, borderless bars, slim colorbars.
 *
 * Colorscales follow one rule on a dark background: **brighter means further from zero**.
 * - `sequential` is the "neon plasma" ramp: deep violet → violet → magenta → orange → pale yellow.
 *   It starts at a violet that still shows on the background, so the lowest values don't vanish.
 * - `sequentialminus` (data that is all negative) mirrors it in cool hues: pale cyan at the most
 *   negative value, fading to a dark (but visible) blue at zero, so negative-only and
 *   positive-only data are told apart by hue while brightness still encodes magnitude.
 * - `diverging` has a muted neutral midpoint (clearly lighter than the background, so values
 *   near zero stay visible), blue → cyan for negative values and magenta → orange for positive ones, both ends
 *   about equally bright. Light-midpoint scales like RdBu glare on a dark page and make the least
 *   interesting values the most prominent.
 */
export const holochartTemplate: Template = /* @__PURE__ */ (() => {
  const colorbar = {
    thickness: 10,
    outlinewidth: 0,
    xpad: 6,
    ticks: 'outside',
    ticklen: 3,
    tickcolor: AXIS,
    tickfont: { size: 8, color: TICK },
  };
  const axis = {
    color: TEXT,
    showline: true,
    linecolor: AXIS,
    gridcolor: GRID,
    zerolinecolor: ZERO,
    ticks: 'outside',
    ticklen: 3,
    tickcolor: AXIS,
    tickfont: { size: 8, color: TICK },
    title: { font: { size: 9, color: TEXT }, standoff: 4 },
    automargin: true,
  };
  return {
    layout: {
      paper_bgcolor: BG,
      plot_bgcolor: BG,
      font: { family: HOLOCHART_FONT_FAMILY, size: 9, color: TEXT },
      title: {
        font: { size: 11, color: TITLE },
        // Left-aligned: `xanchor: 'auto'` resolves to `left` at this `x`, and still centers a
        // figure's own `title.x: 0.5` (a common Plotly setting) instead of left-anchoring it.
        x: 0.01,
        // Top-left, above the legend row; `margin.t` leaves room for both.
        y: 1,
        yanchor: 'top',
        pad: { t: 6 },
      },
      colorway: [...HOLOCHART_COLORWAY],
      colorscale: {
        sequential: [
          // Starts at a violet that still reads on the background, so the lowest values show.
          [0, '#3a0ca3'],
          [0.3, '#6a00f4'],
          [0.6, '#ff2bd6'],
          [0.85, '#ff9e00'],
          [1, '#f9f871'],
        ],
        sequentialminus: [
          [0, '#c8f7ff'],
          [0.15, '#3fd0e0'],
          [0.4, '#2f7de1'],
          [0.7, '#2a1a8f'],
          [1, '#1f2a6b'],
        ],
        diverging: [
          [0, '#6fe3ff'],
          [0.25, '#2f7de1'],
          // Neutral, but lighter than the background so values near zero stay visible.
          [0.5, '#4b475c'],
          [0.75, '#ff2bd6'],
          [1, '#ff9e00'],
        ],
      },
      margin: { l: 40, r: 16, t: 42, b: 32, pad: 0 },
      xaxis: axis,
      yaxis: axis,
      legend: {
        orientation: 'h',
        x: 0,
        xanchor: 'left',
        y: 1,
        yanchor: 'bottom',
        bgcolor: 'rgba(0,0,0,0)',
        font: { size: 9, color: TEXT },
        itemwidth: 30,
        tracegroupgap: 4,
      },
      hoverlabel: {
        bgcolor: '#15151d',
        bordercolor: ZERO,
        font: { size: 9, color: TITLE },
      },
      coloraxis: { colorbar },
      modebar: { bgcolor: 'rgba(10,10,15,0.6)', color: '#4a4c58', activecolor: TEXT },
      annotationdefaults: { arrowcolor: TEXT, arrowwidth: 1, font: { color: TEXT } },
      shapedefaults: { line: { color: TEXT, width: 1 } },
    },
    data: {
      // Marker outlines (bubbles, or any width a figure sets) take the background color, which
      // separates overlapping markers on dark the way Plotly's white rims do on white.
      scatter: [
        {
          line: { width: 1.25 },
          marker: { size: 4, line: { width: 0, color: BG }, colorbar },
        },
      ],
      // Error bars default to Plotly's #444, which disappears on the dark background.
      bar: [
        {
          marker: { line: { width: 0 }, colorbar },
          error_x: { color: TICK },
          error_y: { color: TICK },
        },
      ],
      // A background-colored rim separates the slices.
      pie: [{ marker: { line: { color: BG, width: 1 } } }],
    },
  };
})();

/**
 * Plotly's look, spelled out: the library's schema defaults (white paper and plot area, `#444`
 * text in Open Sans 12 px, the D3 category10 colorway, a light `#eee` grid, Plotly's automatic
 * colorscales Reds / Blues / RdBu). `layout.template: 'plotly-classic'` renders exactly what
 * `layout.template: 'none'` (or `null`) renders; unlike `none` it can be the base of a
 * composition (`composeTemplates(plotlyClassicTemplate, …)`).
 */
export const plotlyClassicTemplate: Template = /* @__PURE__ */ (() => {
  const axis = { gridcolor: '#eee', color: '#444' };
  return {
    layout: {
      paper_bgcolor: '#fff',
      plot_bgcolor: '#fff',
      font: { family: DEFAULT_FONT_FAMILY, size: 12, color: '#444' },
      colorway: [...DEFAULT_COLORWAY],
      colorscale: { sequential: 'Reds', sequentialminus: 'Blues', diverging: 'RdBu' },
      xaxis: axis,
      yaxis: axis,
    },
  };
})();

/** The empty template (plotly.py's `none`): schema defaults only, i.e. Plotly's look. */
export const noneTemplate: Template = {};
