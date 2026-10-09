# ADR-026: Geo ships as two add-on packages outside the full bundle

- **Status:** Proposed
- **Date:** 2026-10-03
- **Deciders:** GEO1; the owner accepts or rejects
- **Related stories:** backlog GEO1, GEO2, GEO7, GEO9; plan E15, E21; risk R9

## Context

Every chart family so far is in `@mk7s/holochart`, the full bundle, with its heavy code in lazy
chunks. The full ESM bundle is at 538.10 kB of a 540 kB budget, and the budget policy gives it a
hard ceiling of 560 kB that only an ADR can move
([bundle-size.md, "Budget policy"](../release/bundle-size.md#budget-policy)).

GEO1 measured what maps bring, min + gzip
([bundle-size.md, "Geo candidates"](../release/bundle-size.md#geo-candidates-measured-for-geo1-2026-10-03)):

| What                                                                       | Gzip          |
| -------------------------------------------------------------------------- | ------------- |
| `d3-geo` (five first projections, graticule, measures) + `topojson-client` | 11.7 kB       |
| the same with all 15 Plotly projections `d3-geo` has                       | 12.5 kB       |
| the same with all 82 Plotly projections (`d3-geo-projection` for 67)       | 25.0 kB       |
| one projection alone (the clip, resample and rotate machinery)             | 6.5 kB        |
| basemap data, 110m / 50m ([ADR-024](024-geo-basemap-data.md))              | ~40 / ~235 kB |
| `maplibre-gl` 6.11.2 as shipped (main, shared and worker files)            | 302.5 kB      |
| `maplibre-gl.css`                                                          | 10.5 kB       |

None of the geo code is shared with what Holochart ships today (it imports no `d3-array`), so
these are the marginal costs. They are dependencies only: the subplot, two traces, their schemas,
hover and the globe come on top. `maplibre-gl` does not tree-shake: importing `Map` alone saves
4 %.

The dependencies alone are six times the full bundle's headroom and more than half of what is
left under the ceiling. Schemas and registration cannot be lazy, so even a geo family whose every
heavy part is a lazy chunk would raise the initial size of every app that uses the full bundle,
whether or not it draws a map.

## Decision

We will ship geographic charts as **two packages that the full bundle does not import**.

- **`@mk7s/holochart-traces-geo`**: the `geo` subplot, `scattergeo`, `choropleth` and the globe.
  Its dependencies are `d3-geo`, `d3-geo-projection`, `topojson-client` and the workspace
  packages; three stays a peer. It holds the basemap chunks of ADR-024.
- **`@mk7s/holochart-traces-map`**: `layout.map`, `scattermap`, `choroplethmap` and `densitymap`,
  with `maplibre-gl` as an optional peer dependency ([ADR-027](027-map-renderer-integration.md)).
  It depends on `traces-geo` for what the two share (location joins, GeoJSON handling).
- **`@mk7s/holochart` does not register either.** Its main entry stays as it is and its size does
  not change. It gains a `./geo` subpath that registers `traces-geo` into the shared registry, so
  an app using the full bundle writes one more import:

  ```ts
  import * as Holochart from '@mk7s/holochart';
  import '@mk7s/holochart/geo';
  ```

  Apps on partial bundles register `tracesGeo` from the package, as with any trace package.
  `traces-map` has no subpath in the full bundle; it is always imported by name.

- **A figure that needs them says so.** `scattergeo`, `choropleth`, `layout.geo`, the `*map`
  traces and `layout.map` on a chart without the package registered fail validation with a message
  naming the import, not with "unknown trace type".
- **Inside `traces-geo`, by first use:** the 15 projections `d3-geo` has are in the package's
  own code (ten more than the first five cost 0.8 kB). The 67 that need `d3-geo-projection` are
  one lazy chunk (12.4 kB), loaded when `projection.type` names one of them. The globe's meshes
  and the basemap data are lazy chunks too.
- **Script-tag build:** a third script, `holochart-geo.iife.min.js`, loaded after
  `holochart.iife.min.js` like the 3D add-on (ADR-015). It inlines the lazy code and the 110m
  basemap; it fetches the 50m and extras files from beside the script, or from `topojsonURL`. The
  globe needs the 3D add-on as well. There is no script-tag build of `traces-map`.
- **Budgets:** each new entry starts with a ledger line (`from: 'new'`): `traces-geo` initial,
  its projection chunk, its data chunks, the geo add-on script, and `traces-map` without MapLibre.
  The full ESM row and its ceiling are unchanged, and a test asserts that the full bundle contains
  no module of either package.

## Consequences

### Positive

- An app that draws no map pays nothing, which is one of the epic's "done" conditions.
- The 560 kB ceiling stands without an exception.
- Geo can grow (more projections, the globe, extruded regions) against budgets of its own.
- MapLibre's 300 kB and its worker never reach users of the projected maps.

### Negative

- "The full bundle" no longer means every chart type. A Plotly figure with a map does not render
  through `newPlot` until the page adds an import or a script; the error message and the migration
  guide have to carry that.
- Two more packages in the fixed version group, each with API reports, a README and budgets.
- `d3-geo-projection` and `topojson-client` list `commander` as a runtime dependency for their
  command-line tools, so it is installed with `traces-geo`. It is never bundled.
- The geo add-on script cannot be fully offline for 50m unless the page hosts the data files next
  to it.

### Follow-ups

- GEO2: create the package with its budgets and the no-geo-in-full test; the validation message.
- GEO7: decide where `hx.scatterGeo`, `hx.lineGeo` and `hx.choropleth` live. Express is in the
  full bundle, so they belong in `traces-geo` (or a `./geo` entry of express) unless they cost
  next to nothing there. The typed figures can include the geo traces at no runtime cost.
- GEO9: `traces-map`'s packaging details follow ADR-027.
- GEO10: `from-plotly.md` and `plotly-compat.md` describe the extra import.

## Alternatives considered

### Geo in the full bundle with lazy chunks, like 3D

One import for everything, and Plotly figures with maps render unchanged. Rejected: the schemas,
defaults and registration of a subplot type and two traces are initial code, the headroom is 1.9
kB, and the ceiling exists so that a new family does not arrive by raising it. If the full bundle
later sheds weight, moving `traces-geo` in is an additive change.

### Raise the ceiling

Needs this ADR to argue that every user of the full bundle should pay for maps. The measurements
argue the other way: the fixed cost of one projection is 6.5 kB before any Holochart code.

### One package for projected and tile maps

Rejected: MapLibre is 300 kB and brings a worker, CSS and CSP requirements that a `scattergeo`
user has no reason to meet.

### `d3-geo-projection`'s projections in the initial code

Simpler, and 12.4 kB more for every map. Rejected: most figures use the projections `d3-geo` has.
The classic nine alone (Robinson, Winkel tripel, Mollweide and so on) are 1.7 kB and could move
into the initial code if the lazy load proves awkward.

## References

- `backlog.md`, "Before 1.0, epic: geographic charts", decision 3
- [bundle-size.md](../release/bundle-size.md), "Budget policy" and "Geo candidates, measured for
  GEO1"; `tests/bundle/size/policy.ts`
- [ADR-006](006-d3-micro-libraries.md), [ADR-015](015-tsup-js-tsc-declarations.md),
  [ADR-019](019-runtime-package.md), [ADR-024](024-geo-basemap-data.md)
