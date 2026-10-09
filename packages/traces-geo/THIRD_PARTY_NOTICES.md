# Third-party notices

`@mk7s/holochart-traces-geo` is MIT-licensed (see [LICENSE](LICENSE)). Its runtime dependencies
are npm dependencies and ship their own license files:

| Package                                                                                              | License | Used for                                                    |
| ---------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------- |
| [d3-geo](https://github.com/d3/d3-geo), [d3-geo-projection](https://github.com/d3/d3-geo-projection) | ISC     | map projections, clipping, the graticule                    |
| [topojson-client](https://github.com/topojson/topojson-client)                                       | ISC     | decoding the basemap topologies                             |
| [d3-array](https://github.com/d3/d3-array), [internmap](https://github.com/mbostock/internmap)       | ISC     | dependencies of d3-geo                                      |
| [commander](https://github.com/tj/commander.js)                                                      | MIT     | the command-line tools of two packages above; never bundled |

The license files of d3-geo and d3-geo-projection also carry the MIT notices of the code they
include from GeographicLib (Charles Karney) and integrate-adaptive-simpson (Ricky Reusser).

This package also contains data and code taken from other projects, in its sources (`src/`) and
in the `dist/` files built from them. The repository-wide list is the root
[THIRD_PARTY_NOTICES.md](https://github.com/holochart/holochart/blob/main/THIRD_PARTY_NOTICES.md).

## Natural Earth

Natural Earth (basemap data of `@mk7s/holochart-traces-geo`: countries, land, lakes, rivers, states
and provinces at 1:110m and 1:50m). Version 5.1.2, from
https://github.com/nvkelso/natural-earth-vector at tag v5.1.2, quantized and repackaged as TopoJSON
by `tools/geo-data`. Public domain (https://www.naturalearthdata.com/about/terms-of-use/). Disputed
boundaries are drawn by de facto control.

The data is in `src/basemap/generated/*.ts` and, built from them, `dist/base-110m.js`,
`dist/extras-110m.js`, `dist/base-50m.js` and `dist/extras-50m.js`.

## country-iso-search

The table of country names and codes behind `locationmode: 'country names'`
(`src/geo/country-names.ts`, built into `dist/country-names.js`) and its matching rules are those
of [country-iso-search](https://github.com/plotly/country-iso-search) 0.1.2, which plotly.js uses
for the same purpose, with the records plotly.js adds for six disputed territories
(`src/lib/custom_country_codes.ts`) and one of Holochart's own (Kosovo). country-iso-search is
distributed under the MIT License, Copyright (c) 2026 Plotly Technologies Inc. Its NOTICE file,
which covers the sources of its aliases (GeoNames, CC BY 4.0; Unicode CLDR, Unicode License V3;
Wikidata, CC0 1.0):

```
country-iso-search
Copyright (c) 2026 Plotly Technologies Inc.

This product includes data derived from the following third-party sources.
Their licenses appear below; the country-iso-search package itself is
distributed under the MIT License (see LICENSE).

================================================================================
GeoNames Geographical Database
https://www.geonames.org/
================================================================================

This product includes data from the GeoNames Geographical Database, used
as a candidate pool when curating the country-name aliases in
src/index.ts. The GeoNames database is licensed under the Creative Commons
Attribution 4.0 International License.

  https://creativecommons.org/licenses/by/4.0/

================================================================================
Unicode Common Locale Data Repository (CLDR)
https://cldr.unicode.org/
================================================================================

This product includes data from the Unicode Common Locale Data Repository
(CLDR), used as a candidate pool when curating the country-name aliases in
src/index.ts. CLDR data is licensed under the Unicode License V3:

  UNICODE LICENSE V3

  COPYRIGHT AND PERMISSION NOTICE

  Copyright © 1991-2026 Unicode, Inc.

  NOTICE TO USER: Carefully read the following legal agreement. BY
  DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
  SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
  TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
  DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

  Permission is hereby granted, free of charge, to any person obtaining a
  copy of data files and any associated documentation (the "Data Files") or
  software and any associated documentation (the "Software") to deal in the
  Data Files or Software without restriction, including without limitation
  the rights to use, copy, modify, merge, publish, distribute, and/or sell
  copies of the Data Files or Software, and to permit persons to whom the
  Data Files or Software are furnished to do so, provided that either (a)
  this copyright and permission notice appear with all copies of the Data
  Files or Software, or (b) this copyright and permission notice appear in
  associated Documentation.

  THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
  KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
  THIRD PARTY RIGHTS.

  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
  BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
  OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
  WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
  ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
  FILES OR SOFTWARE.

  Except as contained in this notice, the name of a copyright holder shall
  not be used in advertising or otherwise to promote the sale, use or other
  dealings in these Data Files or Software without prior written
  authorization of the copyright holder.

================================================================================
Wikidata
https://www.wikidata.org/
================================================================================

This product includes data from Wikidata, used as a candidate pool when
curating the country-name aliases in src/index.ts. Wikidata structured data
is dedicated to the public domain under Creative Commons CC0 1.0 Universal;
attribution is not required, but is provided here as a courtesy.

  https://creativecommons.org/publicdomain/zero/1.0/
```

## Turf

The centroid of a GeoJSON feature (`featureCentroid` in `src/geo/locations.ts`) follows
[@turf/area](https://github.com/Turfjs/turf) and @turf/centroid 7 (MIT License, Copyright (c) 2017
TurfJS), as plotly.js computes it.

## plotly.js

Holochart implements the Plotly figure format. The attributes, defaults, projection settings,
scopes, view fitting, pan and zoom, hover and event data of the `geo` subplot and of `scattergeo`
follow [plotly.js](https://github.com/plotly/plotly.js) (`src/plots/geo`, `src/traces/scattergeo`,
`src/lib/geo_location_utils.js`, `src/lib/usa_location_names.js`),
and parts of them are ported from it. The bounding boxes of the scopes are those of plotly.js and
of [sane-topojson](https://github.com/etpinard/sane-topojson) (MIT), which builds Plotly's basemap
files. plotly.js is distributed under the MIT License:

```
MIT License

Copyright (c) 2016-2024 Plotly Technologies Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
