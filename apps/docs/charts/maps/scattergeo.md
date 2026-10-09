---
title: Scatter & lines on maps
description: Markers, great-circle lines, text and filled areas at longitudes and latitudes, or at named places, on a projected map.
status: complete
chart: scattergeo
launch-featured: true
---

# Scatter & lines on maps

<ChartOverview />

## Overview

A `scattergeo` trace places points on a map by longitude and latitude, or by the name of a place
(a country code, a country name, a US state, a feature of your own GeoJSON). It is the map twin
of [scatter](/charts/basic/scatter): markers, lines, text and filled areas, with the same `mode`,
`marker`, `line` and `text` attributes. Use it for point data with a location (cities, stations,
events), for bubble maps, and for routes: lines between two points follow the great circle, the
shortest path on the globe.

Traces are drawn on a **geo subplot**, `layout.geo` (and `geo2`, `geo3`, … for more), which holds
the projection, the base map and the view. [Maps](/fundamentals/maps) describes it.

Maps are not part of the full bundle. Add one import next to it, or register `tracesGeo` in a
partial bundle (see [adding the package](/fundamentals/maps#adding-the-package)):

```ts
import '@mk7s/holochart';
import '@mk7s/holochart/geo';
```

Pick a different chart when:

- the value belongs to a region, not to a point: use a
  [choropleth](/charts/maps/choropleth), which fills the region;
- the positions are not geographic, or the area is small enough that the curvature of the earth
  does not matter and you have your own background: a [scatter](/charts/basic/scatter) on
  cartesian axes with `scaleanchor` is simpler;
- you need streets, terrain or satellite imagery under the points: that takes a tile map, which
  Holochart does not have yet (it is planned).

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'scattergeo', lon: [-0.13, 2.35, 13.4], lat: [51.51, 48.86, 52.52] }],
});
```

`lon` is degrees east and `lat` degrees north. The trace goes on `layout.geo`, which is created
for it: a world map in the equirectangular projection with coastlines. By default the view is
fitted to the points (`geo.fitbounds: 'locations'`), so this figure shows western Europe; set
`fitbounds: false` to see the whole world, as the live example does. The default `mode` is
`'markers'` whatever the number of points.

<Example id="scattergeo/basic" />

## Data format

- **`lon` and `lat`.** Arrays (plain or typed) of the same length; with different lengths the
  shorter one wins. A point whose longitude or latitude is not a number is a gap: it draws
  nothing and breaks the line there, unless `connectgaps: true`.
- **`locations`.** Instead of coordinates, a place per point. `locationmode` says what the
  entries name, and each point is drawn at the label point of its feature. When a trace has both
  `locations` and `lon` / `lat`, the locations win.

  | `locationmode`      | A location is                                       | Matched against                       |
  | ------------------- | --------------------------------------------------- | ------------------------------------- |
  | `'ISO-3'` (default) | an ISO 3166-1 alpha-3 code (`'FRA'`), in any case   | the countries of the base map         |
  | `'USA-states'`      | a postal code (`'CA'`) or a state's name            | the states of the base map            |
  | `'country names'`   | a country's name, or an ISO code                    | the countries of the base map         |
  | `'geojson-id'`      | a string or a number (the default with a `geojson`) | the features of the trace's `geojson` |

  The countries are those of the subplot's `scope` at its `resolution`: the 110m data leaves out
  the smallest countries (Malta, Singapore, …), which `resolution: 50` has, and a scope other
  than `world` has the countries of its continent only. The table of country names is a chunk of
  its own, loaded the first time a figure uses `'country names'`.

- **`geojson` and `featureidkey`.** A `FeatureCollection` or a `Feature` with `Polygon` or
  `MultiPolygon` geometries, as an object or as a URL. `featureidkey` is where each feature has
  the id that `locations` name (`'id'` by default, or a property such as `'properties.name'`).
  A point is drawn at the mean of the vertices of its feature's largest polygon.
- **Unmatched locations.** A location that names no feature is skipped, and one console warning
  per trace lists the unmatched ones.
- **Points the projection hides.** A point on the far side of an orthographic globe, or outside
  the three parts of Albers USA, is not drawn and cannot be hovered or selected. Lines are cut at
  the edge of the projection.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

// Markers at US states, named by postal code, on the map of the United States.
createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scattergeo',
      locationmode: 'USA-states',
      locations: ['CA', 'TX', 'NY'],
      text: ['California', 'Texas', 'New York'],
      marker: { size: [20, 16, 12] },
    },
  ],
  layout: { geo: { scope: 'usa' } },
});
```

## Variations

<ChartVariations />

### Great-circle routes on a globe

With `mode: 'lines'`, each segment follows the great circle between its two points. On an
orthographic projection that is the straightest line on the globe; segments that pass behind it
are cut at the edge. A `NaN` after each destination breaks one trace into separate routes. Drag
the globe to turn it:

<ExampleLink id="scattergeo/great-circles" />

### Routes on a flat map

On a flat projection great circles are curves. `mode: 'lines+markers'` marks the stops, and one
trace per route gives each a color and a legend entry. A line that leaves the map at one side is
cut there and goes on at the other, as the polar route does here; `projection.rotation.lon`
chooses the meridian in the middle, and so where the cut is:

<ExampleLink id="scattergeo/routes" />

### Bubble map

`marker.size` takes a number per point, and `sizemode: 'area'` with `sizeref` makes the area of a
bubble follow its value. Numbers in `marker.color` go through a colorscale; `marker.showscale`
adds the colorbar:

<ExampleLink id="scattergeo/bubbles" />

### Text labels on a scoped map

`mode: 'markers+text'` writes `text` beside each marker, placed by `textposition` (one value, or
one per point to keep neighbours apart). `scope: 'europe'` draws one continent in the scope's own
projection, with country borders:

<ExampleLink id="scattergeo/europe" />

### The United States

`scope: 'usa'` is the Albers USA projection: the lower 48 states with Alaska and Hawaii as
insets, and state borders as `subunits`:

<ExampleLink id="scattergeo/usa" />

### Markers at named places

With `locations`, a point needs no coordinates: here ISO-3 codes, each drawn at the label point
of its country. `%{location}` is available in `hovertemplate` and `texttemplate`:

<ExampleLink id="scattergeo/locations" />

### Filled areas

`fill: 'toself'` closes each run of the line between gaps into a shape on the sphere and fills
it. The edges are great circles, and of the two regions a closed path bounds, the smaller one is
filled:

<ExampleLink id="scattergeo/fill" />

### From a table, with Express

[`hx.scatterGeo` and `hx.lineGeo`](/express/mappings#maps) build these traces from rows: one
trace per value of `color`, marker areas from `size`.

## Styling

- **Markers, lines and text.** The same attributes as scatter: `marker` (`symbol`, `size`,
  `sizemode`, `sizeref`, `sizemin`, `color` with colorscales, `coloraxis` and a colorbar, `line`,
  `opacity`), `line` (`color`, `width`, `dash`), `text`, `texttemplate`, `textposition` and
  `textfont`. See the [scatter page](/charts/basic/scatter#styling). Lines have no `shape`: a
  segment is always a great circle.
- **Fills.** `fill` is `'none'` or `'toself'`. `fillcolor` defaults to the line color, half
  transparent. The line of a filled trace is closed.
- **Selection styles.** `selected` and `unselected` (`marker.color`, `marker.size`,
  `marker.opacity`, `textfont.color`), as on scatter.
- **The map.** The base layers (`showland`, `showocean`, `showcountries`, `showlakes`, …, each
  with its color), the graticule (`lonaxis.showgrid`, `lataxis.showgrid`), the background
  (`bgcolor`) and the projection belong to the subplot: see [Maps](/fundamentals/maps).
- **Draw order.** Scatter traces are drawn above every base layer and above
  [choropleth](/charts/maps/choropleth) regions on the same subplot, in trace order.
- **Default look.** The default `holochart` template styles geo subplots for the dark page: dark
  land, lighter borders and coastlines. `layout.template: 'plotly-classic'` gives Plotly's look.
  See [themes and templates](/customization/themes-templates).

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scattergeo',
      lon: [-74.01, -0.13, 139.69],
      lat: [40.71, 51.51, 35.69],
      text: ['New York', 'London', 'Tokyo'],
      mode: 'lines+markers+text',
      textposition: 'top center',
      line: { width: 1.5, dash: 'dot' },
      marker: { symbol: 'diamond', size: 9 },
    },
  ],
  layout: {
    geo: {
      fitbounds: false,
      projection: { type: 'natural earth' },
      showocean: true,
      showcountries: true,
    },
  },
});
```

## Interactivity

- **Hover.** The closest point in screen distance shows `(lat°, lon°)`, then `text` or
  `hovertext`. A trace given by `locations` shows the location instead of the coordinates.
  `hoverinfo` takes the flags `lon`, `lat`, `location`, `text` and `name`. `hovertemplate` takes
  `%{lon}`, `%{lat}`, `%{text}`, `%{location}`, `%{customdata}` and, for a feature of the
  trace's `geojson`, `%{properties.<key>}`.

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/geo';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'scattergeo',
        lon: [2.35, 13.4],
        lat: [48.86, 52.52],
        text: ['Paris', 'Berlin'],
        hovertemplate: '%{text}: %{lat:.2f}° N, %{lon:.2f}° E<extra></extra>',
      },
    ],
  });
  ```

- **Moving the map.** A drag pans a scoped map and turns a world map; the wheel and a pinch
  zoom; a double-click goes back to the first view. The keys each gesture writes are in
  [Maps](/fundamentals/maps#interactions). The traces follow a pan or a zoom without being
  projected again.
- **Events.** `hover`, `click` and selection points carry `lon`, `lat` and `location` (`null`
  for a trace given by coordinates) next to `pointNumber` and `curveNumber`. For a trace given by
  `locations`, `lon` and `lat` are where the point is drawn, and a feature of the trace's
  `geojson` adds its `properties`.

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.lon, e.points[0]?.lat));
  ```

- **Selection.** With `dragmode: 'select'` or `'lasso'`, a drag selects the points inside the box
  or the lasso, in projected space; the map does not move while one of these modes is on. Only
  traces with markers or text select, as in Plotly, and points the projection hides are not
  selectable. `selectedpoints` holds the selection.

## Performance notes

- Markers and text are scatter's own GPU-instanced markers and text. Positions are projected on
  the CPU through d3-geo, once, and a **pan or a zoom reuses them**: it only changes a
  transform. A **rotation projects every point again** on each frame.
- Measured on an M1 Max: 100,000 markers are projected again in 6 to 13 ms per frame of a
  rotation, which holds 60 fps there with little to spare. Lines cost more, because each segment
  is resampled along its great circle: 10,000 long lines take 49 to 75 ms per frame, and lines
  are not simplified while the map turns. For many routes on a map that users will turn, prefer
  a scoped map or a flat projection that pans.
- A trace given by `locations` waits for the base map (or the `geojson`, or the table of country
  names) and draws when it has arrived. `chart.ready` waits with it; a load that fails is warned
  about once and the trace draws nothing.
- See [Maps](/fundamentals/maps#performance) for what the base map costs.

## Accessibility notes

- **Screen readers:** the hidden description (see the
  [accessibility guide](/guides/accessibility)) reads each trace by its kind (map scatter, map
  line or map area) with its point count and its extent in longitude and latitude. Its data
  table lists longitude and latitude per point, the location first for a trace given by
  `locations`, and `text` when given per point.
- **Keyboard:** Tab moves into the plot area; the arrow keys then step through the points that
  are on the map and in view, in data order, each showing its hover label. A point the
  projection hides, or one a pan has taken out of the subplot, is not a stop; the
  [view keys](/fundamentals/maps#keyboard) (Shift + arrows, `+` / `-`, `0`) move the map and
  bring it in.
- **Reading the map:** every projection distorts areas, distances or both. For bubble maps,
  where sizes are compared across the map, use an equal-area projection (`'equal earth'`,
  `'mollweide'`, `'albers'`) and `sizemode: 'area'`.
- **Color:** the default template's land and borders are low in contrast on purpose, so that
  markers stand out. Tell traces apart by marker symbol or line dash as well as by color.

## Attribute reference

See the [scattergeo attribute reference](/reference/scattergeo) for every trace attribute, its
type and its default. The subplot is under [`geo`](/reference/layout#geo) in the layout
reference: [`projection`](/reference/layout#geo.projection),
[`scope`](/reference/layout#geo.scope), [`fitbounds`](/reference/layout#geo.fitbounds),
[`resolution`](/reference/layout#geo.resolution) and the base layers.

## Related charts

- [Choropleth](/charts/maps/choropleth): values of regions as fill colors, on the same subplots;
  a `scattergeo` trace over a choropleth labels or marks its regions
- [Scatter](/charts/basic/scatter), [line](/charts/basic/line) and
  [bubble](/charts/basic/bubble): the cartesian twins of this trace
- [Maps](/fundamentals/maps): the geo subplot, projections, base layers and interactions
- [Express maps](/express/mappings#maps): `hx.scatterGeo` and `hx.lineGeo` from tabular data

## Plotly migration notes

- Attribute names and defaults match Plotly's `scattergeo`: `lon`, `lat`, `locations`,
  `locationmode`, `geojson`, `featureidkey`, `geo`, the scatter modes, markers, lines, text and
  the `toself` fill. A Plotly figure renders unchanged once the page imports
  `@mk7s/holochart/geo`; without it the trace is hidden and the warning names the import.
- The base map is built from Natural Earth and bundled, where Plotly fetches its own files from
  a CDN, so coastlines and borders differ slightly from Plotly's and no request is made. See
  [Maps](/fundamentals/maps#data-attribution-and-boundaries).
- `'ISO-3'` codes match in any case and with spaces around them; Plotly compares them as given.
- With `'geojson-id'`, every location that names a feature is drawn. Plotly keeps one point per
  distinct location (the last), so a location given twice is drawn once.
- Locations that match nothing are named in one console warning per trace. Plotly logs each one
  at its verbose level only.
- `fill: 'toself'` fills the smaller of the two regions a closed path bounds, whichever way
  round the points are given; in Plotly a path drawn the other way round fills the whole globe
  except the shape. An open run is closed back to its first point; Plotly drops the last point
  of an open run when it fills it.
- `geo.fitbounds` defaults to `'locations'`, as in plotly.js 4. A figure written for an older
  Plotly, where the default was `false`, shows the area of its data instead of the whole world:
  set `fitbounds: false`.
- Not supported yet: `marker.angleref`, `marker.standoff`, `marker.gradient`,
  `marker.line.dash`, `textfont.shadow`, `texttemplatefallback` and `hovertemplatefallback`.
  `textfont.style` and `textfont.weight` take one value, not an array.
