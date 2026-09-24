/**
 * Building blocks shared by the built-in templates: stop lists, and the per-trace-type colorbar
 * and colorscale defaults Plotly's templates repeat for every colorscaled trace type.
 */
import type { Template } from '@mk7s/holochart-core';

/** Template layout (a plain object; the registry resolves it against the layout schema). */
export type TemplateLayout = NonNullable<Template['layout']>;
/** Per-trace-type template data. */
export type TemplateData = NonNullable<Template['data']>;
/** `[position, color]` stops. */
export type Stops = [number, string][];

/** Evenly spaced stops from a list of colors. */
export function even(colors: readonly string[]): Stops {
  return colors.map((c, i): [number, string] => [i / (colors.length - 1), c]);
}

/** Plasma (10 colors): the sequential scale of Plotly's `plotly*` templates. */
export const PLASMA: Stops = /* @__PURE__ */ even([
  '#0d0887',
  '#46039f',
  '#7201a8',
  '#9c179e',
  '#bd3786',
  '#d8576b',
  '#ed7953',
  '#fb9f3a',
  '#fdca26',
  '#f0f921',
]);

/** ColorBrewer PiYG (11 colors): the diverging scale of Plotly's `plotly*` templates. */
export const PIYG: Stops = /* @__PURE__ */ even([
  '#8e0152',
  '#c51b7d',
  '#de77ae',
  '#f1b6da',
  '#fde0ef',
  '#f7f7f7',
  '#e6f5d0',
  '#b8e186',
  '#7fbc41',
  '#4d9221',
  '#276419',
]);

/** Viridis (10 colors): the sequential scale of `simple_white`. */
export const VIRIDIS: Stops = /* @__PURE__ */ even([
  '#440154',
  '#482878',
  '#3e4989',
  '#31688e',
  '#26828e',
  '#1f9e89',
  '#35b779',
  '#6ece58',
  '#b5de2b',
  '#fde725',
]);

/** ColorBrewer RdBu (11 colors, red to blue): the diverging scale of `simple_white`. */
export const RDBU_BREWER: Stops = /* @__PURE__ */ even([
  'rgb(103,0,31)',
  'rgb(178,24,43)',
  'rgb(214,96,77)',
  'rgb(244,165,130)',
  'rgb(253,219,199)',
  'rgb(247,247,247)',
  'rgb(209,229,240)',
  'rgb(146,197,222)',
  'rgb(67,147,195)',
  'rgb(33,102,172)',
  'rgb(5,48,97)',
]);

/** Plotly's category10 (D3) colorway, upper-case as in plotly.py's `simple_white`. */
export const D3_COLORWAY = [
  '#1F77B4',
  '#FF7F0E',
  '#2CA02C',
  '#D62728',
  '#9467BD',
  '#8C564B',
  '#E377C2',
  '#7F7F7F',
  '#BCBD22',
  '#17BECF',
];

/** The Plotly colorway (plotly.py `plotly.colors.qualitative.Plotly`). */
export const PLOTLY_COLORWAY = [
  '#636efa',
  '#EF553B',
  '#00cc96',
  '#ab63fa',
  '#FFA15A',
  '#19d3f3',
  '#FF6692',
  '#B6E880',
  '#FF97FF',
  '#FECB52',
];

/** Plotly's bar/histogram/scatter-fill pattern defaults (`marker.pattern`, `fillpattern`). */
export const PATTERN = { fillmode: 'overlay', size: 10, solidity: 0.2 } as const;

/** Trace types whose colorscale is a trace-level `colorscale` (heatmap-like). */
const SCALE_TRACES = ['heatmap', 'contour', 'histogram2d', 'histogram2dcontour', 'surface'];
/** Trace types with a trace-level `colorbar` only. */
const COLORBAR_TRACES = ['choropleth', 'contourcarpet', 'mesh3d', 'cone', 'streamtube'];
/** Trace types with `marker.colorbar` (scatter-like, other than `scatter` itself). */
const MARKER_COLORBAR_TRACES = [
  'scattergl',
  'scatterpolar',
  'scatterpolargl',
  'scatterternary',
  'scattercarpet',
  'scattergeo',
  'scattermapbox',
];

/**
 * Plotly's repeated per-type colorbar/colorscale template entries: `colorbar` on colorscaled
 * trace types, `marker.colorbar` on scatter-like ones, `colorscale` on heatmap-like ones, and
 * `coloraxis.colorbar` in the layout.
 */
export function colorbarDefaults(
  colorbar: Record<string, unknown>,
  colorscale: Stops | undefined,
): { data: TemplateData; layout: TemplateLayout } {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const type of SCALE_TRACES) {
    data[type] = [{ type, colorbar, ...(colorscale ? { colorscale } : {}) }];
  }
  for (const type of COLORBAR_TRACES) data[type] = [{ type, colorbar }];
  for (const type of MARKER_COLORBAR_TRACES) data[type] = [{ type, marker: { colorbar } }];
  data['scatter3d'] = [{ type: 'scatter3d', line: { colorbar }, marker: { colorbar } }];
  data['parcoords'] = [{ type: 'parcoords', line: { colorbar } }];
  return { data, layout: { coloraxis: { colorbar } } };
}

/** `{ xaxis: axis, yaxis: axis }`. Sharing one object is safe: templates are never mutated. */
export function bothAxes(axis: Record<string, unknown>): TemplateLayout {
  return { xaxis: axis, yaxis: axis };
}
