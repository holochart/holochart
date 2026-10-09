/**
 * `choropleth` attribute schema (backlog GEO4, plan E15.3, ADR-002), following plotly.js
 * `traces/choropleth/attributes.js` (MIT): `locations` with `locationmode` (or `geojson` and
 * `featureidkey`), the values `z` and their colorscale, the outline and opacity of the regions,
 * and the opacities of selected and unselected regions.
 *
 * The colorscale attributes are the shared ones of `@mk7s/holochart-traces-basic`
 * (`colorscaleAttributes`), under the names Plotly gives them at the root of a trace with a `z`:
 * `zauto`, `zmin`, `zmax`, `zmid` for `cauto`, `cmin`, `cmax`, `cmid`. They are `style` edits: the
 * colors are resolved when the trace is drawn, and a change rewrites the color attribute of the
 * fill and nothing else (Plotly declares them `calc`).
 *
 * `elevation` and `elevationscale` are Holochart's own (backlog GEO8, ADR-028): the height of each
 * region's prism on a 3D globe. Like the 2.5D `depth` of the cartesian traces they are an extra
 * that one way of drawing uses: on a flat projection they are ignored, without a warning.
 *
 * Not declared (deferred): `hovertemplatefallback`.
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { geoSubplotAttribute } from '../geo/layout-attributes.ts';

/** `locationmode` values (plotly.js). @internal */
export const CHOROPLETH_LOCATION_MODES = [
  'ISO-3',
  'USA-states',
  'country names',
  'geojson-id',
] as const;

/** Plotly's `Color.defaultLine`. @internal */
export const DEFAULT_LINE = '#444';

/** Opacity of the regions outside a selection, as a share of their own (Plotly's `DESELECTDIM`). */
export const DESELECT_DIM = 0.2;

/** The default `elevationscale`: the tallest prism of a globe is a quarter of its radius high. */
export const DEFAULT_ELEVATION_SCALE = 0.25;

const selectionStyle = (which: 'selected' | 'unselected') =>
  attr.object(
    {
      marker: attr.object(
        {
          opacity: attr.number({
            min: 0,
            max: 1,
            editType: 'style',
            description: `Opacity of the ${which} regions.${which === 'unselected' ? ' Default: 0.2 × `marker.opacity` when no selected or unselected opacity is set.' : ' Default: `marker.opacity`.'}`,
          }),
        },
        { editType: 'style', description: `Style of the ${which} regions.` },
      ),
    },
    {
      editType: 'style',
      description: `How the ${which} regions are drawn while a selection is active.`,
    },
  );

/** @experimental */
export const choroplethAttributes = /* @__PURE__ */ (() => {
  const scale = colorscaleAttributes({
    colorAttr: 'z',
    showscale: true,
    showscaleDflt: true,
    coloraxis: true,
  });
  const { cauto, cmin, cmax, cmid, ...rest } = scale;
  return attr.object(
    {
      locations: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Location ids or names, one region each (see `locationmode`). A location that matches nothing is skipped, and one warning names the unmatched ones.',
      }),
      locationmode: attr.enumerated({
        values: CHOROPLETH_LOCATION_MODES,
        dflt: 'ISO-3',
        editType: 'calc',
        description:
          "What the entries of `locations` name: `'ISO-3'` country codes, `'USA-states'` (two-letter codes or state names), `'country names'` (names, or ISO codes), or `'geojson-id'` for the features of `geojson`. Default `'geojson-id'` when `geojson` is given.",
      }),
      z: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'The value of each location, mapped to a color through the colorscale. A location whose value is not a number is not drawn.',
      }),
      elevation: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          "A second value per location, drawn as height on a 3D globe (`layout.geo.projection.type: 'globe3d'`): each region rises from the sphere as a prism, the largest elevation `elevationscale` high and the others in proportion. A location whose elevation is 0, negative or not a number lies flat on the surface. A Holochart extra (Plotly has neither the globe nor this attribute); on a flat projection it is not drawn, and events and `hovertemplate` (`%{elevation}`) still carry it.",
      }),
      elevationscale: attr.number({
        min: 0,
        dflt: DEFAULT_ELEVATION_SCALE,
        editType: 'plot',
        description:
          'The height of the region with the largest `elevation`, in globe radii. Values above 1 are drawn as 1: the room the globe keeps above its surface. Only with `elevation`, on a 3D globe. A Holochart extra.',
      }),
      geojson: attr.any({
        editType: 'calc',
        description:
          'GeoJSON whose features `locations` refers to: a `FeatureCollection` or `Feature` with `Polygon` or `MultiPolygon` geometries, or a URL of one. Without it, the regions are the features of the base map. Rings wound the RFC 7946 way (outer rings counter-clockwise) are rewound, with one warning.',
      }),
      featureidkey: attr.string({
        dflt: 'id',
        editType: 'calc',
        description:
          "The key of the `geojson` features that `locations` are matched against, e.g. `'properties.name'`. Only with `geojson`.",
      }),
      geo: geoSubplotAttribute,
      text: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'none',
        description: 'Text per location, shown in hover labels (unless `hovertext` is set).',
      }),
      marker: attr.object(
        {
          line: attr.object(
            {
              color: attr.color({
                arrayOk: true,
                dflt: DEFAULT_LINE,
                editType: 'style',
                description: 'Color of the outlines of the regions, or one per location.',
              }),
              width: attr.number({
                min: 0,
                arrayOk: true,
                dflt: 1,
                editType: 'style',
                description:
                  'Width of the outlines of the regions in CSS px, or one per location. 0 draws none.',
              }),
            },
            { editType: 'style', description: 'The outlines of the regions.' },
          ),
          opacity: attr.number({
            min: 0,
            max: 1,
            arrayOk: true,
            dflt: 1,
            editType: 'style',
            description:
              'Opacity of the regions (multiplied by the trace `opacity`), or one per location.',
          }),
        },
        { editType: 'style', description: 'Outline and opacity of the regions.' },
      ),
      selected: selectionStyle('selected'),
      unselected: selectionStyle('unselected'),
      hoverinfo: attr.flaglist({
        flags: ['location', 'z', 'text', 'name'],
        extras: ['all', 'none', 'skip'],
        arrayOk: true,
        editType: 'none',
        description:
          "Which fields hover labels show (the location, the value, the text and the trace name); `'skip'` also turns hover events off for this trace. Default `'all'`.",
      }),
      zauto: {
        ...cauto,
        description:
          'Compute the color domain from `z`. Defaults to false when both `zmin` and `zmax` are given.',
      },
      zmin: {
        ...cmin,
        description: 'Value mapped to the first colorscale color (with `zmax`; turns `zauto` off).',
      },
      zmax: {
        ...cmax,
        description: 'Value mapped to the last colorscale color (with `zmin`; turns `zauto` off).',
      },
      zmid: cmid,
      ...rest,
    },
    {
      editType: 'calc',
      description:
        'A choropleth map: the regions that `locations` name (countries, US states, or the features of a `geojson`) filled with the colors of their `z` values, on a map-projection subplot (`layout.geo`).',
    },
  );
})();
