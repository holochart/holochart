/**
 * `layout.geo`, `geo2`, … (backlog GEO2, plan E15.1): the map-projection subplot container,
 * following plotly.js `plots/geo/layout_attributes.js` (MIT). Declared by the geo trace modules
 * (`layoutSchema`), so figures without geo traces don't carry it.
 *
 * Plotly declares every attribute `plot`, and so does this file: a change of the view, of a layer
 * or of a color redraws the subplot and moves what the traces drew, and no trace recalculates.
 * (A layout-level `style` edit would restyle every trace of the figure, which a basemap color
 * does not need.) `uirevision` changes nothing that is drawn.
 */
import { attr, domainTraceAttributes } from '@mk7s/holochart-core';
import { LAND_COLOR, PROJECTION_TYPES, SCOPE_DEFAULTS, WATER_COLOR } from './constants.ts';
import type { GeoScope } from './types.ts';

/** Plotly's `Color.defaultLine` and `Color.lightLine`: base layer lines, and the graticule. */
const LINE_COLOR = '#444';
const GRID_COLOR = '#eee';

/** `geo.scope` values, sorted as Plotly lists them. */
const SCOPES = Object.keys(SCOPE_DEFAULTS).sort() as GeoScope[];

/** `geo.lonaxis` / `geo.lataxis`: the range in view and the graticule. */
function geoAxisAttributes(letter: 'lon' | 'lat') {
  const name = letter === 'lon' ? 'longitude' : 'latitude';
  const lines = letter === 'lon' ? 'meridians' : 'parallels';
  return attr.object(
    {
      range: attr.infoArray({
        items: [attr.number({ editType: 'plot' }), attr.number({ editType: 'plot' })],
        editType: 'plot',
        description: `The ${name}s in view, \`[start, end]\` in degrees: the map is fitted to this range and clipped to it. Defaults to the scope's range, or to the widest span the projection can show around \`projection.rotation.${letter}\`.`,
      }),
      showgrid: attr.boolean({
        dflt: false,
        editType: 'plot',
        description: `Draw the ${lines} of the graticule.`,
      }),
      tick0: attr.number({
        dflt: 0,
        editType: 'plot',
        description: `A ${name} one of the ${lines} passes through, in degrees.`,
      }),
      dtick: attr.number({
        editType: 'plot',
        description: `Step between the ${lines}, in degrees. Defaults to ${letter === 'lon' ? 30 : 10}.`,
      }),
      gridcolor: attr.color({
        dflt: GRID_COLOR,
        editType: 'plot',
        description: `Color of the ${lines}.`,
      }),
      gridwidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description: `Line width of the ${lines}, px.`,
      }),
      griddash: attr.string({
        dflt: 'solid',
        editType: 'plot',
        description: `Dash style of the ${lines}: \`solid\`, \`dot\`, \`dash\`, \`longdash\`, \`dashdot\`, \`longdashdot\`, or a list of dash lengths in px (\`5px,10px\`).`,
      }),
    },
    {
      editType: 'plot',
      description: `The ${name} axis of a geo subplot: its range and its graticule lines.`,
    },
  );
}

/** `geo.lonaxis`. */
export const lonAxisAttributes = /* @__PURE__ */ (() => geoAxisAttributes('lon'))();

/** `geo.lataxis`. */
export const latAxisAttributes = /* @__PURE__ */ (() => geoAxisAttributes('lat'))();

/** `geo.domain`: the extent of the subplot in the plot area (or a `layout.grid` cell). */
const geoDomain = /* @__PURE__ */ (() =>
  attr.object(domainTraceAttributes.domain.children, {
    editType: 'plot',
    description:
      'Extent of the geo subplot as fractions of the plot area, or the `layout.grid` cell at `row` / `column`. A map keeps its shape, so at `projection.scale` 1 it fills the width or the height of its domain, rarely both. Subplots without a domain are stacked from the bottom.',
  }))();

/** `geo.projection`. */
export const projectionAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      type: attr.enumerated({
        values: PROJECTION_TYPES,
        editType: 'plot',
        description:
          "The map projection. Defaults to the scope's: `equirectangular` for the world, `albers usa` for `usa`, a conic or Mercator projection for the continents. The values are Plotly's, and `globe3d`, a Holochart extra: a 3D globe with the view of `orthographic`.",
      }),
      rotation: attr.object(
        {
          lon: attr.number({
            editType: 'plot',
            description:
              'Longitude at the center of the projection, in degrees east: turns the globe about its axis. Defaults to the middle of `lonaxis.range`.',
          }),
          lat: attr.number({
            editType: 'plot',
            description:
              'Latitude at the center of the projection, in degrees north: tips the globe towards the viewer.',
          }),
          roll: attr.number({
            editType: 'plot',
            description:
              'Turn of the map about the line of sight, in degrees (180 draws it upside down).',
          }),
        },
        {
          editType: 'plot',
          description: 'Rotation of the globe before it is projected. `albers usa` has none.',
        },
      ),
      tilt: attr.number({
        dflt: 0,
        editType: 'plot',
        description: '`satellite` only: tilt of the view away from straight down, in degrees.',
      }),
      distance: attr.number({
        min: 1.001,
        dflt: 2,
        editType: 'plot',
        description:
          "`satellite` only: distance of the viewpoint from the globe's center, in globe radii (above 1: outside the surface).",
      }),
      parallels: attr.infoArray({
        items: [attr.number({ editType: 'plot' }), attr.number({ editType: 'plot' })],
        editType: 'plot',
        description:
          "Conic projections only: the two standard parallels, in degrees, where the cone meets the globe. Defaults to the scope's, or `[0, 60]`.",
      }),
      scale: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description:
          'Zoom factor. At 1 the `lonaxis` / `lataxis` ranges are fitted into the domain.',
      }),
      minscale: attr.number({
        min: 0,
        dflt: 0,
        editType: 'plot',
        description:
          'Lower limit of zooming by hand, as a `projection.scale` value (0.5: out to half the fitted size). 0 sets no limit.',
      }),
      maxscale: attr.number({
        min: 0,
        editType: 'plot',
        description:
          'Upper limit of zooming by hand, as a `projection.scale` value (2: in to twice the fitted size). Unset sets no limit.',
      }),
    },
    { editType: 'plot', description: 'How the globe is projected onto the subplot.' },
  ))();

/** The `geo` subplot container family (`geo`, `geo2`, …). @experimental */
export const geoAttributes = /* @__PURE__ */ (() =>
  attr.subplotObject(
    'geo',
    {
      domain: geoDomain,
      fitbounds: attr.enumerated({
        values: [false, 'locations', 'geojson'],
        dflt: 'locations',
        editType: 'plot',
        description:
          "Fit the view to the data of the subplot's traces: `locations` to the points and locations they show, `geojson` to the whole of their `geojson`, `false` to leave the view as set. The fit sets `center` and `projection.scale`; on a world map also `projection.rotation.lon`, and with a clipped projection (`orthographic`, …) `projection.rotation.lat` and both axis ranges. It is off when the figure sets any of the attributes it would set, and for the projections it cannot fit (`albers usa`, `craig`, `peirce quincuncial`, `satellite`).",
      }),
      resolution: attr.enumerated({
        values: [110, 50],
        dflt: 110,
        editType: 'plot',
        description:
          'Detail of the base layers, as the scale denominator of the map data in millions: 110 (1:110,000,000, coarse) or 50 (1:50,000,000).',
      }),
      scope: attr.enumerated({
        values: SCOPES,
        dflt: 'world',
        editType: 'plot',
        description:
          'The part of the world the base layers cover. A scope other than `world` also sets the default projection, ranges and rotation. `albers usa` maps are always `usa`.',
      }),
      projection: projectionAttributes,
      center: attr.object(
        {
          lon: attr.number({
            editType: 'plot',
            description:
              'Longitude at the middle of the subplot, in degrees. Defaults to the middle of `lonaxis.range` on a scoped map and to `projection.rotation.lon` on a world map.',
          }),
          lat: attr.number({
            editType: 'plot',
            description:
              'Latitude at the middle of the subplot, in degrees. Defaults to the middle of `lataxis.range`.',
          }),
        },
        {
          editType: 'plot',
          description: 'The point of the map at the middle of the subplot (panning moves it).',
        },
      ),
      visible: attr.boolean({
        dflt: true,
        editType: 'plot',
        description:
          'Default of the base layers and the graticule: `false` hides all of them (also those a template shows) unless the figure shows one itself.',
      }),
      showcoastlines: attr.boolean({
        editType: 'plot',
        description: 'Draw the coastlines. On by default on world maps.',
      }),
      coastlinecolor: attr.color({
        dflt: LINE_COLOR,
        editType: 'plot',
        description: 'Color of the coastlines.',
      }),
      coastlinewidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description: 'Line width of the coastlines, px.',
      }),
      showland: attr.boolean({ dflt: false, editType: 'plot', description: 'Fill the land.' }),
      landcolor: attr.color({
        dflt: LAND_COLOR,
        editType: 'plot',
        description: 'Fill color of the land.',
      }),
      showocean: attr.boolean({ dflt: false, editType: 'plot', description: 'Fill the oceans.' }),
      oceancolor: attr.color({
        dflt: WATER_COLOR,
        editType: 'plot',
        description: 'Fill color of the oceans.',
      }),
      showlakes: attr.boolean({ dflt: false, editType: 'plot', description: 'Fill the lakes.' }),
      lakecolor: attr.color({
        dflt: WATER_COLOR,
        editType: 'plot',
        description: 'Fill color of the lakes.',
      }),
      showrivers: attr.boolean({ dflt: false, editType: 'plot', description: 'Draw the rivers.' }),
      rivercolor: attr.color({
        dflt: WATER_COLOR,
        editType: 'plot',
        description: 'Color of the rivers.',
      }),
      riverwidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description: 'Line width of the rivers, px.',
      }),
      showcountries: attr.boolean({
        editType: 'plot',
        description:
          'Draw the borders between countries. On by default on scoped maps other than `usa`.',
      }),
      countrycolor: attr.color({
        dflt: LINE_COLOR,
        editType: 'plot',
        description: 'Color of the country borders.',
      }),
      countrywidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description: 'Line width of the country borders, px.',
      }),
      showsubunits: attr.boolean({
        editType: 'plot',
        description:
          'Draw the borders inside countries (states, provinces). The map data has them for `usa`, and for `north america` at `resolution` 50; on by default there, never drawn elsewhere.',
      }),
      subunitcolor: attr.color({
        dflt: LINE_COLOR,
        editType: 'plot',
        description: 'Color of the subunit borders.',
      }),
      subunitwidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description: 'Line width of the subunit borders, px.',
      }),
      showframe: attr.boolean({
        editType: 'plot',
        description:
          'Draw the outline of the projected globe. World maps only, where it is on by default.',
      }),
      framecolor: attr.color({
        dflt: LINE_COLOR,
        editType: 'plot',
        description: 'Color of the frame.',
      }),
      framewidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description: 'Line width of the frame, px.',
      }),
      bgcolor: attr.color({
        dflt: '#fff',
        editType: 'plot',
        description: 'Background color of the map, inside its frame.',
      }),
      lonaxis: lonAxisAttributes,
      lataxis: latAxisAttributes,
      uirevision: attr.any({
        editType: 'none',
        description:
          'Persistence of user-driven changes of the view (rotation, center and scale). Defaults to `layout.uirevision`.',
      }),
    },
    {
      editType: 'plot',
      description:
        "A map-projection subplot. `geo2`, `geo3`, … declare more, referenced from geo traces' `geo` (`'geo2'`).",
      role: 'layout',
    },
  ))();

/** What geo trace modules spread into their `layoutSchema`. */
export const geoLayoutSchema = /* @__PURE__ */ (() => ({ geo: geoAttributes }))();

/** The `geo` trace attribute of geo traces. */
export const geoSubplotAttribute = /* @__PURE__ */ (() =>
  attr.subplotId({
    dflt: 'geo',
    editType: 'calc',
    description:
      "The geo subplot this trace is drawn on: `'geo'` (`layout.geo`), `'geo2'` (`layout.geo2`), ….",
  }))();
