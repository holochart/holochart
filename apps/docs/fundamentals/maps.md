---
title: Maps
description: The geo subplot — adding the map package, projections, scopes, base layers, fitting the view, interactions, several maps in a figure, what the map data costs and where it comes from.
status: complete
---

# Maps

A map in Holochart is a **geo subplot**: `layout.geo` holds a map projection, a base map of land,
coastlines and borders, and the view. The traces [`scattergeo`](/charts/maps/scattergeo) and
[`choropleth`](/charts/maps/choropleth) draw on it. The attributes are Plotly's `layout.geo`, so
a Plotly figure with a projected map renders as it is.

This page covers the subplot, flat and as a [3D globe](#the-3d-globe). One kind of map is not
here because it does not exist yet: tile maps (`scattermap`, `choroplethmap`, `densitymap` on
streets or imagery). They are planned.

## Adding the package

<InstallStatus ecosystem="javascript" />

Use these imports in the [built source workspace](/getting-started/installation#build-from-source-today).
The workspace install already supplies the runtime, extension package and three.js.

Maps live in `@mk7s/holochart-traces-geo`. Like the graph package, it is not registered by the full bundle, so that apps without a map do not download map code.

With the full bundle, add one import after it. It registers the package and re-exports it:

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'scattergeo', lon: [-0.13, 2.35, 13.4], lat: [51.51, 48.86, 52.52] }],
  layout: { geo: { projection: { type: 'natural earth' }, fitbounds: false } },
});
```

Nothing else is installed: `@mk7s/holochart` depends on the geo package.

With a [partial bundle](/getting-started/installation#smaller-bundles-with-partial-packages),
import the package alongside the runtime and register `tracesGeo`, which holds both traces and the
component that draws the subplot:

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { tracesGeo } from '@mk7s/holochart-traces-geo';

register(...tracesGeo);

createChart(document.getElementById('chart')!, {
  data: [{ type: 'choropleth', locations: ['FRA', 'DEU'], z: [68, 84] }],
});
```

A figure with a `scattergeo` or `choropleth` trace, or a `layout.geo`, on a chart without the
package is drawn without them, and the console warning names the import that is missing.

The script-tag build has no maps yet.

## The geo subplot

A geo trace goes on `layout.geo` unless it names another subplot (`geo: 'geo2'`). The container
is created when a trace needs it, so a figure can leave it out. Without any attribute it is a
world map in the equirectangular projection with coastlines and a frame, fitted to the data.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'scattergeo', lon: [-74, 2.35, 139.7], lat: [40.7, 48.86, 35.7] }],
  layout: {
    geo: {
      projection: { type: 'orthographic', rotation: { lon: -30, lat: 30 } },
      fitbounds: false,
      showocean: true,
      showcountries: true,
      lonaxis: { showgrid: true },
      lataxis: { showgrid: true },
    },
  },
});
```

<Example id="scattergeo/great-circles" />

What the container holds:

| Attributes                                                                                | What they set                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `projection.type`                                                                         | The projection: see [the table below](#projections)                                                          |
| `projection.rotation.lon`, `.lat`, `.roll`                                                | How the globe is turned before it is projected                                                               |
| `projection.scale`, `center.lon`, `center.lat`                                            | The zoom factor (1 fits the ranges into the subplot) and the point in the middle                             |
| `projection.minscale`, `projection.maxscale`                                              | Limits of zooming by hand                                                                                    |
| `projection.parallels`                                                                    | The two standard parallels of a conic projection                                                             |
| `projection.tilt`, `projection.distance`                                                  | The viewpoint of the `satellite` projection                                                                  |
| `lonaxis.range`, `lataxis.range`                                                          | The longitudes and latitudes in view: the map is fitted to this box and clipped to it                        |
| `scope`                                                                                   | The part of the world the base map covers: see [Scopes](#scopes)                                             |
| `fitbounds`                                                                               | Fit the view to the data: see [Fitting the view](#fitting-the-view)                                          |
| `resolution`                                                                              | Detail of the base map, `110` or `50`: see [What the data costs](#what-the-data-costs)                       |
| `showland`, `showocean`, `showlakes`, `showrivers`                                        | Filled land, ocean and lakes, and rivers; each with its `…color` (rivers: `…width`)                          |
| `showcoastlines`, `showcountries`, `showsubunits`, `showframe`                            | Lines: coasts, country borders, state borders, the outline of the globe; each with its `…color` and `…width` |
| `lonaxis` / `lataxis`: `showgrid`, `dtick`, `tick0`, `gridcolor`, `gridwidth`, `griddash` | The graticule: meridians every 30° and parallels every 10° by default                                        |
| `bgcolor`                                                                                 | The background inside the map's frame                                                                        |
| `visible`                                                                                 | `false` hides every base layer and the graticule, unless the figure shows one itself                         |
| `domain`                                                                                  | Where the subplot is in the figure: see [Several maps](#several-maps-and-other-subplots)                     |

The [layout reference](/reference/layout#geo) has every attribute with its default.

**Base layers.** Which layers show by default depends on the map: coastlines and the frame on
world maps, country borders on scoped maps other than `usa`, state borders on `usa` (and on
`north america` at `resolution: 50`, which also has Canada's provinces). Land, ocean, lakes and
rivers are off in the schema, as in Plotly; the default `holochart` template turns the land and
the lakes on and colors them for its dark page. Albers USA draws neither coastlines nor an ocean.

**Rotation.** `projection.rotation` turns the globe before it is projected: `lon` puts another
meridian in the middle, `lat` tips the globe towards a pole, `roll` turns it about the line of
sight. Every rotation moves the place where a flat map is cut:

<Example id="geo/rotations" :height="460" />

**Draw order**, bottom to top: background, ocean, land, lakes, state borders, country borders,
coastlines, rivers, graticule, frame, choropleth regions, scatter traces. On a subplot with a
choropleth, rivers and lakes move above the regions.

## Scopes

`scope` picks the part of the world the base map covers, and with it a default projection,
default ranges and how the map is moved:

| `scope`           | Default projection | Shows                                                                 |
| ----------------- | ------------------ | --------------------------------------------------------------------- |
| `'world'`         | `equirectangular`  | Everything                                                            |
| `'usa'`           | `albers usa`       | The United States, with Alaska and Hawaii as insets, and their states |
| `'europe'`        | `conic conformal`  | The countries of Europe                                               |
| `'asia'`          | `mercator`         | The countries of Asia                                                 |
| `'africa'`        | `mercator`         | The countries of Africa                                               |
| `'north america'` | `conic conformal`  | The countries of North America                                        |
| `'south america'` | `mercator`         | The countries of South America                                        |
| `'antarctica'`    | `equirectangular`  | Antarctica                                                            |
| `'oceania'`       | `equirectangular`  | The countries of Oceania                                              |

A scoped map shows only the countries of its continent, as Natural Earth assigns them, with the
land, lakes and rivers that belong to them: the rest of the world is not drawn, and `locations`
outside the scope match nothing. A country polygon that reaches into the scope's box is kept
whole (Russia in `europe`), and `lonaxis.range` / `lataxis.range` frame the map. Overseas parts
outside the box are left out (France in `europe` is without French Guiana).

<Example id="geo/scope-europe" :height="460" />

`scope: 'usa'` is three projections in one, each clipped to a frame of its own: the contiguous
states, Alaska and Hawaii. Nothing is drawn between the frames, lines included:

<Example id="geo/usa-insets" :height="440" />

A scoped map **pans and zooms** and never rotates. To show a continent on a map that turns, or
with countries of the neighbouring continent, use `scope: 'world'` and set the ranges yourself:

<Example id="choropleth/country-names" />

An `albers usa` map is always the `usa` scope.

## Projections

`projection.type` takes Plotly's names, and one [Holochart extra](#holochart-extra). Plotly's are
all drawn by [d3-geo](https://github.com/d3/d3-geo) and
[d3-geo-projection](https://github.com/d3/d3-geo-projection), on the CPU, with d3's clipping at
the edge of the projection, cutting at the antimeridian and resampling of long edges into curves.

<Example id="geo/projections" :height="560" />

<!-- generated:geo-projections-summary:start -->

`projection.type` takes Plotly's **84** names (82 projections: 2 are second names of another). **16** are in the package's own code and **68** in its lazy chunk. It also takes `globe3d`, a [Holochart extra](#holochart-extra) that is not a Plotly projection.

<!-- generated:geo-projections-summary:end -->

A figure that names a projection of the lazy chunk loads it once, with a dynamic `import()`; the
map is drawn when the chunk has arrived, and `chart.ready` waits for it.

The last two columns say what a drag does on a **world** map of that type (a scoped map always
pans, see [Interactions](#interactions)) and whether [`fitbounds`](#fitting-the-view) can fit it.

### In the package's own code

The projections `d3-geo` has. They cost nothing beyond the package itself.

<!-- generated:geo-projections-builtin:start -->

| `projection.type`       | d3 projection             | A drag on a world map                 | `fitbounds` |
| ----------------------- | ------------------------- | ------------------------------------- | ----------- |
| `albers`                | `geoAlbers`               | turns in longitude, moves up and down | Yes         |
| `albers usa`            | `geoAlbersUsa`            | pans                                  | No          |
| `azimuthal equal area`  | `geoAzimuthalEqualArea`   | turns in longitude and latitude       | Yes         |
| `azimuthal equidistant` | `geoAzimuthalEquidistant` | turns in longitude and latitude       | Yes         |
| `conic conformal`       | `geoConicConformal`       | turns in longitude and latitude       | Yes         |
| `conic equal area`      | `geoConicEqualArea`       | turns in longitude, moves up and down | Yes         |
| `conic equidistant`     | `geoConicEquidistant`     | turns in longitude, moves up and down | Yes         |
| `equal earth`           | `geoEqualEarth`           | turns in longitude, moves up and down | Yes         |
| `equirectangular`       | `geoEquirectangular`      | turns in longitude, moves up and down | Yes         |
| `gnomonic`              | `geoGnomonic`             | turns in longitude and latitude       | Yes         |
| `mercator`              | `geoMercator`             | turns in longitude, moves up and down | Yes         |
| `natural earth`         | `geoNaturalEarth1`        | turns in longitude, moves up and down | Yes         |
| `natural earth1`        | `geoNaturalEarth1`        | turns in longitude, moves up and down | Yes         |
| `orthographic`          | `geoOrthographic`         | turns in longitude and latitude       | Yes         |
| `stereographic`         | `geoStereographic`        | turns in longitude and latitude       | Yes         |
| `transverse mercator`   | `geoTransverseMercator`   | turns in longitude and latitude       | Yes         |

<!-- generated:geo-projections-builtin:end -->

### In the lazy chunk

The projections of `d3-geo-projection`: one chunk for all of them.

<!-- generated:geo-projections-lazy:start -->

| `projection.type`           | d3 projection                 | A drag on a world map                 | `fitbounds` |
| --------------------------- | ----------------------------- | ------------------------------------- | ----------- |
| `airy`                      | `geoAiry`                     | turns in longitude, moves up and down | Yes         |
| `aitoff`                    | `geoAitoff`                   | turns in longitude, moves up and down | Yes         |
| `august`                    | `geoAugust`                   | turns in longitude, moves up and down | Yes         |
| `baker`                     | `geoBaker`                    | turns in longitude, moves up and down | Yes         |
| `bertin1953`                | `geoBertin1953`               | turns in longitude, moves up and down | Yes         |
| `boggs`                     | `geoBoggs`                    | turns in longitude, moves up and down | Yes         |
| `bonne`                     | `geoBonne`                    | turns in longitude, moves up and down | Yes         |
| `bottomley`                 | `geoBottomley`                | turns in longitude, moves up and down | Yes         |
| `bromley`                   | `geoBromley`                  | turns in longitude, moves up and down | Yes         |
| `collignon`                 | `geoCollignon`                | turns in longitude, moves up and down | Yes         |
| `craig`                     | `geoCraig`                    | turns in longitude, moves up and down | No          |
| `craster`                   | `geoCraster`                  | turns in longitude, moves up and down | Yes         |
| `cylindrical equal area`    | `geoCylindricalEqualArea`     | turns in longitude, moves up and down | Yes         |
| `cylindrical stereographic` | `geoCylindricalStereographic` | turns in longitude, moves up and down | Yes         |
| `eckert1`                   | `geoEckert1`                  | turns in longitude, moves up and down | Yes         |
| `eckert2`                   | `geoEckert2`                  | turns in longitude, moves up and down | Yes         |
| `eckert3`                   | `geoEckert3`                  | turns in longitude, moves up and down | Yes         |
| `eckert4`                   | `geoEckert4`                  | turns in longitude, moves up and down | Yes         |
| `eckert5`                   | `geoEckert5`                  | turns in longitude, moves up and down | Yes         |
| `eckert6`                   | `geoEckert6`                  | turns in longitude, moves up and down | Yes         |
| `eisenlohr`                 | `geoEisenlohr`                | turns in longitude, moves up and down | Yes         |
| `fahey`                     | `geoFahey`                    | turns in longitude, moves up and down | Yes         |
| `foucaut`                   | `geoFoucaut`                  | turns in longitude, moves up and down | Yes         |
| `foucaut sinusoidal`        | `geoFoucautSinusoidal`        | turns in longitude, moves up and down | Yes         |
| `ginzburg4`                 | `geoGinzburg4`                | turns in longitude, moves up and down | Yes         |
| `ginzburg5`                 | `geoGinzburg5`                | turns in longitude, moves up and down | Yes         |
| `ginzburg6`                 | `geoGinzburg6`                | turns in longitude, moves up and down | Yes         |
| `ginzburg8`                 | `geoGinzburg8`                | turns in longitude, moves up and down | Yes         |
| `ginzburg9`                 | `geoGinzburg9`                | turns in longitude, moves up and down | Yes         |
| `gringorten`                | `geoGringorten`               | turns in longitude, moves up and down | Yes         |
| `gringorten quincuncial`    | `geoGringortenQuincuncial`    | turns in longitude, moves up and down | Yes         |
| `guyou`                     | `geoGuyou`                    | turns in longitude, moves up and down | Yes         |
| `hammer`                    | `geoHammer`                   | turns in longitude, moves up and down | Yes         |
| `hill`                      | `geoHill`                     | turns in longitude, moves up and down | Yes         |
| `homolosine`                | `geoHomolosine`               | turns in longitude, moves up and down | Yes         |
| `hufnagel`                  | `geoHufnagel`                 | turns in longitude, moves up and down | Yes         |
| `hyperelliptical`           | `geoHyperelliptical`          | turns in longitude, moves up and down | Yes         |
| `kavrayskiy7`               | `geoKavrayskiy7`              | turns in longitude, moves up and down | Yes         |
| `lagrange`                  | `geoLagrange`                 | turns in longitude, moves up and down | Yes         |
| `larrivee`                  | `geoLarrivee`                 | turns in longitude, moves up and down | Yes         |
| `laskowski`                 | `geoLaskowski`                | turns in longitude, moves up and down | Yes         |
| `loximuthal`                | `geoLoximuthal`               | turns in longitude, moves up and down | Yes         |
| `miller`                    | `geoMiller`                   | turns in longitude, moves up and down | Yes         |
| `mollweide`                 | `geoMollweide`                | turns in longitude, moves up and down | Yes         |
| `mt flat polar parabolic`   | `geoMtFlatPolarParabolic`     | turns in longitude, moves up and down | Yes         |
| `mt flat polar quartic`     | `geoMtFlatPolarQuartic`       | turns in longitude, moves up and down | Yes         |
| `mt flat polar sinusoidal`  | `geoMtFlatPolarSinusoidal`    | turns in longitude, moves up and down | Yes         |
| `natural earth2`            | `geoNaturalEarth2`            | turns in longitude, moves up and down | Yes         |
| `nell hammer`               | `geoNellHammer`               | turns in longitude, moves up and down | Yes         |
| `nicolosi`                  | `geoNicolosi`                 | turns in longitude, moves up and down | Yes         |
| `patterson`                 | `geoPatterson`                | turns in longitude, moves up and down | Yes         |
| `peirce quincuncial`        | `geoPeirceQuincuncial`        | turns in longitude, moves up and down | No          |
| `polyconic`                 | `geoPolyconic`                | turns in longitude, moves up and down | Yes         |
| `rectangular polyconic`     | `geoRectangularPolyconic`     | turns in longitude, moves up and down | Yes         |
| `robinson`                  | `geoRobinson`                 | turns in longitude, moves up and down | Yes         |
| `satellite`                 | `geoSatellite`                | turns in longitude, moves up and down | No          |
| `sinu mollweide`            | `geoSinuMollweide`            | turns in longitude, moves up and down | Yes         |
| `sinusoidal`                | `geoSinusoidal`               | turns in longitude, moves up and down | Yes         |
| `times`                     | `geoTimes`                    | turns in longitude, moves up and down | Yes         |
| `van der grinten`           | `geoVanDerGrinten`            | turns in longitude, moves up and down | Yes         |
| `van der grinten2`          | `geoVanDerGrinten2`           | turns in longitude, moves up and down | Yes         |
| `van der grinten3`          | `geoVanDerGrinten3`           | turns in longitude, moves up and down | Yes         |
| `van der grinten4`          | `geoVanDerGrinten4`           | turns in longitude, moves up and down | Yes         |
| `wagner4`                   | `geoWagner4`                  | turns in longitude, moves up and down | Yes         |
| `wagner6`                   | `geoWagner6`                  | turns in longitude, moves up and down | Yes         |
| `wiechel`                   | `geoWiechel`                  | turns in longitude, moves up and down | Yes         |
| `winkel tripel`             | `geoWinkel3`                  | turns in longitude, moves up and down | Yes         |
| `winkel3`                   | `geoWinkel3`                  | turns in longitude, moves up and down | Yes         |

<!-- generated:geo-projections-lazy:end -->

### Holochart extra

`globe3d` is not a Plotly projection: it is Holochart's own type, for the
[3D globe](#the-3d-globe). Its view (the rotation, the scale, what a drag does and `fitbounds`)
is that of `orthographic`.

<!-- generated:geo-projections-extra:start -->

| `projection.type` | Its view is that of | A drag on a world map           | `fitbounds` |
| ----------------- | ------------------- | ------------------------------- | ----------- |
| `globe3d`         | `orthographic`      | turns in longitude and latitude | Yes         |

<!-- generated:geo-projections-extra:end -->

The four regions above are generated from the tables `D3_GEO_PROJECTIONS` and
`D3_GEO_PROJECTION_PROJECTIONS` and from `GLOBE_PROJECTION` of
`packages/traces-geo/src/geo/constants.ts` by
`pnpm --filter @mk7s/holochart-docs gen:galleries` (`apps/docs/scripts/gen-galleries.ts`), which
the docs build runs too. Do not edit between the markers.

## The 3D globe

`projection.type: 'globe3d'` draws the map as a lit sphere. It is the `orthographic` view in
three dimensions: the same `projection.rotation` and `projection.scale`, the same drags, wheel
and keys, the same relayout keys, and every point lands on the pixel the orthographic map puts
it on. Switching a subplot between the two is a relayout of one attribute.

<Example id="geo/globe3d" />

What the third dimension adds:

- **It turns for free.** The base layers and the regions of a choropleth are meshes on a sphere,
  built once; a rotation or a zoom moves them with one matrix and projects nothing. A globe at
  `resolution: 50` keeps its 50m coastlines while it turns
  (see [Performance](#performance)).
- **Lines are arcs.** A `scattergeo` line rises above the surface along its great circle, higher
  the longer it is, and passes behind the globe where the route does. `line.lift` sets the height
  per radian of length, in globe radii (default 0.15; 0 keeps lines on the surface).

  <Example id="scattergeo/globe-arcs" />

- **Regions can stand up.** A choropleth's `elevation` gives each location a second value, drawn
  as the height of a prism rising from the sphere; `elevationscale` is the height of the largest
  one in globe radii (default 0.25). Hover picks what is drawn: a prism is hit on its walls and
  its cap, and it hides the regions behind it.

  <Example id="choropleth/globe" />

`line.lift`, `elevation` and `elevationscale` are Holochart's own and are ignored on a flat map.

What to know:

- **Leave room for what rises.** At `projection.scale: 1` the globe fills its domain, and an arc
  or a prism that rises past the limb at the top or bottom is cut by the domain's edge. A scale
  under 1 (the examples use 0.85 and 0.9) leaves room.
- **The view is orthographic.** There is no perspective, no tilt and no orbit camera: the globe
  always faces you.
- **Markers and text are drawn on top**, as on a flat map. They hide on the far side, but a
  marker behind a prism is drawn over it.
- **The light is fixed**: from the upper left, the same at every rotation, with no highlights, so
  a choropleth's colors stay close to its colorscale. There are no lighting attributes yet.
- **It loads more code**, on first use: the globe's own chunk (12 kB) and the renderer's 3D
  meshes, lines and pickers (about 27 kB together, shared with 3D scenes). A flat map loads
  none of it.

## At the edges of a map

A flat map has to end somewhere, and a globe hides its far side. d3-geo cuts every polygon and
line where the map ends and closes the pieces, which is where map renderers usually show seams,
slivers or fills that cover everything but the region. What to expect:

**The antimeridian.** A world map ends at the meridian opposite `projection.rotation.lon`. The
base map keeps countries that lie on both sides of 180° in one piece (Russia, Fiji, the
Aleutians), so on a map centered on the Pacific they are drawn whole. An axis range can cross
180° too: `lonaxis.range: [100, -100]` runs east from 100° E to 100° W.

<Example id="geo/antimeridian" :height="420" />

**The poles.** Antarctica is a polygon around a pole. On a flat map it is closed along the bottom
edge; seen from below on an orthographic map it is an island like any other.

<Example id="geo/poles" :height="480" />

**Holes and islands.** A country that surrounds another has a hole in it (South Africa around
Lesotho), and a country of several parts is a multipolygon; a choropleth fills exactly those.
Large lakes are a layer of their own on top of the land (`showlakes`).

<Example id="geo/holes" :height="400" />

**The limb of a globe.** On an orthographic map everything is cut at the edge of the visible
hemisphere: lines run to it and come back on the other side, filled areas are closed along it,
and markers behind it are not drawn.

<Example id="geo/globe-limb" :height="460" />

## Fitting the view

`fitbounds` fits the view to the data of the subplot's traces:

- `'locations'` (the default): to the points and regions the traces draw. A `scattergeo` trace
  adds room for half its largest marker; a `choropleth` is fitted to the bounds of its regions,
  and regions on both sides of the antimeridian fit as one group.
- `'geojson'`: to the whole `geojson` of the traces, drawn or not.
- `false`: the view is what the layout says: the ranges, the rotation, the center and the scale.

What the fit sets depends on the map: `center` and `projection.scale` on a scoped map; also
`projection.rotation.lon` on a world map; and on a world map of a projection that shows part of
the globe (`orthographic`, …) `projection.rotation.lat` and both axis ranges as well.

The fit is **off when the figure sets any of the attributes it would set**: a figure that gives
`center`, `projection.scale`, a rotation or an axis range wants that view. It is also off for
the projections it cannot fit: `albers usa`, `craig`, `peirce quincuncial` and `satellite`.

When the user moves the map, the gesture's `relayout` carries `geo.fitbounds: false`, so the
next draw does not fit again over what the user chose.

## Interactions

Hover, click and selection belong to the traces: see
[scattergeo](/charts/maps/scattergeo#interactivity) and
[choropleth](/charts/maps/choropleth#interactivity). The subplot itself is moved with the
pointer, when `layout.dragmode` is `'pan'` or `'zoom'` (either: a drag never draws a zoom box on
a map):

| Gesture           | What it does                                                                        |
| ----------------- | ----------------------------------------------------------------------------------- |
| Drag, one finger  | Moves the map: see the table below                                                  |
| Wheel             | Zooms about the pointer, when `config.scrollZoom` allows `'geo'` (the default does) |
| Pinch             | Zooms about the middle of the two fingers                                           |
| Double-click      | Goes back to the first drawn view, and emits `doubleclick`                          |
| Press and release | A click on the points under the pointer                                             |

With `dragmode: 'select'` or `'lasso'` a drag selects, the map does not move, and the wheel
scrolls the page. `config.staticPlot` turns all of it off.

What a drag does, and what the `relayout` that ends a gesture carries, depends on the kind of
map. The keys are Plotly's, prefixed with the subplot's id (`geo2.…` for the second map):

| Map                                                                        | A drag                                                                                                                                 | Keys of the `relayout`                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Scoped**: any scope but `world`, and `albers usa`                        | Pans. A zoom scales about the pointer.                                                                                                 | `geo.center.lon`, `geo.center.lat`, `geo.projection.scale`                                |
| **World, whole sphere**: `equirectangular`, `natural earth`, `mercator`, … | Turns the map in longitude, so that the meridian that was grabbed stays under the pointer, and moves it up and down.                   | `geo.projection.rotation.lon`, `geo.center.lon`, `geo.center.lat`, `geo.projection.scale` |
| **World, part of the sphere**: `orthographic`, `stereographic`, …          | Turns the globe in longitude and latitude, so that the point that was grabbed stays under the pointer. A zoom scales about the middle. | `geo.projection.rotation.lon`, `geo.projection.rotation.lat`, `geo.projection.scale`      |

The projection table above says which world maps are of the third kind ("turns in longitude and
latitude").

While a gesture is under way the chart emits `relayouting` with the same keys; when the pointer
is released, or the wheel has rested, one `relayout` commits the view. A key whose value did not
change is left out, and `geo.fitbounds: false` is added when `fitbounds` was on.
`projection.minscale` and `projection.maxscale` limit the zoom.

```ts
chart.on('relayout', (update) => {
  const lon = update['geo.projection.rotation.lon'];
  if (lon !== undefined) console.log('turned to', lon);
});

// The same keys set the view from code.
void chart.relayout({ 'geo.projection.rotation.lon': -100, 'geo.projection.scale': 2 });
```

`layout.uirevision` keeps the user's view across `react` calls, as it keeps any other edit made
by hand. The subplot's own `geo.uirevision` is accepted but not read yet.

### Keyboard

With the focus in the plot area, the arrow keys step through the points and regions of the geo
traces (see the [accessibility guide](/guides/accessibility#keys-by-chart-family)), and the view
keys of the 3D scenes move the map:

| Keys           | What they do                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Shift + arrows | Move the view where the arrow points, by a tenth of the subplot: a scoped map pans, a world map turns, as under a drag   |
| `+` / `-`      | Zoom in and out about the middle of the map, by a factor of 1.25, inside `projection.minscale` and `projection.maxscale` |
| `0`            | Go back to the first drawn view, like a double-click                                                                     |

Each key press is one `relayout` with the same keys as the gesture it stands for, and the new
view is announced (the longitude and latitude in the middle of the map, and the scale). With the
cursor on a point or a region, its subplot gets the keys; without a cursor, every geo subplot
does.

There are no modebar buttons for maps yet.

## Several maps and other subplots

A figure can hold several geo subplots, `geo`, `geo2`, `geo3`, …, each with its own projection,
view and base layers. A trace picks one with `geo: 'geo2'`. Place them with `domain`: either
fractions of the plot area (`domain.x`, `domain.y`) or a cell of `layout.grid` (`domain.row`,
`domain.column`). Subplots without a domain are stacked, the first at the bottom.

A map keeps its shape, so it fills the width or the height of its domain, rarely both.

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

// Two maps side by side in a grid: the same data on a flat map and on a globe.
const cities = { lon: [-74, 2.35, 139.7, 151.2], lat: [40.7, 48.86, 35.7, -33.9] };

createChart(document.getElementById('chart')!, {
  data: [
    { type: 'scattergeo', ...cities, geo: 'geo' },
    { type: 'scattergeo', ...cities, geo: 'geo2' },
  ],
  layout: {
    grid: { rows: 1, columns: 2 },
    geo: { domain: { row: 0, column: 0 }, fitbounds: false },
    geo2: {
      domain: { row: 0, column: 1 },
      fitbounds: false,
      projection: { type: 'orthographic', rotation: { lon: 60, lat: 20 } },
    },
  },
});
```

A map sits next to cartesian axes, polar subplots or 3D scenes the same way: give each its
domain. Here a choropleth takes the left of the figure and a bar chart of the same values the
right:

```ts
import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

const codes = ['BRA', 'ARG', 'COL', 'PER'];
const values = [216, 46, 52, 34];

createChart(document.getElementById('chart')!, {
  data: [
    { type: 'choropleth', locations: codes, z: values, showscale: false },
    { type: 'bar', x: values, y: codes, orientation: 'h' },
  ],
  layout: {
    geo: { domain: { x: [0, 0.55] }, scope: 'south america' },
    xaxis: { domain: [0.65, 1] },
  },
});
```

Each geo subplot draws in a viewport of its own, clipped to the box of its ranges, so a map
never paints over its neighbours.

## What the data costs

The base map is data, and data is most of what a map downloads. All of it is in the geo package
as lazy chunks, loaded with `import()` the first time a subplot needs them: your bundler emits
them as files next to your own chunks, and a page that draws no map loads none of them.

| Chunk                                            | Loaded when                                                                                 | Size, min + gzip                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------- |
| Base, 110m: countries and land                   | A map at `resolution: 110` (the default) is drawn                                           | 31.3 kB                          |
| Extras, 110m: lakes, rivers, US states           | That map shows lakes, rivers or state borders, or a trace uses `locationmode: 'USA-states'` | 8.7 kB                           |
| Base, 50m                                        | A map at `resolution: 50` is drawn                                                          | 178.3 kB                         |
| Extras, 50m: lakes, rivers, states and provinces | As for 110m                                                                                 | 104.9 kB                         |
| Country names                                    | A trace uses `locationmode: 'country names'`                                                | a 38 kB table before compression |
| Projections of `d3-geo-projection`               | A figure names one of [them](#in-the-lazy-chunk)                                            | about 12 kB                      |

So a map at the default resolution downloads about **40 kB** of data with every layer, and a map
at `resolution: 50` about **283 kB**. Coastlines, borders and the ocean are derived from the
countries and cost nothing more. The default template shows lakes, so with it a map loads both
chunks of its resolution; set `showlakes: false` (and no rivers or state borders) to load the
base chunk alone.

`resolution: 110` is drawn from Natural Earth's 1:110,000,000 data: 176 countries, without the
smallest. It suits world maps. `resolution: 50` (1:50,000,000) has 238 countries and finer
coasts, which a map of one continent or country shows.

A chunk that fails to load, or takes longer than 30 seconds, never holds `chart.ready`: the map
is drawn without those layers, traces that needed the data draw nothing, and the console says
what was missing, once.

## Performance

Everything on a map is projected on the CPU through d3-geo and drawn by the same GPU primitives
as the other charts. What that costs depends on the gesture:

- **A pan or a zoom is free.** Projected geometry is kept in pixels, and a pan or a zoom only
  changes a transform, whatever the amount of data. When a zoom has settled, curves are
  projected once more at the new scale, so that they stay smooth.
- **A rotation projects again**, on every frame: the base layers and every trace on the subplot.
  At `resolution: 110` a world's base layers fit in a frame on the machine they were measured on
  (below), with a few milliseconds left for the traces.
- **A 3D globe is the exception**: it turns by a matrix and projects nothing, at any resolution
  and with any number of regions. On an M1 Max a 50m globe with every layer turns in about 9 ms
  a frame, nearly all of it drawing; the same map as `orthographic` would take 92 ms a frame at
  50m, which is why flat maps do the following.
- **A flat map at `resolution: 50` shows 110m coastlines while it rotates.** The 50m data cannot be
  projected in a frame (about 90 ms measured for a world on an M1 Max, against 12 ms for 110m),
  so during a rotation the base layers, and choropleth regions matched against them, are drawn
  from the 110m data. When the rotation ends the 50m layers come back over a few frames. On a
  world view the difference is hard to see; zoomed in, coasts visibly sharpen when you let go.
- **Your own GeoJSON has no coarser copy** and is projected in full while it rotates. Measured on
  an M1 Max, a choropleth of a trace's own `geojson` turns at 60 fps up to about 25,000 vertices
  and slows down above that. Simplify large files, or put them on a scoped map, which only pans
  and zooms.
- **Scatter traces** project their points again on each frame of a rotation: 100,000 markers
  take 6 to 13 ms on the same machine. Long lines cost more and are not simplified.

These figures are from one fast laptop. Slower machines have not been measured, and on them a
turning world map may miss 60 fps even at 110m.

The [performance guide](/guides/performance) covers the rest of a chart.

## Offline use and CSP

By default a map makes **no network request** of its own: the base map and the country names
are chunks of your app's bundle, loaded from your own origin. Maps therefore work offline, and
under a Content Security Policy they need nothing beyond what any chart needs
(`script-src 'self'` covers the chunks). See the [CSP guide](/guides/csp#maps).

Two attributes fetch from a URL you give, and each needs its origin in `connect-src`:

- `config.topojsonURL`: the base map is fetched from there instead of the bundle;
- a trace's `geojson` given as a URL instead of an object.

## Data, attribution and boundaries

The base map is built from [Natural Earth](https://www.naturalearthdata.com) 5.1.2 vector data
at 1:110m and 1:50m: countries, land, lakes, rivers, and states and provinces. Natural Earth is
in the public domain and asks for no credit; Holochart credits it here and in the package's
`THIRD_PARTY_NOTICES.md`, and draws no attribution on the map. The table behind
`locationmode: 'country names'` is the one plotly.js uses, with its own notices in the same file.

**Boundaries are political.** Natural Earth draws disputed borders by de facto control: the
line shown is where each side administers, which is not what every government or reader accepts.
Kosovo is a country of the base map, under the user-assigned code `XKX`. If your audience or
your organization needs other boundaries, replace them:

- **The whole base map**: set `config.topojsonURL` to a folder you serve. The files are then
  fetched from it, in Plotly's layout and under Plotly's names, one per scope and resolution:
  `<url>/world_110m.json`, `<url>/europe_50m.json`, `<url>/north-america_110m.json`, …. Each is
  a TopoJSON topology with the objects `coastlines`, `land`, `ocean`, `lakes`, `rivers`,
  `countries` and `subunits`; countries are matched to `locations` by their `id`. Files made for
  plotly.js work as they are. This is also how to get finer data than 1:50m.

  ```ts
  import { createChart } from '@mk7s/holochart';
  import '@mk7s/holochart/geo';

  createChart(document.getElementById('chart')!, {
    data: [{ type: 'choropleth', locations: ['FRA', 'DEU'], z: [68, 84] }],
    config: { topojsonURL: '/maps/' },
  });
  ```

- **The regions of one trace**: give the trace its own `geojson` and match it with
  `featureidkey` ([choropleth](/charts/maps/choropleth#your-own-regions-from-geojson)). With
  `geo.visible: false` the base map is not drawn at all.

Default maps are not pixel-identical to Plotly's: plotly.js now fetches files that draw United
Nations boundaries, and Holochart ships Natural Earth.

## Plotly compatibility

`layout.geo` has every attribute of Plotly's, with the same names and defaults (those of
plotly.js 4.1.1, where `fitbounds` defaults to `'locations'`). The differences:

- **The package is not in the full bundle**: a figure needs
  [`import '@mk7s/holochart/geo'`](#adding-the-package).
- **No request by default.** `config.topojsonURL` is empty by default and the bundled data is
  used; Plotly defaults to its CDN.
- **Scopes** are picked out of one world file. A country polygon that straddles a scope's box
  stays whole; Plotly's scope files are cut at the box.
- **`dragmode: 'zoom'` moves the map**, as `'pan'` does. Plotly moves a map in `'pan'` mode
  only, and turns `'zoom'` into `'pan'` for figures that have nothing but maps.
- **`geo.uirevision`** is not read; `layout.uirevision` is.
- **`fullLayout.geo` is complete.** Where Plotly leaves an attribute out because the map cannot
  use it, the defaulted container has the value that draws the same map (a layer that cannot be
  shown is `false`, an Albers USA map has a rotation of zero).
- **The graticule** keeps its last meridian. Plotly drops the last meridian of every map (the
  duplicate at 180° on a world map with default ticks, but also 150° E on `scope: 'asia'` and
  60° E on `'europe'`); Holochart drops it only when it is a full turn after the first. A
  `dtick` that is not a positive number draws no lines.
- **`scope: 'usa'` with another projection** than Albers USA is drawn, turned to the middle of
  its range; Plotly throws.
- **Modebar buttons** for maps (zoom in, zoom out, reset) are not there yet. The
  [view keys](#keyboard) are Holochart's own.
- Tile maps (`layout.map`, `scattermap`, `choroplethmap`, `densitymap`) are not available.

The trace pages list what differs per trace:
[scattergeo](/charts/maps/scattergeo#plotly-migration-notes) and
[choropleth](/charts/maps/choropleth#plotly-migration-notes).
