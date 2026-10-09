# @mk7s/holochart-traces-geo

Maps for Holochart: the `geo` subplot (`layout.geo`: map projections, a basemap of land,
coastlines, countries, lakes and rivers, pan and zoom) and the `scattergeo` trace. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases.

> **Not in the full bundle.** `@mk7s/holochart` registers every other trace package, but not this
> one, so that apps without a map do not download map code. Add it with one import (below).

## Install

With the full bundle there is nothing more to install: `@mk7s/holochart` depends on this package
and registers it from its `geo` entry.

```sh
pnpm add @mk7s/holochart@alpha three
```

For a partial bundle, install it next to the runtime:

```sh
pnpm add @mk7s/holochart-runtime@alpha @mk7s/holochart-traces-geo@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## Usage

With the full bundle, import `@mk7s/holochart/geo` once, after `@mk7s/holochart`. It registers
this package and re-exports it:

```ts
import { newPlot } from '@mk7s/holochart';
import '@mk7s/holochart/geo';

newPlot(el, [{ type: 'scattergeo', lon: [-0.13, 2.35, 13.4], lat: [51.51, 48.86, 52.52] }], {
  geo: { projection: { type: 'natural earth' }, showland: true, showcountries: true },
});
```

With the runtime, register the package yourself:

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { tracesGeo } from '@mk7s/holochart-traces-geo';

register(...tracesGeo, ...builtinComponents);

createChart(el, {
  data: [{ type: 'scattergeo', lon: [-0.13, 2.35, 13.4], lat: [51.51, 48.86, 52.52] }],
  layout: { geo: { projection: { type: 'natural earth' }, showland: true } },
});
```

A figure with a `scattergeo` or `choropleth` trace on a chart without this package is not drawn,
and the warning names the import that is missing.

## What it exports

- **`tracesGeo`:** the `geo` subplot and every trace module below, to register at once
- **Trace modules:** `scattergeo`, `choropleth`
- **The subplot** (experimental): `geoComponent`, `geoAttributes`, `GeoSubplot`, `GeoView`,
  `loadBasemap`

`scattergeo` takes its points from `lon` and `lat`, or from `locations`. `choropleth` colors the
regions that `locations` name. `locationmode` says how locations are read: `'ISO-3'` country codes
(the default), `'USA-states'`, `'country names'`, or `'geojson-id'` for the features of your own
`geojson`, matched through `featureidkey`. A location that matches nothing is skipped, and one
warning names the ones that were.

## Projections

`geo.projection.type` takes Plotly's names. The 15 projections of
[d3-geo](https://github.com/d3/d3-geo) (`equirectangular`, `mercator`, `orthographic`,
`natural earth`, `albers usa`, …) are part of the package's own code. The others come from
[d3-geo-projection](https://github.com/d3/d3-geo-projection) in one lazy chunk, loaded the first
time a figure names one of them.

## 3D globe

`geo.projection.type: 'globe3d'` is Holochart's own: the orthographic view drawn as a lit sphere,
with the same rotation, scale, gestures and relayout keys. It turns by a matrix, so a rotation
projects nothing. On it, `scattergeo` lines are arcs lifted above the surface (`line.lift`) and a
`choropleth` can raise its regions as prisms by a second value (`elevation`, `elevationscale`).
Its code is a lazy chunk, loaded when a figure has a globe.

## Basemap data

The basemap is [Natural Earth](https://www.naturalearthdata.com) 5.1.2 (public domain) at 1:110m
and 1:50m (`geo.resolution`), built into the package: countries, land, lakes, rivers, and states
and provinces. Each resolution is two lazy chunks, loaded the first time a map needs them, so a
map makes no request outside your app's own bundle and works offline. Disputed boundaries are
drawn by de facto control.

To draw other boundaries or finer data, set `config.topojsonURL`: the basemap files are then
fetched from that URL instead, in Plotly's layout and under Plotly's names
(`<url>/world_110m.json`, …). Nothing is fetched when it is unset.

## License

MIT (see [LICENSE](LICENSE)). Third-party code and data are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
