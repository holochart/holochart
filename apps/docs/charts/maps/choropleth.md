---
title: Choropleth maps
description: Regions of a map (countries, US states, or the features of your own GeoJSON) filled with the color of a value.
status: complete
chart: choropleth
launch-featured: true
---

# Choropleth maps

<ChartOverview />

## Overview

A choropleth fills each region of a map with a color that stands for a value: countries by
median age, states by population, districts by turnout. `locations` name the regions, `z` holds
their values, and a colorscale turns the values into colors, with a colorbar.

Use it for values that belong to a region as a whole and can be compared between regions of
different size: rates, shares, averages, densities. A choropleth of counts mostly shows which
regions are large or populous; divide by area or population first, or show the counts as
[bubbles](/charts/maps/scattergeo#bubble-map).

Traces are drawn on a **geo subplot**, `layout.geo` (and `geo2`, `geo3`, … for more), which holds
the projection, the base map and the view. [Maps](/fundamentals/maps) describes it.

Maps are not part of the full bundle. Add one import next to it, or register `tracesGeo` in a
partial bundle (see [adding the package](/fundamentals/maps#adding-the-package)):

```ts
import '@mk7s/holochart';
import '@mk7s/holochart/geo';
```

Pick a different chart when:

- the data are points, not regions: use [scatter on maps](/charts/maps/scattergeo);
- exact values matter more than where they are: a sorted [bar chart](/charts/basic/bar) reads
  more precisely than color, and small regions do not disappear in it;
- the regions are cells of a regular grid: a [heatmap](/charts/scientific/heatmap) draws them
  faster.

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'choropleth', locations: ['FRA', 'DEU', 'ITA', 'ESP'], z: [68, 84, 59, 48] }],
});
```

`locations` are ISO 3166-1 alpha-3 country codes by default, and `z` has one number per
location. The trace goes on `layout.geo`, which is created for it, and gets a colorbar. By
default the view is fitted to the regions that are drawn (`geo.fitbounds: 'locations'`), so this
figure shows western Europe; the live example sets `fitbounds: false` and a `natural earth`
projection for a world map. Countries the data does not name show the land color:

<Example id="choropleth/basic" />

## Data format

- **`locations` and `z`.** Two arrays; the trace has as many regions as the shorter one. A trace
  without either is hidden.
- **`locationmode`.** What the locations name:

  | `locationmode`      | A location is                                       | Regions                               |
  | ------------------- | --------------------------------------------------- | ------------------------------------- |
  | `'ISO-3'` (default) | an ISO 3166-1 alpha-3 code (`'FRA'`), in any case   | the countries of the base map         |
  | `'USA-states'`      | a postal code (`'CA'`) or a state's name            | the states of the base map            |
  | `'country names'`   | a country's name, or an ISO code                    | the countries of the base map         |
  | `'geojson-id'`      | a string or a number (the default with a `geojson`) | the features of the trace's `geojson` |

  The countries are those of the subplot's `scope` at its `resolution`. The 110m data has 176
  countries and leaves out the smallest (Malta, Singapore, Bahrain, Mauritius, Andorra, …); the
  50m data has 238, so use `resolution: 50` for them. A scope other than `world` has the
  countries of its continent only, as Natural Earth assigns them (Cyprus is in `asia`). The table
  of country names is a chunk of its own, loaded the first time a figure uses `'country names'`.

- **`geojson` and `featureidkey`.** Your own regions: a `FeatureCollection` or a `Feature` with
  `Polygon` or `MultiPolygon` geometries, as an object or as a URL. `featureidkey` is where each
  feature has the id that `locations` name: `'id'` by default, or a property such as
  `'properties.district'`. Holes and multipolygons are drawn as such.
- **Ring winding.** d3-geo, which projects the map, wants outer rings clockwise; RFC 7946 winds
  them counter-clockwise, and such a ring means the whole globe except the region. Rings of a
  `geojson` that cover more than a hemisphere are rewound for you, with one console warning per
  file. A region that really is larger than a hemisphere cannot be told apart and is rewound too.
- **What is not drawn.** A location that names no feature is skipped, and one console warning per
  trace lists the unmatched ones. A location whose `z` is not a number (`null`, `NaN`) is not
  drawn either: the land color shows there. The automatic color domain still spans every number
  in `z`, as in Plotly.
- **`text`.** One string per location, for hover labels.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

// Regions of your own: the features are matched by their `properties.code`.
const districts = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { code: 'A' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [10, 45],
            [10, 46],
            [11, 46],
            [11, 45],
            [10, 45],
          ],
        ],
      },
    },
  ],
};

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'choropleth',
      geojson: districts,
      featureidkey: 'properties.code',
      locations: ['A'],
      z: [12],
    },
  ],
  layout: { geo: { fitbounds: 'geojson', visible: false } },
});
```

## Variations

<ChartVariations />

### US states

`locationmode: 'USA-states'` reads postal codes or state names, on the scoped map of the United
States (`scope: 'usa'`: Albers USA, with Alaska and Hawaii as insets):

<ExampleLink id="choropleth/usa-states" />

### Diverging scale

For values on both sides of a meaningful middle, use a two-hued colorscale and put its middle on
that value with `zmid`. The color domain is then symmetric about it, whatever the range of the
data:

<ExampleLink id="choropleth/diverging" />

### Countries by name

`locationmode: 'country names'` takes English short names and common alternates, so a table
without ISO codes needs no lookup. The map here is a world map cut to Europe with
`lonaxis.range` and `lataxis.range`, at `resolution: 50` for the small countries:

<ExampleLink id="choropleth/country-names" />

### Your own regions from GeoJSON

`geojson` gives the features and `featureidkey` says where each has its id.
`fitbounds: 'geojson'` fits the view to the whole file, and `geo.visible: false` hides the base
map. One district here has a hole, and one is a multipolygon:

<ExampleLink id="choropleth/geojson" />

### A color axis shared with markers

A choropleth and the `marker` of a `scattergeo` trace that both name `coloraxis: 'coloraxis'`
share one colorscale, one domain and one colorbar, set in `layout.coloraxis`. The markers are
drawn above the regions:

<ExampleLink id="choropleth/coloraxis" />

### Values as labels

Color is the only encoding of a choropleth. A `scattergeo` trace with the same `locations` and
`mode: 'text'` writes each value on its region as a second one:

<ExampleLink id="choropleth/labels" />

### Selected regions

`selectedpoints` lists the selected locations by index, and `selected.marker.opacity` /
`unselected.marker.opacity` style the two groups. With `dragmode: 'select'` or `'lasso'`, drag
on the map to select:

<ExampleLink id="choropleth/selection" />

### From a table, with Express

[`hx.choropleth`](/express/mappings#maps) builds the trace from rows: `locations` and `color`
name columns.

## Styling

- **Colors.** `colorscale` (a name or a list of stops), `reversescale`, `autocolorscale`, and
  the domain: `zmin` and `zmax`, or `zauto` (the default) to take it from `z`, and `zmid` for the
  middle of a diverging scale. See [colors and colorscales](/fundamentals/colors-colorscales).
- **Colorbar.** Shown by default (`showscale: false` hides it); `colorbar` sets its title, ticks
  and size. `coloraxis: 'coloraxis'` hands the scale, the domain and the colorbar to
  `layout.coloraxis`, which other traces can share.
- **Outlines.** `marker.line.color` and `marker.line.width`, one value or one per location. A
  width of 0 draws none.
- **Opacity.** `marker.opacity`, one value or one per location, multiplied by the trace's
  `opacity`. The outline fades with its region.
- **Selection styles.** `selected.marker.opacity` and `unselected.marker.opacity`. While a
  selection is active, unselected regions are drawn at a fifth of their opacity unless one of
  the two is set.
- **Draw order.** Regions are drawn above the land, the country and coastline lines, the
  graticule and the frame, and under rivers, lakes and scatter traces.
- **Regions without data** show the base map: `geo.landcolor` with `showland`, else the
  background. Pick a land color that is not on the colorscale.
- **Default look.** The default `holochart` template gives geo subplots dark land and the
  figure's automatic colorscale; `layout.template: 'plotly-classic'` gives Plotly's look. See
  [themes and templates](/customization/themes-templates).

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'choropleth',
      locations: ['BRA', 'ARG', 'CHL', 'PER'],
      z: [-2, 4, 9, 1],
      colorscale: 'RdBu',
      zmid: 0,
      marker: { line: { color: '#fff', width: 0.5 }, opacity: 0.9 },
      colorbar: { title: { text: 'change, %' }, ticksuffix: ' %' },
    },
  ],
  layout: { geo: { scope: 'south america', landcolor: '#3a3a44' } },
});
```

## Interactivity

- **Hover.** The region under the pointer is hovered: a hole is not a hit, and of regions that
  overlap the one drawn on top is. The label shows the location and the value, then `text` or
  `hovertext`, and is anchored at the label point of the region, not at the pointer; when that
  point is hidden by the projection or outside the subplot, it is at the pointer. `hoverinfo`
  takes the flags `location`, `z`, `text` and `name`. `hovertemplate` takes `%{location}`,
  `%{z}`, `%{text}`, `%{ct}` (the label point as `[lon, lat]`), `%{customdata}` and, for a
  feature of the trace's `geojson`, `%{properties.<key>}`.

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/geo';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'choropleth',
        locationmode: 'USA-states',
        locations: ['CA', 'TX'],
        z: [39.5, 29.1],
        hovertemplate: '%{location}: %{z:.1f} M<extra></extra>',
      },
    ],
    layout: { geo: { scope: 'usa' } },
  });
  ```

- **Moving the map.** A drag pans a scoped map and turns a world map; the wheel and a pinch
  zoom; a double-click goes back to the first view. See
  [Maps](/fundamentals/maps#interactions) for the keys each gesture writes.
- **Events.** `hover`, `click` and selection points carry `location`, `z` and `ct` next to
  `pointNumber` and `curveNumber`; a feature of the trace's `geojson` adds its `properties`.

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.location, e.points[0]?.z));
  ```

- **Selection.** With `dragmode: 'select'` or `'lasso'`, a drag selects the regions whose label
  point is inside the box or the lasso, as in Plotly; the map does not move while one of these
  modes is on. Hold Shift to add to the selection, double-click to clear it. A region that is
  not drawn, or whose label point the projection hides, is not selectable.

## Performance notes

- All regions of a trace are one batched fill and one line primitive, so the number of regions
  costs little on the GPU. The work is on the CPU: projecting and triangulating the polygons,
  which grows with their vertex count.
- **A pan or a zoom costs nothing per vertex**: it changes a transform. Scoped maps (`usa`,
  `europe`, …) only pan and zoom, so even large GeoJSON stays smooth on them.
- **A rotation projects every region again on each frame.** Measured on an M1 Max, a frame costs
  about 0.55 ms per 1,000 vertices: a trace's own `geojson` turns at 60 fps up to about 25,000
  vertices and drops below that above. Nothing simplifies a `geojson` while it turns, so simplify
  large files before you hand them over if the map is one users will rotate.
- Regions matched against the base map at `resolution: 50` are projected from the 110m data
  while the map turns (5 to 6 ms a frame on the same machine) and get their 50m outlines back
  when it stops; that one frame is long (about 80 ms measured).
- Changing `z`, `colorscale`, `zmin` / `zmax`, opacities or the selection rewrites colors only;
  nothing is projected or triangulated again, unless the change alters which locations have a
  number.
- Hover finds the region through a grid over the projected polygons: a pointer move costs
  microseconds, also for 3,000 regions.
- The regions wait for their data (the base map, a `geojson` URL, the table of country names),
  and `chart.ready` waits with them. A load that fails is warned about once and the trace draws
  nothing.

## Accessibility notes

- **Color is the only encoding.** A choropleth has no position or length to fall back on, and
  there are no pattern fills for regions (`config.a11y.patterns` does not reach this trace).
  What a reader without the colors has today:
  - **labels**: a `scattergeo` trace with `mode: 'text'` over the same `locations` writes the
    values on the map ([example](#values-as-labels));
  - **hover and the keyboard**: every region shows its value in the hover label;
  - **the description and the data table**: see below.
- **Screen readers:** the hidden description (see the
  [accessibility guide](/guides/accessibility)) says how many regions are drawn, names the
  lowest and the highest with their values, and how many locations are not drawn. Its data table
  lists every location with its value (and `text` when given per location).
- **Keyboard:** Tab moves into the plot area; the arrow keys then step through the drawn regions
  in the order of `locations`, each showing its hover label at its label point. Regions whose
  label point the projection hides, or a pan has taken out of the subplot, are skipped; the
  [view keys](/fundamentals/maps#keyboard) (Shift + arrows, `+` / `-`, `0`) move the map and
  bring them in.
- **Colorscales:** use a sequential scale for amounts and a diverging one, with `zmid`, only
  when the middle means something. Check the ends of the scale against `geo.landcolor` and
  `bgcolor`: a region must not look like "no data". Give the colorbar a title with the unit.
- **Small regions** carry as much data as large ones and are hard to see or hit. A table or a
  bar chart next to the map helps.

## Attribute reference

See the [choropleth attribute reference](/reference/choropleth) for every trace attribute, its
type and its default. The subplot is under [`geo`](/reference/layout#geo) in the layout
reference, and a shared color axis under [`coloraxis`](/reference/layout#coloraxis).

## Related charts

- [Scatter on maps](/charts/maps/scattergeo): points, bubbles, lines and labels on the same
  subplots
- [Heatmap](/charts/scientific/heatmap): values of a regular grid as colors
- [Bar](/charts/basic/bar): the same values, sorted, when exact comparison matters more than
  place
- [Maps](/fundamentals/maps): the geo subplot, projections, base layers and interactions
- [Express maps](/express/mappings#maps): `hx.choropleth` from tabular data

## Plotly migration notes

- Attribute names and defaults match Plotly's `choropleth`: `locations`, `z`, `locationmode`,
  `geojson`, `featureidkey`, `geo`, the colorscale attributes (`zmin`, `zmax`, `zmid`, `zauto`,
  `colorscale`, `coloraxis`, …), `marker.line`, `marker.opacity`, `selected` and `unselected`. A
  Plotly figure renders unchanged once the page imports `@mk7s/holochart/geo`; without it the
  trace is hidden and the warning names the import.
- The regions of the base map are built from Natural Earth and bundled. Plotly fetches its own
  files, which now draw United Nations boundaries, so some borders differ. See
  [Maps](/fundamentals/maps#data-attribution-and-boundaries).
- A scoped map keeps whole every country polygon that reaches into the scope's box (Russia in
  `europe`), and the subplot's ranges frame it. Plotly's scope files are cut at the box.
- `'ISO-3'` codes match in any case and with spaces around them; Plotly compares them as given.
- Locations that match nothing are named in one console warning per trace. Plotly logs each one
  at its verbose level only.
- With `'geojson-id'`, every location that names a feature is a region of its own. Plotly keeps
  one per distinct location (the last).
- A `geojson` wound the RFC 7946 way is rewound, with one warning.
- The hover label is anchored at the region's label point, as in Plotly, but falls back to the
  pointer when that point is hidden or outside the subplot.
- The default colorscale comes from the template, as for every trace: set `colorscale` to get
  the scale a Plotly figure relied on.
- `geo.fitbounds` defaults to `'locations'`, as in plotly.js 4: without it set to `false`, a
  world choropleth of a few countries shows those countries.
- Not supported yet: `hovertemplatefallback`.
