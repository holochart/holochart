# Third-party notices

`@mk7s/holochart-core` is MIT-licensed (see [LICENSE](LICENSE)). Its runtime dependencies
(`d3-array`, `d3-color`, `d3-format`, `d3-time`, `d3-time-format` and `internmap`, all ISC) are
npm dependencies and ship their own license files.

This package also contains data and code taken from other projects, in its sources (`src/`) and
in the `dist/` files built from them. The repository-wide list is the root
[THIRD_PARTY_NOTICES.md](https://github.com/holochart/holochart/blob/main/THIRD_PARTY_NOTICES.md).

## plotly.js and plotly.py

Holochart implements the Plotly figure format. Core's attribute schema, defaults and validation
follow [plotly.js](https://github.com/plotly/plotly.js), and its named color sequences and
colorscales (`src/colors/data/*.ts`) are taken from [plotly.py](https://github.com/plotly/plotly.py)'s
`plotly.colors` (plotly.py 5.18). Both are distributed under the MIT License:

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

## Color data

plotly.py collects its color lists from the sources below; core keeps their names.

| Colors                                                                         | Source and author                                                                                                           | License                                                       | File (`src/colors/data/`)          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Blues, RdBu, …; Set1–Set3, Pastel1, Pastel2, Dark2, Accent, Paired             | [ColorBrewer](https://colorbrewer2.org) by Cynthia Brewer, Mark Harrower and The Pennsylvania State University              | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)     | `colorbrewer.ts`, `qualitative.ts` |
| Burg, Sunset, Temps, …; Antique, Bold, Pastel, Prism, Safe, Vivid              | [CARTOColors](https://github.com/CartoDB/CartoColor) by CARTO                                                               | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)     | `carto.ts`, `qualitative.ts`       |
| thermal, haline, solar, …                                                      | [cmocean](https://matplotlib.org/cmocean/) by Kristen Thyng et al.                                                          | MIT                                                           | `cmocean.ts`                       |
| Viridis, Cividis, Inferno, Magma, Plasma, Twilight                             | [matplotlib](https://matplotlib.org) colormaps (Twilight by Bastian Bechtold)                                               | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `sequential.ts`, `cyclical.ts`     |
| Turbo                                                                          | [Turbo](https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/) by Google LLC (Anton Mikhailov) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)     | `sequential.ts`                    |
| IceFire                                                                        | [seaborn](https://github.com/mwaskom/seaborn) by Michael L. Waskom                                                          | BSD-3-Clause (below)                                          | `cyclical.ts`                      |
| Plotly, D3, G10, T10, Alphabet, Dark24, Light24, and the plotly.js colorscales | plotly.py (above), from Plotly, d3 category10, Google Charts, Tableau 10 and Paul Green-Armytage's alphabet                 | MIT (plotly.py)                                               | `qualitative.ts`, `sequential.ts`  |

The seaborn license:

```
Copyright (c) 2012-2023, Michael L. Waskom
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the project nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
