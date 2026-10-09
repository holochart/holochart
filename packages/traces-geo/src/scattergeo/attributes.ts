/**
 * `scattergeo` attribute schema (backlog GEO3, plan E15.2, ADR-002), following plotly.js
 * `traces/scattergeo/attributes.js` (MIT): `lon` / `lat` (or `locations` with `locationmode`,
 * `geojson` and `featureidkey`), the subplot, and scatter's modes, markers, lines, text and the
 * `toself` fill. Marker, text font, text position and selection attributes are scatter's own
 * declarations, with scatter's edit types (Plotly declares every scattergeo attribute `calc`).
 *
 * A trace with `locations` is drawn at the points of the features they name (`geo/locations.ts`).
 *
 * `line.lift` is Holochart's own (backlog GEO8, ADR-028): the height of the line's arcs on a 3D
 * globe. It is in scattergeo's own `line` container, next to the three attributes of scatter's
 * that the container has. Like the 2.5D `depth` of the cartesian traces it is an extra that one
 * way of drawing uses: on a flat projection it is ignored, without a warning.
 *
 * Not declared (deferred): `marker.angleref`, `marker.standoff`, `marker.gradient`,
 * `marker.line.dash`, `texttemplatefallback` and `hovertemplatefallback`. `marker.maxdisplayed` is
 * scatter's alone, as in Plotly.
 */
import { attr } from '@mk7s/holochart-core';
import { scatterAttributes } from '@mk7s/holochart-traces-basic';
import { geoSubplotAttribute } from '../geo/layout-attributes.ts';

const S = scatterAttributes.children;

/** `locationmode` values (plotly.js). @internal */
export const LOCATION_MODES = ['ISO-3', 'USA-states', 'country names', 'geojson-id'] as const;

/**
 * The default `line.lift`: the `DEFAULT_LIFT` of the globe's arcs (`geo/globe/lines.ts`, which is
 * lazy code; a test keeps the two equal).
 */
export const DEFAULT_LINE_LIFT = 0.15;

/** Geo hover flags (`hoverinfo`). */
export const geoHoverinfo = /* @__PURE__ */ (() =>
  attr.flaglist({
    flags: ['lon', 'lat', 'location', 'text', 'name'],
    extras: ['all', 'none', 'skip'],
    arrayOk: true,
    editType: 'none',
    description:
      "Which fields hover labels show (the coordinates as `(lat°, lon°)`, the location, the text and the trace name); `'skip'` also turns hover events off for this trace. Default `'all'`.",
  }))();

/** @experimental */
export const scattergeoAttributes = /* @__PURE__ */ (() => {
  // Everything of scatter's marker but `maxdisplayed`, which Plotly's scattergeo does not have.
  const { maxdisplayed: _maxdisplayed, ...marker } = S.marker.children;
  return attr.object(
    {
      lon: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description: 'Longitudes, in degrees East.',
      }),
      lat: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description: 'Latitudes, in degrees North.',
      }),
      locations: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Location ids or names, drawn at the centroid of each location (see `locationmode`), instead of `lon` and `lat`. A location that matches nothing is skipped, and one warning names the unmatched ones.',
      }),
      locationmode: attr.enumerated({
        values: LOCATION_MODES,
        dflt: 'ISO-3',
        editType: 'calc',
        description:
          "What the entries of `locations` name: `'ISO-3'` country codes, `'USA-states'` (two-letter codes or state names), `'country names'` (names, or ISO codes), or `'geojson-id'` for the features of `geojson`. Default `'geojson-id'` when `geojson` is given.",
      }),
      geojson: attr.any({
        editType: 'calc',
        description:
          'GeoJSON whose features `locations` refers to: a `FeatureCollection` or `Feature` with `Polygon` or `MultiPolygon` geometries, or a URL of one. Without it, `locations` are matched to the features of the base map.',
      }),
      featureidkey: attr.string({
        dflt: 'id',
        editType: 'calc',
        description:
          "The key of the `geojson` features that `locations` are matched against, e.g. `'properties.name'`. Only with `geojson`.",
      }),
      geo: geoSubplotAttribute,
      mode: attr.flaglist({
        flags: ['lines', 'markers', 'text'],
        extras: ['none'],
        dflt: 'markers',
        editType: 'calc',
        description: 'Drawing mode: markers, lines along great circles, text labels, or several.',
      }),
      text: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'plot',
        description:
          'Text per point: the labels of `mode` `text`, and hover text (unless `hovertext` is set).',
      }),
      texttemplate: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'plot',
        description:
          "Template for the text labels, e.g. `'%{text} (%{lat:.1f}°)'` (d3-format after `:`). Keys: `lon`, `lat`, `location`, `text`, `customdata`, `marker.size`, `marker.color`, `meta`. Overrides `text`.",
      }),
      textposition: S.textposition,
      textfont: S.textfont,
      line: attr.object(
        {
          color: S.line.children.color,
          width: S.line.children.width,
          dash: S.line.children.dash,
          lift: attr.number({
            min: 0,
            dflt: DEFAULT_LINE_LIFT,
            editType: 'plot',
            description:
              "On a 3D globe (`layout.geo.projection.type: 'globe3d'`), how high each segment of the line rises above the surface in its middle: globe radii per radian of the segment's length, so a long route stands clear of the globe and a short hop stays low. 0 keeps the line on the surface. Values above 1/π (an arc to the antipode one radius high) are drawn as 1/π. The line of a filled trace (`fill: 'toself'`) stays on the surface. A Holochart extra (Plotly has neither the globe nor this attribute); ignored on a flat projection.",
          }),
        },
        {
          editType: 'plot',
          description:
            'Line style (`mode` `lines`). Each segment follows the great circle between its points.',
        },
      ),
      connectgaps: attr.boolean({
        dflt: false,
        editType: 'plot',
        description:
          'Connect lines across missing (`null`, `NaN`) points instead of breaking them.',
      }),
      marker: attr.object(marker, {
        editType: 'calc',
        description: 'Marker style (`mode` `markers`).',
      }),
      fill: attr.enumerated({
        values: ['none', 'toself'],
        dflt: 'none',
        editType: 'plot',
        description:
          '`toself` closes the line (each run between gaps) into a shape on the sphere, filled with `fillcolor`. Of the two regions a closed path bounds, the smaller one is filled.',
      }),
      fillcolor: S.fillcolor,
      hoverinfo: geoHoverinfo,
      selected: S.selected,
      unselected: S.unselected,
    },
    {
      editType: 'calc',
      description:
        'Markers, great-circle lines, text and filled areas at longitudes and latitudes on a map-projection subplot (`layout.geo`).',
    },
  );
})();
