# @mk7s/holochart-geo-data

Builds the basemap data of `@mk7s/holochart-traces-geo` from Natural Earth
([ADR-024](../../docs/adr/024-geo-basemap-data.md)). Private; not published.

```sh
pnpm --filter @mk7s/holochart-geo-data build              # rebuild the data modules
pnpm --filter @mk7s/holochart-geo-data build --offline    # fail rather than download
pnpm --filter @mk7s/holochart-geo-data build --check      # exit 1 if the checked-in modules are stale
pnpm --filter @mk7s/holochart-geo-data build --measure    # sizes and displacement per candidate grid
```

The output is checked in (`packages/traces-geo/src/basemap/generated/`), so building or testing
the package needs neither this tool, the network nor the source files. Run the build after
changing anything here.

## Source

Natural Earth **5.1.2**, 1:110m and 1:50m, public domain
([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)). The files are the GeoJSON
of [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) at tag
**`v5.1.2`**, per resolution:

| Layer     | File                                             |
| --------- | ------------------------------------------------ |
| countries | `ne_<r>m_admin_0_countries.geojson`              |
| lakes     | `ne_<r>m_lakes.geojson`                          |
| rivers    | `ne_<r>m_rivers_lake_centerlines.geojson`        |
| subunits  | `ne_<r>m_admin_1_states_provinces_lakes.geojson` |

They are downloaded once into `.cache/v5.1.2/` (not committed) and every read checks the SHA-256
recorded in `src/sources.ts`. A file that does not match fails the build: a changed upstream file
is noticed, and so is a formatter that touched the cache.

To move to another Natural Earth release: change `NATURAL_EARTH_TAG` and `NATURAL_EARTH_VERSION`,
run the build (it fails on the first hash), review what changed upstream, record the new hashes,
run the build and the tests, and update `THIRD_PARTY_NOTICES.md`.

## Output

Four modules, each a TopoJSON topology as a JSON string (`JSON.parse` reads that about twice as
fast as the same data as an object literal):

| Module           | Objects                       | Min      | Gzip     |
| ---------------- | ----------------------------- | -------- | -------- |
| `base-110m.ts`   | `countries`, `land`           | 99.9 kB  | 31.3 kB  |
| `extras-110m.ts` | `lakes`, `rivers`, `subunits` | 28.3 kB  | 8.7 kB   |
| `base-50m.ts`    | `countries`, `land`           | 684.8 kB | 178.3 kB |
| `extras-50m.ts`  | `lakes`, `rivers`, `subunits` | 405.7 kB | 104.9 kB |

ADR-024's targets are about 40 kB (110m) and 235 kB (50m) with all layers: 40.0 kB and 283.2 kB
here. `src/outputs.test.ts` holds a ceiling for each module.

- **The base is a topology of its own.** `land` is the union of the countries, so it adds arc
  references only. Coastlines and borders are not stored: the loader takes them as meshes
  (`topojson.mesh`) of the arcs one polygon or two polygons use. The ocean is the sphere.
- **The extras are not.** Their objects also use arcs of the base (a state's coast is its
  country's coast), so an arc index below `base` (a member of the extras topology, the number of
  base arcs) refers to the base and the rest to the extras' own arcs, offset by `base`. Sharing
  them costs the base 0.6 kB at 110m and 10 kB at 50m (its arcs are cut where a state border
  meets the coast) and saves the extras 1 kB and 37 kB. `joinExtras` puts the two together.
- **Countries**: `id` is the ISO 3166-1 alpha-3 code; `properties` are `name`, `n` (ISO numeric
  code), `c` (continent code, see Scopes) and `ct` (label point).
- **Subunits**: `id` is the postal code (`CA`); `properties` are `name`, `gu` (the country's
  alpha-3 code; `WA` is a state of two countries) and `ct`.
- **Lakes and rivers**: one multipolygon or multiline per set of scope codes, in `properties.s`
  (`'na us'`).

## Decisions

**Ids.** `ISO_A3`; where Natural Earth has `-99` there, `ISO_A3_EH` if it is the feature's own
code (it equals `ADM0_A3`: France and Norway). Kosovo has no ISO code and gets `XKX`, the
user-assigned code the World Bank, the EU and Plotly's current files use (`ID_OVERRIDES`); it has
no numeric code. Features without an id, which `locations` cannot name:

| Feature                     | 110m | 50m | Why                                                           |
| --------------------------- | ---- | --- | ------------------------------------------------------------- |
| Northern Cyprus             | yes  | yes | no ISO code                                                   |
| Somaliland                  | yes  | yes | no ISO code                                                   |
| Siachen Glacier             |      | yes | no ISO code                                                   |
| Indian Ocean Territories    |      | yes | Christmas Island and Cocos Islands as one feature; EH = `AUS` |
| Ashmore and Cartier Islands |      | yes | part of Australia in ISO; EH = `AUS`                          |

**Names.** Natural Earth's `NAME`, or `ADMIN` where `NAME` is abbreviated for a map label
("Dem. Rep. Congo", "St-Martin").

**Label points.** Natural Earth's `LABEL_X`/`LABEL_Y` (countries) and `longitude`/`latitude`
(subunits) when they lie inside the feature as it is shipped. They are placed on the 1:10m
shapes, so for some small islands they do not; those get the point of the largest polygon that is
farthest from its outline. The build prints which (3 countries at 110m, 11 at 50m).

**Winding and the antimeridian.** Every ring is wound for `d3-geo` (outer rings enclose less than
a hemisphere), checked by spherical area before and after snapping. The cuts Natural Earth makes
along the antimeridian and at the south pole are stitched (`geoStitch`), so Russia, Fiji and
Antarctica are rings on the sphere and no mesh has a line down 180°. `geoStitch` joins two halves
only where their ends on the cut are equal, and at 1:50m Natural Earth's are not always: the two
halves of Taveuni (Fiji) end 0.0001° to 0.0002° apart, and the tip of Vanua Levu has a vertex at
179.9992°. So the cuts are made exact first (`alignAntimeridian` in `src/geometry.ts`): vertices
within 0.001° of ±180° go onto it, and latitudes on it within 0.001° of each other become one.

**Quantization.** One grid over the whole sphere per resolution: `n` steps across 360° of
longitude and `n` across 180° of latitude (`GRID` in `src/config.ts`). Measured on this data:

| Resolution | Grid    | Max move | Base gzip | Extras gzip | Lost                                                 |
| ---------- | ------- | -------- | --------- | ----------- | ---------------------------------------------------- |
| 110m       | **1e4** | 2.20 km  | 31.3 kB   | 8.7 kB      | 1 polygon                                            |
| 110m       | 2e4     | 1.10 km  | 34.3 kB   | 9.8 kB      | 1 polygon                                            |
| 110m       | 5e4     | 0.44 km  | 38.4 kB   | 11.1 kB     | 1 polygon                                            |
| 110m       | 1e5     | 0.22 km  | 41.4 kB   | 12.3 kB     | 1 polygon                                            |
| 50m        | 1e4     | 2.22 km  | 148.9 kB  | 86.7 kB     | Vatican, Tuvalu, Ashmore and Cartier Is.; 4 polygons |
| 50m        | **2e4** | 1.12 km  | 178.3 kB  | 104.9 kB    | 2 polygons                                           |
| 50m        | 5e4     | 0.44 km  | 218.2 kB  | 130.0 kB    | nothing                                              |
| 50m        | 1e5     | 0.22 km  | 251.2 kB  | 151.5 kB    | nothing                                              |

The polygon lost at 110m at every grid is a sliver of North Korea a millionth of a degree wide.

- 110m at 1e4: a 110m map shows the world or a continent at 0.1° per px or more; the grid is a
  third of that and the source is generalized to tens of km.
- 50m at 2e4: compared by eye against the source in Mercator views 10° and 3° wide (the Low
  Countries, the Aegean, the Cyclades). At 10° no grid can be told from the source. At 3°, where a 50m island is six vertices, 1e4
  bends small islands onto the grid (edges turn horizontal and vertical) and 2e4 keeps their
  shapes; 5e4 matches the source. 1e4 also loses three whole features. 2e4 costs 48 kB over
  1e4 and is 48 kB over the ADR's target, which was measured on a 1e4 file; 1e4 would meet it at
  235.6 kB if the three features were kept some other way.

Geometry is not simplified otherwise: vertices that fall on one grid point become one, and a ring
that collapses to a point or a line is dropped.

**Subunits.** The `_lakes` variant (the Great Lakes cut out of the states), as in Plotly's files.
At 110m Natural Earth has the US states only. At 50m it has nine countries; the four Plotly ships
are kept (`SUBUNIT_COUNTRIES`: Australia, Brazil, Canada, United States), which are also the four
whose subdivisions all have a postal code.

**Scopes.** Plotly ships a file per `scope`, built by
[sane-topojson](https://github.com/etpinard/sane-topojson): the countries of a continent
(Natural Earth's `CONTINENT`) or the United States, clipped to a bounding box, with land, lakes,
rivers and subunits clipped to those countries. Here one world topology serves every scope and
the loader picks the scope out (`packages/traces-geo/src/basemap/scopes.ts`):

- Each country carries its continent as `c`: `af`, `an`, `as`, `eu`, `na`, `oc`, `sa`. Countries
  of "Seven seas (open ocean)" carry none and show in `world` only. `usa` is the country `USA`.
- `land` of a scope is merged from its countries at run time (`topojson.mergeArcs`; decoding a
  scope's base layers takes 3 to 9 ms at 50m). Land objects per scope would add about what
  `land` itself costs again (0.4 kB at 110m, 2 kB at 50m) to save part of that.
- Lakes and rivers carry the codes of the scopes they lie in, `us` for the United States. Rivers
  are cut where they cross from one set of codes to another, as Plotly's are clipped; lakes are
  kept whole, so the Great Lakes are complete in `usa`, where Plotly has their US halves.
- The loader keeps the polygons that reach into the scope's bounding box and drops the others
  whole (French Guiana from France in `europe`). Plotly cuts at the box instead.
