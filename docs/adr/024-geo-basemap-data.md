# ADR-024: Basemap data is built from Natural Earth and ships in the geo package

- **Status:** Proposed
- **Date:** 2026-10-03
- **Deciders:** GEO1; the owner accepts or rejects
- **Related stories:** backlog GEO1, GEO2, GEO4, GEO10; plan E15.1; risk R9

## Context

A `geo` subplot draws a basemap under the traces: land, ocean, lakes, rivers, countries, subunits
(US states and the like) and coastlines, at `resolution: 110` or `50`. `choropleth` and
`scattergeo` also join `locations` to those features by ISO-3 code, country name or US state.

Plotly fetches this data at run time from `https://cdn.plot.ly/` unless `config.topojsonURL` says
otherwise. That fails offline and under a strict `connect-src`, tells a third party which pages
draw maps, and makes a chart depend on a host we do not run. The epic's "done" list says the
opposite: a world or US-state map works offline, and no request leaves the page unless the user
gives a URL.

What the data costs was unmeasured. GEO1 measured it
([bundle-size.md, "Geo candidates"](../release/bundle-size.md#geo-candidates-measured-for-geo1-2026-10-03)),
min + gzip:

| Data                                                   | 110m     | 50m      |
| ------------------------------------------------------ | -------- | -------- |
| world-atlas `countries-*` (countries + land, 1e5 grid) | 38.4 kB  | 230.1 kB |
| the same, requantized to a 1e4 grid (0.036°)           | 28.4 kB  | 136.3 kB |
| Plotly's older world file (seven layers, 1e4 grid)     | 40.5 kB  | 232.7 kB |
| of which lakes + rivers + subunits                     | ~11 kB   | ~116 kB  |
| Plotly's current `un/` world file (seven layers)       | 108.8 kB | 611.3 kB |

The code that reads it is small next to it: `topojson-client`'s `feature` and `mesh` are 1.2 kB.

Three more facts from the measurement shape the decision:

- `world-atlas` has no lakes, rivers or subunits, its country ids are ISO numeric (Plotly joins on
  ISO-3), a few features have no id at all, and it has no label points for `scattergeo`
  `locations`.
- One topology serves several layers. `countries` already holds what `land` needs, coastlines are
  the mesh of `land`, borders are the interior mesh of `countries`; a separate land file adds 169
  kB at 50m for nothing.
- Plotly's current files mix UN boundary data with Natural Earth and carry no license or
  attribution text. Their terms could not be read during GEO1, so they cannot be redistributed on
  what we know.

## Decision

We will **build the basemap ourselves from Natural Earth and ship it inside `traces-geo` as lazy
chunks**. By default a map makes no request outside the app's own bundle.

- **Source.** Natural Earth vector data at 1:110m and 1:50m (public domain). A script in the repo
  (`tools/geo-data`) turns the source files into TopoJSON; its output is checked in, so a build
  needs neither the network nor the source files. The script pins the Natural Earth version.
- **Layout.** One topology per resolution and scope, with Plotly's object names: `coastlines`,
  `land`, `ocean`, `lakes`, `rivers`, `countries`, `subunits`. Countries carry an ISO-3 id, the
  numeric id, a name and a label point; subunits carry their postal code and country. Because the
  layout is Plotly's, a file from `config.topojsonURL` and a bundled one are read by the same code.
- **Chunks.** Per resolution, a base chunk (countries, from which land, ocean, coastlines and
  borders derive) and an extras chunk (lakes, rivers, subunits), each loaded by a dynamic
  `import()` the first time a subplot needs it. `resolution: 110` is the default, as in Plotly,
  so the 50m chunks load only for figures that ask for them.
- **Decoding.** `topojson-client` (`feature`, `mesh`) is a dependency of `traces-geo`.
- **A user URL.** `config.topojsonURL` is supported with Plotly's meaning: when set, the files are
  fetched from there instead of the bundled chunks. That is the way to get 10m data, Plotly's own
  files or different boundaries. Nothing is fetched when it is unset.
- **Failure.** A chunk or URL that fails to load draws the chart without those layers and warns
  once; it never holds `ready` (backlog GEO2).
- **Budgets.** Each data chunk gets a row in the size ledger when it lands. The targets are the
  measured sizes: about 40 kB for 110m and 235 kB for 50m with all layers, less if GEO2 chooses a
  coarser grid.
- **Attribution.** Natural Earth asks for no credit. We credit it in `THIRD_PARTY_NOTICES.md` and
  on the geo docs page, and draw no attribution control on a `geo` subplot. Tile maps are
  different and always show one ([ADR-027](027-map-renderer-integration.md)).
- **Boundaries.** Natural Earth draws disputed borders by de facto control. The docs say so and
  show the two ways to draw other boundaries: `topojsonURL` for the basemap, `geojson` on the
  trace.

## Consequences

### Positive

- Maps work offline and under `connect-src 'self'`; nothing about a page's charts reaches a third
  party.
- A page that draws no map downloads no basemap, and a page that draws a 110m world downloads
  about 40 kB of it.
- One data layout for bundled and fetched files, and Plotly figures that set `topojsonURL` keep
  working.
- The ids, names and label points that `locations` joins need are ours to fix.

### Negative

- We own a data pipeline and its updates, and we answer for the boundaries we ship.
- The npm package grows by the unpacked data (about 0.15 MB for 110m and 1.1 MB for 50m, before
  the scope files).
- The script-tag build cannot load an ESM chunk. Its geo add-on has to inline the 110m world and
  fetch the rest from beside the script ([ADR-026](026-geo-packages-and-bundles.md)).
- Default maps will not match Plotly's pixel for pixel: Plotly now draws UN boundaries.

### Follow-ups

- GEO2: write `tools/geo-data`; choose the quantization per resolution by eye at the largest zoom
  a resolution is used for (a 1e4 grid saves 40 % at 50m and is what Plotly's older files use);
  decide whether Plotly's `scope` values get files of their own or are clipped from the world.
- GEO4: the country-name table for `locationmode: 'country names'` is data in the geo package.
- GEO10: the notices, the boundary note, and a CSP line for `topojsonURL` (`connect-src`).
- Read the UN geodata terms before anyone proposes shipping Plotly's current files.

## Alternatives considered

### Fetch from Plotly's CDN by default, as Plotly does

No data in our package and maps identical to Plotly's. Rejected: it breaks offline use and strict
CSPs, which the epic requires, and makes every map depend on a host we do not run and a file set
that Plotly has already replaced once (the `un/` files).

### Depend on `world-atlas`

Maintained, ISC, already TopoJSON. Rejected as the shipped data: no lakes, rivers or subunits,
numeric ids only, no label points, and a finer grid than a 110m or 50m map can show, which costs
40 % more at 50m. It remains what the GEO1 spikes used.

### Copy Plotly's files

The older set (from `sane-topojson`, MIT, Natural Earth) has the right layers and ids and is the
size we expect ours to be. Rejected as a copy because it is frozen and its build is not ours to
rerun; its recipe is the model for `tools/geo-data`. The current `un/` set is rejected until its
terms are known, and it is 2.7 times larger.

### Ship 10m as well

Rejected: `world-atlas`'s `countries-10m` is 3.7 MB, 920 kB gzipped. It is what `topojsonURL` is
for.

### One chunk per layer

Would let `showrivers: false` skip the rivers. Rejected for the layers that share arcs (land,
ocean, coastlines and countries would each repeat the coastline); kept for the layers that do not,
which is the extras chunk.

## References

- `backlog.md`, "Before 1.0, epic: geographic charts", decision 1
- [bundle-size.md, "Geo candidates, measured for GEO1"](../release/bundle-size.md#geo-candidates-measured-for-geo1-2026-10-03)
  and `docs/spikes/scripts/geo-sizes.mjs`
- [ADR-006](006-d3-micro-libraries.md), [ADR-026](026-geo-packages-and-bundles.md)
- Natural Earth terms of use: <https://www.naturalearthdata.com/about/terms-of-use/>
- plotly.js `config.topojsonURL`, `src/plots/geo/constants.js`
