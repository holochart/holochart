/**
 * Plotly's templates (plotly.py `plotly.io.templates`): `plotly`, `plotly_white`, `plotly_dark`,
 * `simple_white`, `ggplot2`, `seaborn`, `presentation`, `xgridoff`, `ygridoff`, `gridon` and
 * `none`, with plotly.py's values for everything Holochart draws: backgrounds, fonts, colorways,
 * automatic colorscales, axis grid/line/zero-line/tick styling, colorbars, bar outlines, error
 * bars, annotation/shape defaults and table fills.
 *
 * Blocks for subplot types Holochart does not have yet (polar, ternary, geo, mapbox, 3D scenes)
 * and widgets (sliders, update menus) are left out; they join these templates with their E-stories.
 * Trace types that are not registered simply ignore their template entries.
 */
import { noneTemplate, type Template } from '@mk7s/holochart-core';
import {
  bothAxes,
  colorbarDefaults,
  D3_COLORWAY,
  PATTERN,
  PIYG,
  PLASMA,
  PLOTLY_COLORWAY,
  RDBU_BREWER,
  VIRIDIS,
  type Stops,
  type TemplateData,
  type TemplateLayout,
} from './shared.ts';

interface FamilyOptions {
  /** Text, annotation arrows, shapes and error bars. */
  ink: string;
  paper: string;
  plot: string;
  axis: Record<string, unknown>;
  colorway: readonly string[];
  colorscale: { sequential: Stops; sequentialminus?: Stops; diverging?: Stops };
  colorbar: Record<string, unknown>;
  /** Bar/histogram outline. */
  barLine: Record<string, unknown>;
  /** Table fills: `[cells, header]`, and the grid line color. */
  table: readonly [cells: string, header: string, line: string];
  /** Extra layout keys. */
  layout?: TemplateLayout;
  /** Extra per-type trace defaults, merged over the family's. */
  data?: TemplateData;
  /** Show `title.x = 0.05` (every full plotly.py template does). */
  titleX?: number;
}

/** A full plotly.py-style template from its palette of values. */
function family(o: FamilyOptions): Template {
  const colorbars = colorbarDefaults(o.colorbar, o.colorscale.sequential);
  const colorscale: Record<string, Stops> = {
    sequential: o.colorscale.sequential,
    sequentialminus: o.colorscale.sequentialminus ?? o.colorscale.sequential,
  };
  if (o.colorscale.diverging) colorscale['diverging'] = o.colorscale.diverging;
  const errors = { color: o.ink };
  return {
    layout: {
      annotationdefaults: { arrowcolor: o.ink, arrowhead: 0, arrowwidth: 1 },
      ...colorbars.layout,
      colorscale,
      colorway: [...o.colorway],
      font: { color: o.ink },
      hoverlabel: { align: 'left' },
      hovermode: 'closest',
      paper_bgcolor: o.paper,
      plot_bgcolor: o.plot,
      shapedefaults: { line: { color: o.ink } },
      title: { x: o.titleX ?? 0.05 },
      ...bothAxes({ automargin: true, autotypenumbers: 'strict', ...o.axis }),
      ...o.layout,
    },
    data: {
      ...colorbars.data,
      bar: [
        {
          type: 'bar',
          error_x: errors,
          error_y: errors,
          marker: { line: o.barLine, pattern: PATTERN },
        },
      ],
      histogram: [{ type: 'histogram', marker: { pattern: PATTERN } }],
      // Holochart's scatter is GPU-drawn (plotly.js scattergl), so it takes scattergl's colorbar
      // defaults as well as scatter's fill pattern.
      scatter: [{ type: 'scatter', fillpattern: PATTERN, marker: { colorbar: o.colorbar } }],
      pie: [{ type: 'pie', automargin: true }],
      table: [
        {
          type: 'table',
          cells: { fill: { color: o.table[0] }, line: { color: o.table[2] } },
          header: { fill: { color: o.table[1] }, line: { color: o.table[2] } },
        },
      ],
      ...o.data,
    },
  };
}

const PLOTLY_INK = '#2a3f5f';

/** plotly.py's default template: blue-grey plot area, white grid, the Plotly colorway, Plasma. */
export const plotly: Template = /* @__PURE__ */ family({
  ink: PLOTLY_INK,
  paper: 'white',
  plot: '#E5ECF6',
  axis: {
    gridcolor: 'white',
    linecolor: 'white',
    ticks: '',
    title: { standoff: 15 },
    zerolinecolor: 'white',
    zerolinewidth: 2,
  },
  colorway: PLOTLY_COLORWAY,
  colorscale: { sequential: PLASMA, diverging: PIYG },
  colorbar: { outlinewidth: 0, ticks: '' },
  barLine: { color: '#E5ECF6', width: 0.5 },
  table: ['#EBF0F8', '#C8D4E3', 'white'],
});

/** `plotly` on white, with light blue-grey grid lines. */
export const plotly_white: Template = /* @__PURE__ */ family({
  ink: PLOTLY_INK,
  paper: 'white',
  plot: 'white',
  axis: {
    gridcolor: '#EBF0F8',
    linecolor: '#EBF0F8',
    ticks: '',
    title: { standoff: 15 },
    zerolinecolor: '#EBF0F8',
    zerolinewidth: 2,
  },
  colorway: PLOTLY_COLORWAY,
  colorscale: { sequential: PLASMA, diverging: PIYG },
  colorbar: { outlinewidth: 0, ticks: '' },
  barLine: { color: 'white', width: 0.5 },
  table: ['#EBF0F8', '#C8D4E3', 'white'],
});

const DARK = 'rgb(17,17,17)';
const DARK_INK = '#f2f5fa';

/** plotly.py's dark template: near-black background, slate grid, light text. */
export const plotly_dark: Template = /* @__PURE__ */ family({
  ink: DARK_INK,
  paper: DARK,
  plot: DARK,
  axis: {
    gridcolor: '#283442',
    linecolor: '#506784',
    ticks: '',
    title: { standoff: 15 },
    zerolinecolor: '#283442',
    zerolinewidth: 2,
  },
  colorway: PLOTLY_COLORWAY,
  colorscale: { sequential: PLASMA, diverging: PIYG },
  colorbar: { outlinewidth: 0, ticks: '' },
  barLine: { color: DARK, width: 0.5 },
  table: ['#506784', '#2a3f5f', DARK],
  layout: {
    sliderdefaults: { bgcolor: '#C8D4E3', bordercolor: DARK, borderwidth: 1, tickwidth: 0 },
    updatemenudefaults: { bgcolor: '#506784', borderwidth: 0 },
  },
  data: {
    scatter: [
      {
        type: 'scatter',
        fillpattern: PATTERN,
        marker: { colorbar: { outlinewidth: 0, ticks: '' }, line: { color: '#283442' } },
      },
    ],
  },
});

const SIMPLE_INK = 'rgb(36,36,36)';

/** Minimal white template: no grid, dark axis lines with outside ticks, D3 colors, Viridis. */
export const simple_white: Template = /* @__PURE__ */ family({
  ink: SIMPLE_INK,
  paper: 'white',
  plot: 'white',
  axis: {
    gridcolor: 'rgb(232,232,232)',
    linecolor: SIMPLE_INK,
    showgrid: false,
    showline: true,
    tickcolor: SIMPLE_INK,
    ticks: 'outside',
    title: { standoff: 15 },
    zeroline: false,
    zerolinecolor: SIMPLE_INK,
  },
  colorway: D3_COLORWAY,
  colorscale: { sequential: VIRIDIS, diverging: RDBU_BREWER },
  colorbar: { outlinewidth: 1, tickcolor: SIMPLE_INK, ticks: 'outside' },
  barLine: { color: 'white', width: 0.5 },
  table: ['rgb(237,237,237)', 'rgb(217,217,217)', 'white'],
  layout: { shapedefaults: { fillcolor: 'black', line: { width: 0 }, opacity: 0.3 } },
  data: {
    histogram: [
      { type: 'histogram', marker: { line: { color: 'white', width: 0.6 }, pattern: PATTERN } },
    ],
  },
});

const GG_INK = 'rgb(51,51,51)';
const GG_PANEL = 'rgb(237,237,237)';

/** R's ggplot2 look: grey panel, white grid, ggplot's hue palette. */
export const ggplot2: Template = /* @__PURE__ */ family({
  ink: GG_INK,
  paper: 'white',
  plot: GG_PANEL,
  axis: {
    gridcolor: 'white',
    linecolor: 'white',
    showgrid: true,
    tickcolor: GG_INK,
    ticks: 'outside',
    title: { standoff: 15 },
    zerolinecolor: 'white',
  },
  colorway: ['#F8766D', '#A3A500', '#00BF7D', '#00B0F6', '#E76BF3'],
  colorscale: {
    sequential: [
      [0, 'rgb(20,44,66)'],
      [1, 'rgb(90,179,244)'],
    ],
  },
  colorbar: { outlinewidth: 0, tickcolor: GG_PANEL, ticklen: 6, ticks: 'inside' },
  barLine: { color: GG_PANEL, width: 0.5 },
  table: [GG_PANEL, 'rgb(217,217,217)', 'white'],
  layout: { shapedefaults: { fillcolor: 'black', line: { width: 0 }, opacity: 0.3 } },
});

const SEABORN_INK = 'rgb(36,36,36)';
const SEABORN_PANEL = 'rgb(234,234,242)';

/** seaborn's "rocket" colormap, as plotly.py's `seaborn` template samples it. */
const ROCKET: Stops = [
  'rgb(2,4,25)',
  'rgb(24,15,41)',
  'rgb(47,23,57)',
  'rgb(71,28,72)',
  'rgb(97,30,82)',
  'rgb(123,30,89)',
  'rgb(150,27,91)',
  'rgb(177,22,88)',
  'rgb(203,26,79)',
  'rgb(223,47,67)',
  'rgb(236,76,61)',
  'rgb(242,107,73)',
  'rgb(244,135,95)',
  'rgb(245,162,122)',
  'rgb(246,188,153)',
  'rgb(247,212,187)',
  'rgb(250,234,220)',
].map((c, i, all): [number, string] => [i === all.length - 1 ? 1 : (i * 16) / 255, c]);

/** Python seaborn's "darkgrid" look: lavender-grey panel, white grid, the deep palette. */
export const seaborn: Template = /* @__PURE__ */ family({
  ink: SEABORN_INK,
  paper: 'white',
  plot: SEABORN_PANEL,
  axis: {
    gridcolor: 'white',
    linecolor: 'white',
    showgrid: true,
    ticks: '',
    title: { standoff: 15 },
    zerolinecolor: 'white',
  },
  colorway: [
    'rgb(76,114,176)',
    'rgb(221,132,82)',
    'rgb(85,168,104)',
    'rgb(196,78,82)',
    'rgb(129,114,179)',
    'rgb(147,120,96)',
    'rgb(218,139,195)',
    'rgb(140,140,140)',
    'rgb(204,185,116)',
    'rgb(100,181,205)',
  ],
  colorscale: { sequential: ROCKET },
  colorbar: { outlinewidth: 0, tickcolor: SEABORN_INK, ticklen: 8, ticks: 'outside', tickwidth: 2 },
  barLine: { color: SEABORN_PANEL, width: 0.5 },
  table: ['rgb(231,231,240)', 'rgb(183,183,191)', 'white'],
  layout: {
    annotationdefaults: { arrowcolor: 'rgb(67,103,167)', arrowhead: 0, arrowwidth: 1 },
    shapedefaults: { fillcolor: 'rgb(67,103,167)', line: { width: 0 }, opacity: 0.5 },
  },
});

const LARGE_MARKERS = { line: { width: 3 }, marker: { size: 9 } };

/**
 * Larger text and thicker lines for slides (compose it: `'plotly_white+presentation'`): 18 px base
 * font, 3 px lines, 9 px markers, taller table rows.
 */
export const presentation: Template = {
  layout: {
    font: { size: 18 },
    ...bothAxes({ title: { standoff: 15 } }),
  },
  data: {
    scatter: [{ type: 'scatter', ...LARGE_MARKERS }],
    scattergl: [{ type: 'scattergl', ...LARGE_MARKERS }],
    scatter3d: [{ type: 'scatter3d', ...LARGE_MARKERS }],
    scatterpolar: [{ type: 'scatterpolar', ...LARGE_MARKERS }],
    scatterternary: [{ type: 'scatterternary', ...LARGE_MARKERS }],
    table: [{ type: 'table', cells: { height: 30 }, header: { height: 36 } }],
  },
};

/** No vertical grid lines (compose it with another template). */
export const xgridoff: Template = { layout: { xaxis: { showgrid: false } } };

/** No horizontal grid lines (compose it with another template). */
export const ygridoff: Template = { layout: { yaxis: { showgrid: false } } };

/** Grid lines on both axes, e.g. `'simple_white+gridon'`. */
export const gridon: Template = { layout: /* @__PURE__ */ bothAxes({ showgrid: true }) };

/**
 * The empty template: the library's schema defaults (Plotly's look), as with
 * `layout.template: null`. The same object as core's `noneTemplate`, which every bundle registers.
 */
export const none: Template = noneTemplate;
