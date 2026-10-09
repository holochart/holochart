---
title: Colorscales & palettes
description: Every built-in colorscale and qualitative palette with a swatch, generated from the color registries, and how to use a name.
status: complete
---

# Colorscales & palettes

Every colorscale and palette name that Holochart knows, drawn from its stops. The lists on this
page are generated from the library's color registries. How colors, colorscales and colorbars
work is in [Colors, colorscales & colorbars](/fundamentals/colors-colorscales).

<!-- generated:colors-summary:start -->

Holochart has **94** named colorscales (65 sequential, 22 diverging, 7 cyclical) and **21** qualitative palettes.

<!-- generated:colors-summary:end -->

## Using a name

A colorscale name goes in a `colorscale` attribute, and a palette name in `layout.colorway`:

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x: [1, 2, 3, 4],
      y: [3, 1, 4, 2],
      marker: { color: [12.5, 17.1, 21.8, 26.4], colorscale: 'Viridis', showscale: true },
    },
  ],
  layout: { colorway: 'Bold' },
});
```

- Names are not case-sensitive: `'viridis'` is `'Viridis'`.
- Add `_r` to a colorscale name to reverse it: `'Viridis_r'`. Setting `reversescale: true` next
  to the `colorscale` does the same. Palettes have no reversed names.
- A `colorscale` also takes its own stops, `[position, color]` pairs that start at 0 and end
  at 1: `[[0, 'navy'], [0.8, 'gold'], [1, 'white']]`.
- A colorscale name that doesn't resolve is not reported as an invalid value. With
  `marker.colorscale`, the trace is drawn with the automatic colorscale, as if `colorscale` were
  not set. A palette name that doesn't resolve is reported as an invalid `layout.colorway`, and
  the default colorway is used.

These attributes take a colorscale:

<!-- generated:colors-attributes:start -->

| Attribute                           | In                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fillgradient.colorscale`           | [`scatter`](/reference/scatter)                                                                                                                                                                                                                                                                                                                                                                              |
| `marker.colorscale`                 | [`scatter`](/reference/scatter), [`bar`](/reference/bar), [`histogram`](/reference/histogram), [`splom`](/reference/splom), [`scatterpolar`](/reference/scatterpolar), [`barpolar`](/reference/barpolar), [`funnel`](/reference/funnel), [`sunburst`](/reference/sunburst), [`treemap`](/reference/treemap), [`icicle`](/reference/icicle), [`scatter3d`](/reference/scatter3d), [`bar3d`](/reference/bar3d) |
| `marker.line.colorscale`            | [`scatter`](/reference/scatter), [`bar`](/reference/bar), [`histogram`](/reference/histogram), [`splom`](/reference/splom), [`scatterpolar`](/reference/scatterpolar), [`barpolar`](/reference/barpolar), [`funnel`](/reference/funnel), [`scatter3d`](/reference/scatter3d)                                                                                                                                 |
| `colorscale`                        | [`histogram2d`](/reference/histogram2d), [`histogram2dcontour`](/reference/histogram2dcontour), [`heatmap`](/reference/heatmap), [`contour`](/reference/contour), [`surface`](/reference/surface), [`mesh3d`](/reference/mesh3d), [`cone`](/reference/cone), [`streamtube`](/reference/streamtube), [`isosurface`](/reference/isosurface), [`volume`](/reference/volume)                                     |
| `line.colorscale`                   | [`parcoords`](/reference/parcoords), [`parcats`](/reference/parcats), [`scatter3d`](/reference/scatter3d)                                                                                                                                                                                                                                                                                                    |
| `link.colorscales[].colorscale`     | [`sankey`](/reference/sankey)                                                                                                                                                                                                                                                                                                                                                                                |
| `layout.colorscale.sequential`      | The layout                                                                                                                                                                                                                                                                                                                                                                                                   |
| `layout.colorscale.sequentialminus` | The layout                                                                                                                                                                                                                                                                                                                                                                                                   |
| `layout.colorscale.diverging`       | The layout                                                                                                                                                                                                                                                                                                                                                                                                   |
| `layout.coloraxis.colorscale`       | The layout                                                                                                                                                                                                                                                                                                                                                                                                   |

A palette name works in these layout attributes: `layout.colorway`, `layout.piecolorway`, `layout.funnelareacolorway`, `layout.sunburstcolorway`, `layout.treemapcolorway`, `layout.iciclecolorway`.

<!-- generated:colors-attributes:end -->

The palettes are also exported as arrays, so you can slice or reorder them:
`colorway: QUALITATIVE.Bold` is the same as `colorway: 'Bold'`.

## Your own names

`colors.register` adds a colorscale and `colorways.register` adds a palette. Register a name
before you plot a figure that uses it.

```ts
import { colors, colorways } from '@mk7s/holochart';

// A list of colors is spread evenly from 0 to 1.
colors.register('Brand', ['#0b1f3a', '#1d6fa5', '#9ad0ec']);
// Or give the stops.
const unregister = colors.register('Traffic', [
  [0, 'seagreen'],
  [0.6, 'gold'],
  [1, 'crimson'],
]);
colorways.register('Team', ['#ea2a37', '#5e74d5', '#118e36']);

createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      y: [1, 3, 2],
      marker: { color: [1, 3, 2], colorscale: 'Brand_r' },
    },
  ],
  layout: { colorway: 'Team' },
});

unregister(); // 'Traffic' no longer resolves
```

Both functions return a function that removes the name again. Registering a name that exists
replaces it, whatever its case. A registered scale gets its `_r` name for free, unless you
register a scale under that exact name.

`colors.get(name)` returns the stops of a scale and `colorways.get(name)` the colors of a
palette, or `undefined`. `colors.has(name)` tells whether a name resolves, `colors.names()` and
`colorways.names()` list the names, and `colors.reverse(stops)` mirrors a scale.

## Partial bundles

The full `@mk7s/holochart` bundle registers every name on this page when it loads. A
[partial bundle](/getting-started/installation#smaller-bundles-with-partial-packages) starts
with these:

<!-- generated:colors-bundles:start -->

- 19 colorscales: `Greys`, `YlGnBu`, `Greens`, `YlOrRd`, `Bluered`, `RdBu`, `Reds`, `Blues`, `Picnic`, `Rainbow`, `Portland`, `Jet`, `Hot`, `Blackbody`, `Earth`, `Electric`, `Viridis`, `Cividis`, `Plasma`
- 1 palette: `Safe`

<!-- generated:colors-bundles:end -->

Register the rest, or only the sets you use:

```ts
import { CMOCEAN_SEQUENTIAL, colors, registerBuiltinColors } from '@mk7s/holochart-core';

registerBuiltinColors(); // every colorscale and palette on this page

// Or one set, here cmocean's sequential scales:
colors.registerAll(CMOCEAN_SEQUENTIAL, { overwrite: false });
```

With `overwrite: false`, a name that already resolves keeps its meaning. That is how
`registerBuiltinColors` adds the sets, and why [some names](#names-with-two-definitions) don't
resolve to the list of the same name.

<!-- generated:colors-sets:start -->

The sets that add colorscale names are `SEQUENTIAL`, `COLORBREWER_SEQUENTIAL`, `COLORBREWER_DIVERGING`, `CMOCEAN_SEQUENTIAL`, `CMOCEAN_DIVERGING`, `CMOCEAN_CYCLICAL`, `CARTO_SEQUENTIAL`, `CARTO_DIVERGING`, `CYCLICAL`, and the palettes are in `QUALITATIVE`. All of them are exported by `@mk7s/holochart` too.

<!-- generated:colors-sets:end -->

## Reading the tables

**Source** is the set a colorscale comes from: `plotly.js` for plotly.js' own names and `Plasma`
(the ones every bundle has), `plotly` for plotly.py's own scales, and ColorBrewer, cmocean and
CARTO for the sets plotly.py takes from those projects. Each swatch is drawn from the scale's stops,
with colors between stops blended in sRGB, as charts draw them unless
[`layout.colorscaleInterpolation`](/fundamentals/colors-colorscales#interpolation-spaces) says
otherwise. Hover a color of a palette to read its value.

<!-- generated:colors-gallery:start -->

## Sequential colorscales

<table>
<thead><tr><th>Name</th><th>Source</th><th>Scale</th></tr></thead>
<tbody>
<tr><td><code>Greys</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Greys" style="background:linear-gradient(to right,#000000 0%,#ffffff 100%)"></span></td></tr>
<tr><td><code>YlGnBu</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="YlGnBu" style="background:linear-gradient(to right,#081d58 0%,#253494 12.5%,#225ea8 25%,#1d91c0 37.5%,#41b6c4 50%,#7fcdbb 62.5%,#c7e9b4 75%,#edf8d9 87.5%,#ffffd9 100%)"></span></td></tr>
<tr><td><code>Greens</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Greens" style="background:linear-gradient(to right,#00441b 0%,#006d2c 12.5%,#238b45 25%,#41ab5d 37.5%,#74c476 50%,#a1d99b 62.5%,#c7e9c0 75%,#e5f5e0 87.5%,#f7fcf5 100%)"></span></td></tr>
<tr><td><code>YlOrRd</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="YlOrRd" style="background:linear-gradient(to right,#800026 0%,#bd0026 12.5%,#e31a1c 25%,#fc4e2a 37.5%,#fd8d3c 50%,#feb24c 62.5%,#fed976 75%,#ffeda0 87.5%,#ffffcc 100%)"></span></td></tr>
<tr><td><code>Bluered</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Bluered" style="background:linear-gradient(to right,#0000ff 0%,#ff0000 100%)"></span></td></tr>
<tr><td><code>Reds</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Reds" style="background:linear-gradient(to right,#dcdcdc 0%,#f5c39d 20%,#f5a069 40%,#b20a18 100%)"></span></td></tr>
<tr><td><code>Blues</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Blues" style="background:linear-gradient(to right,#050aac 0%,#283cbe 35%,#4664f5 50%,#5a78f5 60%,#6a89f7 70%,#dcdcdc 100%)"></span></td></tr>
<tr><td><code>Rainbow</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Rainbow" style="background:linear-gradient(to right,#96005a 0%,#0000c8 12.5%,#0019ff 25%,#0098ff 37.5%,#2cff96 50%,#97ff00 62.5%,#ffea00 75%,#ff6f00 87.5%,#ff0000 100%)"></span></td></tr>
<tr><td><code>Jet</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Jet" style="background:linear-gradient(to right,#000083 0%,#003caa 12.5%,#05ffff 37.5%,#ffff00 62.5%,#fa0000 87.5%,#800000 100%)"></span></td></tr>
<tr><td><code>Hot</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Hot" style="background:linear-gradient(to right,#000000 0%,#e60000 30%,#ffd200 60%,#ffffff 100%)"></span></td></tr>
<tr><td><code>Blackbody</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Blackbody" style="background:linear-gradient(to right,#000000 0%,#e60000 20%,#e6d200 40%,#ffffff 70%,#a0c8ff 100%)"></span></td></tr>
<tr><td><code>Electric</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Electric" style="background:linear-gradient(to right,#000000 0%,#1e0064 15%,#780064 40%,#a05a00 60%,#e6c800 80%,#fffadc 100%)"></span></td></tr>
<tr><td><code>Viridis</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Viridis" style="background:linear-gradient(to right,#440154 0%,#48186a 6.25%,#472d7b 12.5%,#424086 18.75%,#3b528b 25%,#33638d 31.25%,#2c728e 37.5%,#26828e 43.75%,#21918c 50%,#1fa088 56.25%,#28ae80 62.5%,#3fbc73 68.75%,#5ec962 75%,#84d44b 81.25%,#addc30 87.5%,#d8e219 93.75%,#fde725 100%)"></span></td></tr>
<tr><td><code>Cividis</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Cividis" style="background:linear-gradient(to right,#00204c 0%,#002a66 5.88%,#00346e 11.76%,#273f6c 17.65%,#3c4a6b 23.53%,#4c556b 29.41%,#5b5f6d 35.29%,#686a70 41.18%,#757575 47.06%,#838178 52.94%,#928c78 58.82%,#a19876 64.71%,#b0a572 70.59%,#c0b16d 76.47%,#d1bf66 82.35%,#e1cc5c 88.24%,#f3db4f 94.12%,#ffe945 100%)"></span></td></tr>
<tr><td><code>Plasma</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Plasma" style="background:linear-gradient(to right,#0d0887 0%,#46039f 11.11%,#7201a8 22.22%,#9c179e 33.33%,#bd3786 44.44%,#d8576b 55.56%,#ed7953 66.67%,#fb9f3a 77.78%,#fdca26 88.89%,#f0f921 100%)"></span></td></tr>
<tr><td><code>Plotly3</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="Plotly3" style="background:linear-gradient(to right,#0508b8 0%,#1910d8 8.33%,#3c19f0 16.67%,#6b1cfb 25%,#981cfd 33.33%,#bf1cfd 41.67%,#dd2bfd 50%,#f246fe 58.33%,#fc67fd 66.67%,#fe88fc 75%,#fea5fd 83.33%,#febefe 91.67%,#fec3fe 100%)"></span></td></tr>
<tr><td><code>Inferno</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="Inferno" style="background:linear-gradient(to right,#000004 0%,#1b0c41 11.11%,#4a0c6b 22.22%,#781c6d 33.33%,#a52c60 44.44%,#cf4446 55.56%,#ed6925 66.67%,#fb9b06 77.78%,#f7d13d 88.89%,#fcffa4 100%)"></span></td></tr>
<tr><td><code>Magma</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="Magma" style="background:linear-gradient(to right,#000004 0%,#180f3d 11.11%,#440f76 22.22%,#721f81 33.33%,#9e2f7f 44.44%,#cd4071 55.56%,#f1605d 66.67%,#fd9668 77.78%,#feca8d 88.89%,#fcfdbf 100%)"></span></td></tr>
<tr><td><code>Turbo</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="Turbo" style="background:linear-gradient(to right,#30123b 0%,#4145ab 7.14%,#4675ed 14.29%,#39a2fc 21.43%,#1bcfd4 28.57%,#24eca6 35.71%,#61fc6c 42.86%,#a4fc3b 50%,#d1e834 57.14%,#f3c63a 64.29%,#fe9b2d 71.43%,#f36315 78.57%,#d93806 85.71%,#b11901 92.86%,#7a0402 100%)"></span></td></tr>
<tr><td><code>BuGn</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="BuGn" style="background:linear-gradient(to right,#f7fcfd 0%,#e5f5f9 12.5%,#ccece6 25%,#99d8c9 37.5%,#66c2a4 50%,#41ae76 62.5%,#238b45 75%,#006d2c 87.5%,#00441b 100%)"></span></td></tr>
<tr><td><code>BuPu</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="BuPu" style="background:linear-gradient(to right,#f7fcfd 0%,#e0ecf4 12.5%,#bfd3e6 25%,#9ebcda 37.5%,#8c96c6 50%,#8c6bb1 62.5%,#88419d 75%,#810f7c 87.5%,#4d004b 100%)"></span></td></tr>
<tr><td><code>GnBu</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="GnBu" style="background:linear-gradient(to right,#f7fcf0 0%,#e0f3db 12.5%,#ccebc5 25%,#a8ddb5 37.5%,#7bccc4 50%,#4eb3d3 62.5%,#2b8cbe 75%,#0868ac 87.5%,#084081 100%)"></span></td></tr>
<tr><td><code>OrRd</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="OrRd" style="background:linear-gradient(to right,#fff7ec 0%,#fee8c8 12.5%,#fdd49e 25%,#fdbb84 37.5%,#fc8d59 50%,#ef6548 62.5%,#d7301f 75%,#b30000 87.5%,#7f0000 100%)"></span></td></tr>
<tr><td><code>Oranges</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="Oranges" style="background:linear-gradient(to right,#fff5eb 0%,#fee6ce 12.5%,#fdd0a2 25%,#fdae6b 37.5%,#fd8d3c 50%,#f16913 62.5%,#d94801 75%,#a63603 87.5%,#7f2704 100%)"></span></td></tr>
<tr><td><code>PuBu</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="PuBu" style="background:linear-gradient(to right,#fff7fb 0%,#ece7f2 12.5%,#d0d1e6 25%,#a6bddb 37.5%,#74a9cf 50%,#3690c0 62.5%,#0570b0 75%,#045a8d 87.5%,#023858 100%)"></span></td></tr>
<tr><td><code>PuBuGn</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="PuBuGn" style="background:linear-gradient(to right,#fff7fb 0%,#ece2f0 12.5%,#d0d1e6 25%,#a6bddb 37.5%,#67a9cf 50%,#3690c0 62.5%,#02818a 75%,#016c59 87.5%,#014636 100%)"></span></td></tr>
<tr><td><code>PuRd</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="PuRd" style="background:linear-gradient(to right,#f7f4f9 0%,#e7e1ef 12.5%,#d4b9da 25%,#c994c7 37.5%,#df65b0 50%,#e7298a 62.5%,#ce1256 75%,#980043 87.5%,#67001f 100%)"></span></td></tr>
<tr><td><code>Purples</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="Purples" style="background:linear-gradient(to right,#fcfbfd 0%,#efedf5 12.5%,#dadaeb 25%,#bcbddc 37.5%,#9e9ac8 50%,#807dba 62.5%,#6a51a3 75%,#54278f 87.5%,#3f007d 100%)"></span></td></tr>
<tr><td><code>RdPu</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="RdPu" style="background:linear-gradient(to right,#fff7f3 0%,#fde0dd 12.5%,#fcc5c0 25%,#fa9fb5 37.5%,#f768a1 50%,#dd3497 62.5%,#ae017e 75%,#7a0177 87.5%,#49006a 100%)"></span></td></tr>
<tr><td><code>YlGn</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="YlGn" style="background:linear-gradient(to right,#ffffe5 0%,#f7fcb9 12.5%,#d9f0a3 25%,#addd8e 37.5%,#78c679 50%,#41ab5d 62.5%,#238443 75%,#006837 87.5%,#004529 100%)"></span></td></tr>
<tr><td><code>YlOrBr</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="YlOrBr" style="background:linear-gradient(to right,#ffffe5 0%,#fff7bc 12.5%,#fee391 25%,#fec44f 37.5%,#fe9929 50%,#ec7014 62.5%,#cc4c02 75%,#993404 87.5%,#662506 100%)"></span></td></tr>
<tr><td><code>turbid</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="turbid" style="background:linear-gradient(to right,#e8f5ab 0%,#dcdb89 9.09%,#d1c16b 18.18%,#c7a853 27.27%,#ba8f42 36.36%,#aa793c 45.45%,#97673a 54.55%,#815738 63.64%,#684835 72.73%,#503b2e 81.82%,#392d25 90.91%,#221e1b 100%)"></span></td></tr>
<tr><td><code>thermal</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="thermal" style="background:linear-gradient(to right,#032333 0%,#0d3064 9.09%,#35329b 18.18%,#5d3e99 27.27%,#7e4d8f 36.36%,#9e5987 45.45%,#c16479 54.55%,#e17161 63.64%,#f68b45 72.73%,#fbad3c 81.82%,#f6d346 90.91%,#e7fa5a 100%)"></span></td></tr>
<tr><td><code>haline</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="haline" style="background:linear-gradient(to right,#29186b 0%,#2a23a0 9.09%,#0f4799 18.18%,#125f8e 27.27%,#267489 36.36%,#358888 45.45%,#419d85 54.55%,#51b27c 63.64%,#6fc66b 72.73%,#a0d65b 81.82%,#d4e170 90.91%,#fdee99 100%)"></span></td></tr>
<tr><td><code>solar</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="solar" style="background:linear-gradient(to right,#331317 0%,#4f1c21 9.09%,#6c2424 18.18%,#872f20 27.27%,#9d4219 36.36%,#ae5814 45.45%,#bc6f13 54.55%,#c78916 63.64%,#d1a420 72.73%,#d9c02c 81.82%,#dede3b 90.91%,#e0fd4a 100%)"></span></td></tr>
<tr><td><code>ice</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="ice" style="background:linear-gradient(to right,#030512 0%,#191933 9.09%,#2c2a57 18.18%,#3a3c7d 27.27%,#3e53a0 36.36%,#3e6db2 45.45%,#4886bb 54.55%,#599fc4 63.64%,#72b8cd 72.73%,#95cfd8 81.82%,#c0e5e8 90.91%,#eafcfd 100%)"></span></td></tr>
<tr><td><code>gray</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="gray" style="background:linear-gradient(to right,#000000 0%,#101010 9.09%,#262626 18.18%,#3b3b3b 27.27%,#515050 36.36%,#666565 45.45%,#7c7b7a 54.55%,#929291 63.64%,#ababaa 72.73%,#c5c5c3 81.82%,#e0e0df 90.91%,#fefefd 100%)"></span></td></tr>
<tr><td><code>deep</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="deep" style="background:linear-gradient(to right,#fdfdcc 0%,#ceecb3 9.09%,#9cdba5 18.18%,#6fc9a3 27.27%,#56b1a3 36.36%,#4c99a0 45.45%,#44829b 54.55%,#3e6c96 63.64%,#3e528f 72.73%,#403c73 81.82%,#362b4d 90.91%,#271a2c 100%)"></span></td></tr>
<tr><td><code>dense</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="dense" style="background:linear-gradient(to right,#e6f0f0 0%,#bfdde5 9.09%,#9cc9e2 18.18%,#81b4e3 27.27%,#739ae4 36.36%,#757fdd 45.45%,#7864ca 54.55%,#774aaf 63.64%,#71328d 72.73%,#641f68 81.82%,#501442 90.91%,#360e24 100%)"></span></td></tr>
<tr><td><code>algae</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="algae" style="background:linear-gradient(to right,#d6f9cf 0%,#bae4ae 9.09%,#9cd18f 18.18%,#7cbf73 27.27%,#55ae5b 36.36%,#259d51 45.45%,#078a4e 54.55%,#0d7547 63.64%,#175f3d 72.73%,#194b31 81.82%,#173723 90.91%,#112414 100%)"></span></td></tr>
<tr><td><code>matter</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="matter" style="background:linear-gradient(to right,#fdedb0 0%,#facd91 9.09%,#f6ad77 18.18%,#f08e62 27.27%,#e76d54 36.36%,#d85053 45.45%,#c3385a 54.55%,#a82860 63.64%,#8a1d63 72.73%,#6b185d 81.82%,#4c1550 90.91%,#2f0f3d 100%)"></span></td></tr>
<tr><td><code>speed</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="speed" style="background:linear-gradient(to right,#fefccd 0%,#efe19c 9.09%,#ddc96a 18.18%,#c2b63b 27.27%,#9da715 36.36%,#749905 45.45%,#4b8a14 54.55%,#237924 63.64%,#0b642c 72.73%,#124e2b 81.82%,#193822 90.91%,#172312 100%)"></span></td></tr>
<tr><td><code>amp</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="amp" style="background:linear-gradient(to right,#f1ecec 0%,#e6d1cb 9.09%,#ddb6aa 18.18%,#d59c89 27.27%,#cd8167 36.36%,#c46649 45.45%,#ba4a2f 54.55%,#ac2c24 63.64%,#951327 72.73%,#780e28 81.82%,#590d1f 90.91%,#3c0911 100%)"></span></td></tr>
<tr><td><code>tempo</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="tempo" style="background:linear-gradient(to right,#fef5f4 0%,#dee0d2 9.09%,#bdceb5 18.18%,#99bd9c 27.27%,#6ead8a 36.36%,#419d81 45.45%,#19897d 54.55%,#127475 63.64%,#195e6a 72.73%,#1c485d 81.82%,#193350 90.91%,#141d43 100%)"></span></td></tr>
<tr><td><code>Burg</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Burg" style="background:linear-gradient(to right,#ffc6c4 0%,#f4a3a8 16.67%,#e38191 33.33%,#cc607d 50%,#ad466c 66.67%,#8b3058 83.33%,#672044 100%)"></span></td></tr>
<tr><td><code>Burgyl</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Burgyl" style="background:linear-gradient(to right,#fbe6c5 0%,#f5ba98 16.67%,#ee8a82 33.33%,#dc7176 50%,#c8586c 66.67%,#9c3f5d 83.33%,#70284a 100%)"></span></td></tr>
<tr><td><code>Redor</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Redor" style="background:linear-gradient(to right,#f6d2a9 0%,#f5b78e 16.67%,#f19c7c 33.33%,#ea8171 50%,#dd686c 66.67%,#ca5268 83.33%,#b13f64 100%)"></span></td></tr>
<tr><td><code>Oryel</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Oryel" style="background:linear-gradient(to right,#ecda9a 0%,#efc47e 16.67%,#f3ad6a 33.33%,#f7945d 50%,#f97b57 66.67%,#f66356 83.33%,#ee4d5a 100%)"></span></td></tr>
<tr><td><code>Peach</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Peach" style="background:linear-gradient(to right,#fde0c5 0%,#facba6 16.67%,#f8b58b 33.33%,#f59e72 50%,#f2855d 66.67%,#ef6a4c 83.33%,#eb4a40 100%)"></span></td></tr>
<tr><td><code>Pinkyl</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Pinkyl" style="background:linear-gradient(to right,#fef6b5 0%,#ffdd9a 16.67%,#ffc285 33.33%,#ffa679 50%,#fa8a76 66.67%,#f16d7a 83.33%,#e15383 100%)"></span></td></tr>
<tr><td><code>Mint</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Mint" style="background:linear-gradient(to right,#e4f1e1 0%,#b4d9cc 16.67%,#89c0b6 33.33%,#63a6a0 50%,#448c8a 66.67%,#287274 83.33%,#0d585f 100%)"></span></td></tr>
<tr><td><code>Blugrn</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Blugrn" style="background:linear-gradient(to right,#c4e6c3 0%,#96d2a4 16.67%,#6dbc90 33.33%,#4da284 50%,#36877a 66.67%,#266b6e 83.33%,#1d4f60 100%)"></span></td></tr>
<tr><td><code>Darkmint</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Darkmint" style="background:linear-gradient(to right,#d2fbd4 0%,#a5dbc2 16.67%,#7bbcb0 33.33%,#559c9e 50%,#3a7c89 66.67%,#235d72 83.33%,#123f5a 100%)"></span></td></tr>
<tr><td><code>Emrld</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Emrld" style="background:linear-gradient(to right,#d3f2a3 0%,#97e196 16.67%,#6cc08b 33.33%,#4c9b82 50%,#217a79 66.67%,#105965 83.33%,#074050 100%)"></span></td></tr>
<tr><td><code>Aggrnyl</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Aggrnyl" style="background:linear-gradient(to right,#245668 0%,#0f7279 16.67%,#0d8f81 33.33%,#39ab7e 50%,#6ec574 66.67%,#a9dc67 83.33%,#edef5d 100%)"></span></td></tr>
<tr><td><code>Bluyl</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Bluyl" style="background:linear-gradient(to right,#f7feae 0%,#b7e6a5 16.67%,#7ccba2 33.33%,#46aea0 50%,#089099 66.67%,#00718b 83.33%,#045275 100%)"></span></td></tr>
<tr><td><code>Teal</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Teal" style="background:linear-gradient(to right,#d1eeea 0%,#a8dbd9 16.67%,#85c4c9 33.33%,#68abb8 50%,#4f90a6 66.67%,#3b738f 83.33%,#2a5674 100%)"></span></td></tr>
<tr><td><code>Tealgrn</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Tealgrn" style="background:linear-gradient(to right,#b0f2bc 0%,#89e8ac 16.67%,#67dba5 33.33%,#4cc8a3 50%,#38b2a3 66.67%,#2c98a0 83.33%,#257d98 100%)"></span></td></tr>
<tr><td><code>Purp</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Purp" style="background:linear-gradient(to right,#f3e0f7 0%,#e4c7f1 16.67%,#d1afe8 33.33%,#b998dd 50%,#9f82ce 66.67%,#826dba 83.33%,#63589f 100%)"></span></td></tr>
<tr><td><code>Purpor</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Purpor" style="background:linear-gradient(to right,#f9ddda 0%,#f2b9c4 16.67%,#e597b9 33.33%,#ce78b3 50%,#ad5fad 66.67%,#834ba0 83.33%,#573b88 100%)"></span></td></tr>
<tr><td><code>Sunset</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Sunset" style="background:linear-gradient(to right,#f3e79b 0%,#fac484 16.67%,#f8a07e 33.33%,#eb7f86 50%,#ce6693 66.67%,#a059a0 83.33%,#5c53a5 100%)"></span></td></tr>
<tr><td><code>Magenta</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Magenta" style="background:linear-gradient(to right,#f3cbd3 0%,#eaa9bd 16.67%,#dd88ac 33.33%,#ca699d 50%,#b14d8e 66.67%,#91357d 83.33%,#6c2167 100%)"></span></td></tr>
<tr><td><code>Sunsetdark</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Sunsetdark" style="background:linear-gradient(to right,#fcde9c 0%,#faa476 16.67%,#f0746e 33.33%,#e34f6f 50%,#dc3977 66.67%,#b9257a 83.33%,#7c1d6f 100%)"></span></td></tr>
<tr><td><code>Agsunset</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Agsunset" style="background:linear-gradient(to right,#4b2991 0%,#872ca2 16.67%,#c0369d 33.33%,#ea4f88 50%,#fa7876 66.67%,#f6a97a 83.33%,#edd9a3 100%)"></span></td></tr>
<tr><td><code>Brwnyl</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Brwnyl" style="background:linear-gradient(to right,#ede5cf 0%,#e0c2a2 16.67%,#d39c83 33.33%,#c1766f 50%,#a65461 66.67%,#813753 83.33%,#541f3f 100%)"></span></td></tr>
</tbody>
</table>

## Diverging colorscales

<table>
<thead><tr><th>Name</th><th>Source</th><th>Scale</th></tr></thead>
<tbody>
<tr><td><code>RdBu</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="RdBu" style="background:linear-gradient(to right,#050aac 0%,#6a89f7 35%,#bebebe 50%,#dcaa84 60%,#e6915a 70%,#b20a18 100%)"></span></td></tr>
<tr><td><code>Picnic</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Picnic" style="background:linear-gradient(to right,#0000ff 0%,#3399ff 10%,#66ccff 20%,#99ccff 30%,#ccccff 40%,#ffffff 50%,#ffccff 60%,#ff99ff 70%,#ff66cc 80%,#ff6666 90%,#ff0000 100%)"></span></td></tr>
<tr><td><code>Portland</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Portland" style="background:linear-gradient(to right,#0c3383 0%,#0a88ba 25%,#f2d338 50%,#f28f38 75%,#d91e1e 100%)"></span></td></tr>
<tr><td><code>Earth</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Earth" style="background:linear-gradient(to right,#000082 0%,#00b4b4 10%,#28d228 20%,#e6e632 40%,#784614 60%,#ffffff 100%)"></span></td></tr>
<tr><td><code>BrBG</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="BrBG" style="background:linear-gradient(to right,#543005 0%,#8c510a 10%,#bf812d 20%,#dfc27d 30%,#f6e8c3 40%,#f5f5f5 50%,#c7eae5 60%,#80cdc1 70%,#35978f 80%,#01665e 90%,#003c30 100%)"></span></td></tr>
<tr><td><code>PRGn</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="PRGn" style="background:linear-gradient(to right,#40004b 0%,#762a83 10%,#9970ab 20%,#c2a5cf 30%,#e7d4e8 40%,#f7f7f7 50%,#d9f0d3 60%,#a6dba0 70%,#5aae61 80%,#1b7837 90%,#00441b 100%)"></span></td></tr>
<tr><td><code>PiYG</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="PiYG" style="background:linear-gradient(to right,#8e0152 0%,#c51b7d 10%,#de77ae 20%,#f1b6da 30%,#fde0ef 40%,#f7f7f7 50%,#e6f5d0 60%,#b8e186 70%,#7fbc41 80%,#4d9221 90%,#276419 100%)"></span></td></tr>
<tr><td><code>PuOr</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="PuOr" style="background:linear-gradient(to right,#7f3b08 0%,#b35806 10%,#e08214 20%,#fdb863 30%,#fee0b6 40%,#f7f7f7 50%,#d8daeb 60%,#b2abd2 70%,#8073ac 80%,#542788 90%,#2d004b 100%)"></span></td></tr>
<tr><td><code>RdGy</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="RdGy" style="background:linear-gradient(to right,#67001f 0%,#b2182b 10%,#d6604d 20%,#f4a582 30%,#fddbc7 40%,#ffffff 50%,#e0e0e0 60%,#bababa 70%,#878787 80%,#4d4d4d 90%,#1a1a1a 100%)"></span></td></tr>
<tr><td><code>RdYlBu</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="RdYlBu" style="background:linear-gradient(to right,#a50026 0%,#d73027 10%,#f46d43 20%,#fdae61 30%,#fee090 40%,#ffffbf 50%,#e0f3f8 60%,#abd9e9 70%,#74add1 80%,#4575b4 90%,#313695 100%)"></span></td></tr>
<tr><td><code>RdYlGn</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="RdYlGn" style="background:linear-gradient(to right,#a50026 0%,#d73027 10%,#f46d43 20%,#fdae61 30%,#fee08b 40%,#ffffbf 50%,#d9ef8b 60%,#a6d96a 70%,#66bd63 80%,#1a9850 90%,#006837 100%)"></span></td></tr>
<tr><td><code>Spectral</code></td><td>ColorBrewer</td><td><span class="hc-colorscale" role="img" aria-label="Spectral" style="background:linear-gradient(to right,#9e0142 0%,#d53e4f 10%,#f46d43 20%,#fdae61 30%,#fee08b 40%,#ffffbf 50%,#e6f598 60%,#abdda4 70%,#66c2a5 80%,#3288bd 90%,#5e4fa2 100%)"></span></td></tr>
<tr><td><code>balance</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="balance" style="background:linear-gradient(to right,#171c42 0%,#293a8f 9.09%,#0b66bd 18.18%,#4590b9 27.27%,#8eb5c2 36.36%,#d2d8db 45.45%,#e6d2cc 54.55%,#d59d89 63.64%,#c46548 72.73%,#ac2b24 81.82%,#780e28 90.91%,#3c0911 100%)"></span></td></tr>
<tr><td><code>delta</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="delta" style="background:linear-gradient(to right,#101f3f 0%,#263e90 9.09%,#1e6ea1 18.18%,#3c9aab 27.27%,#8cc1ba 36.36%,#d9e5da 45.45%,#efe29c 54.55%,#c3b63b 63.64%,#739805 72.73%,#227824 81.82%,#124e2b 90.91%,#172312 100%)"></span></td></tr>
<tr><td><code>curl</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="curl" style="background:linear-gradient(to right,#141d43 0%,#1c485d 9.09%,#127375 18.18%,#3f9c81 27.27%,#99bd9c 36.36%,#dfe1d3 45.45%,#f1dace 54.55%,#e0a089 63.64%,#cb6563 72.73%,#a43660 81.82%,#6f175b 90.91%,#330d35 100%)"></span></td></tr>
<tr><td><code>oxy</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="oxy" style="background:linear-gradient(to right,#3f0505 0%,#65060d 9.09%,#8a1109 18.18%,#605f5f 27.27%,#777676 36.36%,#8e8d8d 45.45%,#a6a6a5 54.55%,#c1c0bf 63.64%,#dededc 72.73%,#eff85a 81.82%,#e6d229 90.91%,#dcae19 100%)"></span></td></tr>
<tr><td><code>Armyrose</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Armyrose" style="background:linear-gradient(to right,#798234 0%,#a3ad62 16.67%,#d0d3a2 33.33%,#fdfbe4 50%,#f0c6c3 66.67%,#df91a3 83.33%,#d46780 100%)"></span></td></tr>
<tr><td><code>Fall</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Fall" style="background:linear-gradient(to right,#3d5941 0%,#778868 16.67%,#b5b991 33.33%,#f6edbd 50%,#edbb8a 66.67%,#de8a5a 83.33%,#ca562c 100%)"></span></td></tr>
<tr><td><code>Geyser</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Geyser" style="background:linear-gradient(to right,#008080 0%,#70a494 16.67%,#b4c8a8 33.33%,#f6edbd 50%,#edbb8a 66.67%,#de8a5a 83.33%,#ca562c 100%)"></span></td></tr>
<tr><td><code>Tealrose</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Tealrose" style="background:linear-gradient(to right,#009392 0%,#72aaa1 16.67%,#b1c7b3 33.33%,#f1eac8 50%,#e5b9ad 66.67%,#d98994 83.33%,#d0587e 100%)"></span></td></tr>
<tr><td><code>Temps</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Temps" style="background:linear-gradient(to right,#009392 0%,#39b185 16.67%,#9ccb86 33.33%,#e9e29c 50%,#eeb479 66.67%,#e88471 83.33%,#cf597e 100%)"></span></td></tr>
<tr><td><code>Tropic</code></td><td>CARTO</td><td><span class="hc-colorscale" role="img" aria-label="Tropic" style="background:linear-gradient(to right,#009b9e 0%,#42b7b9 16.67%,#a7d3d4 33.33%,#f1f1f1 50%,#e4c1d9 66.67%,#d691c1 83.33%,#c75dab 100%)"></span></td></tr>
</tbody>
</table>

## Cyclical colorscales

<table>
<thead><tr><th>Name</th><th>Source</th><th>Scale</th></tr></thead>
<tbody>
<tr><td><code>phase</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="phase" style="background:linear-gradient(to right,#a7770c 0%,#c56033 9.09%,#d94360 18.18%,#dd26a3 27.27%,#c43be0 36.36%,#9961f4 45.45%,#5f7fe4 54.55%,#2890b7 63.64%,#0f9788 72.73%,#27994f 81.82%,#778d11 90.91%,#a7770c 100%)"></span></td></tr>
<tr><td><code>Twilight</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="Twilight" style="background:linear-gradient(to right,#e2d9e2 0%,#9ebbc9 11.11%,#6785be 22.22%,#5e43a5 33.33%,#421257 44.44%,#471340 55.56%,#8e2c50 66.67%,#ba6657 77.78%,#ceac94 88.89%,#e2d9e2 100%)"></span></td></tr>
<tr><td><code>IceFire</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="IceFire" style="background:linear-gradient(to right,#000000 0%,#001f4d 6.25%,#003786 12.5%,#0e58a8 18.75%,#217eb8 25%,#30a4ca 31.25%,#54c8df 37.5%,#9be4ef 43.75%,#e1e9d1 50%,#f3d573 56.25%,#e7b000 62.5%,#da8200 68.75%,#c65400 75%,#ac2301 81.25%,#820000 87.5%,#4c0000 93.75%,#000000 100%)"></span></td></tr>
<tr><td><code>Edge</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="Edge" style="background:linear-gradient(to right,#313131 0%,#3d019d 6.25%,#3810dc 12.5%,#2d47f9 18.75%,#2593ff 25%,#2adef6 31.25%,#60fdfa 37.5%,#aefdff 43.75%,#f3f3f1 50%,#fffda9 56.25%,#fafd5b 62.5%,#f7da29 68.75%,#ff8e25 75%,#f8432d 81.25%,#d90d39 87.5%,#97023d 93.75%,#313131 100%)"></span></td></tr>
<tr><td><code>HSV</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="HSV" style="background:linear-gradient(to right,#ff0000 0%,#ffa700 11.11%,#afff00 22.22%,#08ff00 33.33%,#00ff9f 44.44%,#00b7ff 55.56%,#0010ff 66.67%,#9700ff 77.78%,#ff00bf 88.89%,#ff0000 100%)"></span></td></tr>
<tr><td><code>mrybm</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="mrybm" style="background:linear-gradient(to right,#f884f7 0%,#f968c4 6.25%,#ea4388 12.5%,#cf244b 18.75%,#b51a15 25%,#bd4304 31.25%,#cc6904 37.5%,#d58f04 43.75%,#cfaa27 50%,#a19f62 56.25%,#588a93 62.5%,#2269c4 68.75%,#3e3ef0 75%,#6b4ef9 81.25%,#956bfa 87.5%,#cd7dfe 93.75%,#f884f7 100%)"></span></td></tr>
<tr><td><code>mygbm</code></td><td>plotly</td><td><span class="hc-colorscale" role="img" aria-label="mygbm" style="background:linear-gradient(to right,#ef55f1 0%,#fb84ce 6.25%,#fbafa1 12.5%,#fcd471 18.75%,#f0ed35 25%,#c6e516 31.25%,#96d310 37.5%,#61c10b 43.75%,#31ac28 50%,#439064 56.25%,#3d719a 62.5%,#284ec8 68.75%,#2e21ea 75%,#6324f5 81.25%,#9139fa 87.5%,#c543fa 93.75%,#ef55f1 100%)"></span></td></tr>
</tbody>
</table>

## Names with two definitions

20 lists of the built-in sets share a name (ignoring case) with a scale that comes earlier in the registry. The name keeps the earlier meaning; the other list is exported as a value.

<table>
<thead><tr><th>Name</th><th>Resolves to</th><th></th><th>Other list</th><th></th></tr></thead>
<tbody>
<tr><td><code>Viridis</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Viridis (plotly.js)" style="width:90px;background:linear-gradient(to right,#440154 0%,#48186a 6.25%,#472d7b 12.5%,#424086 18.75%,#3b528b 25%,#33638d 31.25%,#2c728e 37.5%,#26828e 43.75%,#21918c 50%,#1fa088 56.25%,#28ae80 62.5%,#3fbc73 68.75%,#5ec962 75%,#84d44b 81.25%,#addc30 87.5%,#d8e219 93.75%,#fde725 100%)"></span></td><td><code>SEQUENTIAL.Viridis</code></td><td><span class="hc-colorscale" role="img" aria-label="Viridis (plotly)" style="width:90px;background:linear-gradient(to right,#440154 0%,#482878 11.11%,#3e4989 22.22%,#31688e 33.33%,#26828e 44.44%,#1f9e89 55.56%,#35b779 66.67%,#6ece58 77.78%,#b5de2b 88.89%,#fde725 100%)"></span></td></tr>
<tr><td><code>Cividis</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Cividis (plotly.js)" style="width:90px;background:linear-gradient(to right,#00204c 0%,#002a66 5.88%,#00346e 11.76%,#273f6c 17.65%,#3c4a6b 23.53%,#4c556b 29.41%,#5b5f6d 35.29%,#686a70 41.18%,#757575 47.06%,#838178 52.94%,#928c78 58.82%,#a19876 64.71%,#b0a572 70.59%,#c0b16d 76.47%,#d1bf66 82.35%,#e1cc5c 88.24%,#f3db4f 94.12%,#ffe945 100%)"></span></td><td><code>SEQUENTIAL.Cividis</code></td><td><span class="hc-colorscale" role="img" aria-label="Cividis (plotly)" style="width:90px;background:linear-gradient(to right,#00224e 0%,#123570 11.11%,#3b496c 22.22%,#575d6d 33.33%,#707173 44.44%,#8a8678 55.56%,#a59c74 66.67%,#c3b369 77.78%,#e1cc55 88.89%,#fee838 100%)"></span></td></tr>
<tr><td><code>Plasma</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Plasma (plotly.js)" style="width:90px;background:linear-gradient(to right,#0d0887 0%,#46039f 11.11%,#7201a8 22.22%,#9c179e 33.33%,#bd3786 44.44%,#d8576b 55.56%,#ed7953 66.67%,#fb9f3a 77.78%,#fdca26 88.89%,#f0f921 100%)"></span></td><td><code>SEQUENTIAL.Plasma</code></td><td><span class="hc-colorscale" role="img" aria-label="Plasma (plotly)" style="width:90px;background:linear-gradient(to right,#0d0887 0%,#46039f 11.11%,#7201a8 22.22%,#9c179e 33.33%,#bd3786 44.44%,#d8576b 55.56%,#ed7953 66.67%,#fb9f3a 77.78%,#fdca26 88.89%,#f0f921 100%)"></span></td></tr>
<tr><td><code>Rainbow</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Rainbow (plotly.js)" style="width:90px;background:linear-gradient(to right,#96005a 0%,#0000c8 12.5%,#0019ff 25%,#0098ff 37.5%,#2cff96 50%,#97ff00 62.5%,#ffea00 75%,#ff6f00 87.5%,#ff0000 100%)"></span></td><td><code>SEQUENTIAL.Rainbow</code></td><td><span class="hc-colorscale" role="img" aria-label="Rainbow (plotly)" style="width:90px;background:linear-gradient(to right,#96005a 0%,#0000c8 12.5%,#0019ff 25%,#0098ff 37.5%,#2cff96 50%,#97ff00 62.5%,#ffea00 75%,#ff6f00 87.5%,#ff0000 100%)"></span></td></tr>
<tr><td><code>Blackbody</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Blackbody (plotly.js)" style="width:90px;background:linear-gradient(to right,#000000 0%,#e60000 20%,#e6d200 40%,#ffffff 70%,#a0c8ff 100%)"></span></td><td><code>SEQUENTIAL.Blackbody</code></td><td><span class="hc-colorscale" role="img" aria-label="Blackbody (plotly)" style="width:90px;background:linear-gradient(to right,#000000 0%,#e60000 25%,#e6d200 50%,#ffffff 75%,#a0c8ff 100%)"></span></td></tr>
<tr><td><code>Bluered</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Bluered (plotly.js)" style="width:90px;background:linear-gradient(to right,#0000ff 0%,#ff0000 100%)"></span></td><td><code>SEQUENTIAL.Bluered</code></td><td><span class="hc-colorscale" role="img" aria-label="Bluered (plotly)" style="width:90px;background:linear-gradient(to right,#0000ff 0%,#ff0000 100%)"></span></td></tr>
<tr><td><code>Electric</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Electric (plotly.js)" style="width:90px;background:linear-gradient(to right,#000000 0%,#1e0064 15%,#780064 40%,#a05a00 60%,#e6c800 80%,#fffadc 100%)"></span></td><td><code>SEQUENTIAL.Electric</code></td><td><span class="hc-colorscale" role="img" aria-label="Electric (plotly)" style="width:90px;background:linear-gradient(to right,#000000 0%,#1e0064 20%,#780064 40%,#a05a00 60%,#e6c800 80%,#fffadc 100%)"></span></td></tr>
<tr><td><code>Hot</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Hot (plotly.js)" style="width:90px;background:linear-gradient(to right,#000000 0%,#e60000 30%,#ffd200 60%,#ffffff 100%)"></span></td><td><code>SEQUENTIAL.Hot</code></td><td><span class="hc-colorscale" role="img" aria-label="Hot (plotly)" style="width:90px;background:linear-gradient(to right,#000000 0%,#e60000 33.33%,#ffd200 66.67%,#ffffff 100%)"></span></td></tr>
<tr><td><code>Jet</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Jet (plotly.js)" style="width:90px;background:linear-gradient(to right,#000083 0%,#003caa 12.5%,#05ffff 37.5%,#ffff00 62.5%,#fa0000 87.5%,#800000 100%)"></span></td><td><code>SEQUENTIAL.Jet</code></td><td><span class="hc-colorscale" role="img" aria-label="Jet (plotly)" style="width:90px;background:linear-gradient(to right,#000083 0%,#003caa 20%,#05ffff 40%,#ffff00 60%,#fa0000 80%,#800000 100%)"></span></td></tr>
<tr><td><code>Picnic</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Picnic (plotly.js)" style="width:90px;background:linear-gradient(to right,#0000ff 0%,#3399ff 10%,#66ccff 20%,#99ccff 30%,#ccccff 40%,#ffffff 50%,#ffccff 60%,#ff99ff 70%,#ff66cc 80%,#ff6666 90%,#ff0000 100%)"></span></td><td><code>DIVERGING_PLOTLY.Picnic</code></td><td><span class="hc-colorscale" role="img" aria-label="Picnic (plotly)" style="width:90px;background:linear-gradient(to right,#0000ff 0%,#3399ff 10%,#66ccff 20%,#99ccff 30%,#ccccff 40%,#ffffff 50%,#ffccff 60%,#ff99ff 70%,#ff66cc 80%,#ff6666 90%,#ff0000 100%)"></span></td></tr>
<tr><td><code>Portland</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Portland (plotly.js)" style="width:90px;background:linear-gradient(to right,#0c3383 0%,#0a88ba 25%,#f2d338 50%,#f28f38 75%,#d91e1e 100%)"></span></td><td><code>DIVERGING_PLOTLY.Portland</code></td><td><span class="hc-colorscale" role="img" aria-label="Portland (plotly)" style="width:90px;background:linear-gradient(to right,#0c3383 0%,#0a88ba 25%,#f2d338 50%,#f28f38 75%,#d91e1e 100%)"></span></td></tr>
<tr><td><code>Blues</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Blues (plotly.js)" style="width:90px;background:linear-gradient(to right,#050aac 0%,#283cbe 35%,#4664f5 50%,#5a78f5 60%,#6a89f7 70%,#dcdcdc 100%)"></span></td><td><code>COLORBREWER_SEQUENTIAL.Blues</code></td><td><span class="hc-colorscale" role="img" aria-label="Blues (ColorBrewer)" style="width:90px;background:linear-gradient(to right,#f7fbff 0%,#deebf7 12.5%,#c6dbef 25%,#9ecae1 37.5%,#6baed6 50%,#4292c6 62.5%,#2171b5 75%,#08519c 87.5%,#08306b 100%)"></span></td></tr>
<tr><td><code>Greens</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Greens (plotly.js)" style="width:90px;background:linear-gradient(to right,#00441b 0%,#006d2c 12.5%,#238b45 25%,#41ab5d 37.5%,#74c476 50%,#a1d99b 62.5%,#c7e9c0 75%,#e5f5e0 87.5%,#f7fcf5 100%)"></span></td><td><code>COLORBREWER_SEQUENTIAL.Greens</code></td><td><span class="hc-colorscale" role="img" aria-label="Greens (ColorBrewer)" style="width:90px;background:linear-gradient(to right,#f7fcf5 0%,#e5f5e0 12.5%,#c7e9c0 25%,#a1d99b 37.5%,#74c476 50%,#41ab5d 62.5%,#238b45 75%,#006d2c 87.5%,#00441b 100%)"></span></td></tr>
<tr><td><code>Greys</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Greys (plotly.js)" style="width:90px;background:linear-gradient(to right,#000000 0%,#ffffff 100%)"></span></td><td><code>COLORBREWER_SEQUENTIAL.Greys</code></td><td><span class="hc-colorscale" role="img" aria-label="Greys (ColorBrewer)" style="width:90px;background:linear-gradient(to right,#ffffff 0%,#f0f0f0 12.5%,#d9d9d9 25%,#bdbdbd 37.5%,#969696 50%,#737373 62.5%,#525252 75%,#252525 87.5%,#000000 100%)"></span></td></tr>
<tr><td><code>Reds</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Reds (plotly.js)" style="width:90px;background:linear-gradient(to right,#dcdcdc 0%,#f5c39d 20%,#f5a069 40%,#b20a18 100%)"></span></td><td><code>COLORBREWER_SEQUENTIAL.Reds</code></td><td><span class="hc-colorscale" role="img" aria-label="Reds (ColorBrewer)" style="width:90px;background:linear-gradient(to right,#fff5f0 0%,#fee0d2 12.5%,#fcbba1 25%,#fc9272 37.5%,#fb6a4a 50%,#ef3b2c 62.5%,#cb181d 75%,#a50f15 87.5%,#67000d 100%)"></span></td></tr>
<tr><td><code>YlGnBu</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="YlGnBu (plotly.js)" style="width:90px;background:linear-gradient(to right,#081d58 0%,#253494 12.5%,#225ea8 25%,#1d91c0 37.5%,#41b6c4 50%,#7fcdbb 62.5%,#c7e9b4 75%,#edf8d9 87.5%,#ffffd9 100%)"></span></td><td><code>COLORBREWER_SEQUENTIAL.YlGnBu</code></td><td><span class="hc-colorscale" role="img" aria-label="YlGnBu (ColorBrewer)" style="width:90px;background:linear-gradient(to right,#ffffd9 0%,#edf8b1 12.5%,#c7e9b4 25%,#7fcdbb 37.5%,#41b6c4 50%,#1d91c0 62.5%,#225ea8 75%,#253494 87.5%,#081d58 100%)"></span></td></tr>
<tr><td><code>YlOrRd</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="YlOrRd (plotly.js)" style="width:90px;background:linear-gradient(to right,#800026 0%,#bd0026 12.5%,#e31a1c 25%,#fc4e2a 37.5%,#fd8d3c 50%,#feb24c 62.5%,#fed976 75%,#ffeda0 87.5%,#ffffcc 100%)"></span></td><td><code>COLORBREWER_SEQUENTIAL.YlOrRd</code></td><td><span class="hc-colorscale" role="img" aria-label="YlOrRd (ColorBrewer)" style="width:90px;background:linear-gradient(to right,#ffffcc 0%,#ffeda0 12.5%,#fed976 25%,#feb24c 37.5%,#fd8d3c 50%,#fc4e2a 62.5%,#e31a1c 75%,#bd0026 87.5%,#800026 100%)"></span></td></tr>
<tr><td><code>RdBu</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="RdBu (plotly.js)" style="width:90px;background:linear-gradient(to right,#050aac 0%,#6a89f7 35%,#bebebe 50%,#dcaa84 60%,#e6915a 70%,#b20a18 100%)"></span></td><td><code>COLORBREWER_DIVERGING.RdBu</code></td><td><span class="hc-colorscale" role="img" aria-label="RdBu (ColorBrewer)" style="width:90px;background:linear-gradient(to right,#67001f 0%,#b2182b 10%,#d6604d 20%,#f4a582 30%,#fddbc7 40%,#f7f7f7 50%,#d1e5f0 60%,#92c5de 70%,#4393c3 80%,#2166ac 90%,#053061 100%)"></span></td></tr>
<tr><td><code>Earth</code></td><td>plotly.js</td><td><span class="hc-colorscale" role="img" aria-label="Earth (plotly.js)" style="width:90px;background:linear-gradient(to right,#000082 0%,#00b4b4 10%,#28d228 20%,#e6e632 40%,#784614 60%,#ffffff 100%)"></span></td><td><code>CARTO_DIVERGING.Earth</code></td><td><span class="hc-colorscale" role="img" aria-label="Earth (CARTO)" style="width:90px;background:linear-gradient(to right,#a16928 0%,#bd925a 16.67%,#d6bd8d 33.33%,#edeac2 50%,#b5c8b8 66.67%,#79a7ac 83.33%,#2887a1 100%)"></span></td></tr>
<tr><td><code>phase</code></td><td>cmocean</td><td><span class="hc-colorscale" role="img" aria-label="phase (cmocean)" style="width:90px;background:linear-gradient(to right,#a7770c 0%,#c56033 9.09%,#d94360 18.18%,#dd26a3 27.27%,#c43be0 36.36%,#9961f4 45.45%,#5f7fe4 54.55%,#2890b7 63.64%,#0f9788 72.73%,#27994f 81.82%,#778d11 90.91%,#a7770c 100%)"></span></td><td><code>CYCLICAL.Phase</code></td><td><span class="hc-colorscale" role="img" aria-label="Phase (plotly)" style="width:90px;background:linear-gradient(to right,#a7770c 0%,#c56033 9.09%,#d94360 18.18%,#dd26a3 27.27%,#c43be0 36.36%,#9961f4 45.45%,#5f7fe4 54.55%,#2890b7 63.64%,#0f9788 72.73%,#27994f 81.82%,#778d11 90.91%,#a7770c 100%)"></span></td></tr>
</tbody>
</table>

## Qualitative palettes

<table>
<thead><tr><th>Name</th><th>Colors</th><th>Palette</th></tr></thead>
<tbody>
<tr><td><code>Plotly</code></td><td>10</td><td><span class="hc-palette"><i style="background:#636efa" title="#636EFA"></i><i style="background:#ef553b" title="#EF553B"></i><i style="background:#00cc96" title="#00CC96"></i><i style="background:#ab63fa" title="#AB63FA"></i><i style="background:#ffa15a" title="#FFA15A"></i><i style="background:#19d3f3" title="#19D3F3"></i><i style="background:#ff6692" title="#FF6692"></i><i style="background:#b6e880" title="#B6E880"></i><i style="background:#ff97ff" title="#FF97FF"></i><i style="background:#fecb52" title="#FECB52"></i></span></td></tr>
<tr><td><code>D3</code></td><td>10</td><td><span class="hc-palette"><i style="background:#1f77b4" title="#1F77B4"></i><i style="background:#ff7f0e" title="#FF7F0E"></i><i style="background:#2ca02c" title="#2CA02C"></i><i style="background:#d62728" title="#D62728"></i><i style="background:#9467bd" title="#9467BD"></i><i style="background:#8c564b" title="#8C564B"></i><i style="background:#e377c2" title="#E377C2"></i><i style="background:#7f7f7f" title="#7F7F7F"></i><i style="background:#bcbd22" title="#BCBD22"></i><i style="background:#17becf" title="#17BECF"></i></span></td></tr>
<tr><td><code>G10</code></td><td>10</td><td><span class="hc-palette"><i style="background:#3366cc" title="#3366CC"></i><i style="background:#dc3912" title="#DC3912"></i><i style="background:#ff9900" title="#FF9900"></i><i style="background:#109618" title="#109618"></i><i style="background:#990099" title="#990099"></i><i style="background:#0099c6" title="#0099C6"></i><i style="background:#dd4477" title="#DD4477"></i><i style="background:#66aa00" title="#66AA00"></i><i style="background:#b82e2e" title="#B82E2E"></i><i style="background:#316395" title="#316395"></i></span></td></tr>
<tr><td><code>T10</code></td><td>10</td><td><span class="hc-palette"><i style="background:#4c78a8" title="#4C78A8"></i><i style="background:#f58518" title="#F58518"></i><i style="background:#e45756" title="#E45756"></i><i style="background:#72b7b2" title="#72B7B2"></i><i style="background:#54a24b" title="#54A24B"></i><i style="background:#eeca3b" title="#EECA3B"></i><i style="background:#b279a2" title="#B279A2"></i><i style="background:#ff9da6" title="#FF9DA6"></i><i style="background:#9d755d" title="#9D755D"></i><i style="background:#bab0ac" title="#BAB0AC"></i></span></td></tr>
<tr><td><code>Alphabet</code></td><td>26</td><td><span class="hc-palette"><i style="background:#aa0dfe" title="#AA0DFE"></i><i style="background:#3283fe" title="#3283FE"></i><i style="background:#85660d" title="#85660D"></i><i style="background:#782ab6" title="#782AB6"></i><i style="background:#565656" title="#565656"></i><i style="background:#1c8356" title="#1C8356"></i><i style="background:#16ff32" title="#16FF32"></i><i style="background:#f7e1a0" title="#F7E1A0"></i><i style="background:#e2e2e2" title="#E2E2E2"></i><i style="background:#1cbe4f" title="#1CBE4F"></i><i style="background:#c4451c" title="#C4451C"></i><i style="background:#dea0fd" title="#DEA0FD"></i><i style="background:#fe00fa" title="#FE00FA"></i><i style="background:#325a9b" title="#325A9B"></i><i style="background:#feaf16" title="#FEAF16"></i><i style="background:#f8a19f" title="#F8A19F"></i><i style="background:#90ad1c" title="#90AD1C"></i><i style="background:#f6222e" title="#F6222E"></i><i style="background:#1cffce" title="#1CFFCE"></i><i style="background:#2ed9ff" title="#2ED9FF"></i><i style="background:#b10da1" title="#B10DA1"></i><i style="background:#c075a6" title="#C075A6"></i><i style="background:#fc1cbf" title="#FC1CBF"></i><i style="background:#b00068" title="#B00068"></i><i style="background:#fbe426" title="#FBE426"></i><i style="background:#fa0087" title="#FA0087"></i></span></td></tr>
<tr><td><code>Dark24</code></td><td>24</td><td><span class="hc-palette"><i style="background:#2e91e5" title="#2E91E5"></i><i style="background:#e15f99" title="#E15F99"></i><i style="background:#1ca71c" title="#1CA71C"></i><i style="background:#fb0d0d" title="#FB0D0D"></i><i style="background:#da16ff" title="#DA16FF"></i><i style="background:#222a2a" title="#222A2A"></i><i style="background:#b68100" title="#B68100"></i><i style="background:#750d86" title="#750D86"></i><i style="background:#eb663b" title="#EB663B"></i><i style="background:#511cfb" title="#511CFB"></i><i style="background:#00a08b" title="#00A08B"></i><i style="background:#fb00d1" title="#FB00D1"></i><i style="background:#fc0080" title="#FC0080"></i><i style="background:#b2828d" title="#B2828D"></i><i style="background:#6c7c32" title="#6C7C32"></i><i style="background:#778aae" title="#778AAE"></i><i style="background:#862a16" title="#862A16"></i><i style="background:#a777f1" title="#A777F1"></i><i style="background:#620042" title="#620042"></i><i style="background:#1616a7" title="#1616A7"></i><i style="background:#da60ca" title="#DA60CA"></i><i style="background:#6c4516" title="#6C4516"></i><i style="background:#0d2a63" title="#0D2A63"></i><i style="background:#af0038" title="#AF0038"></i></span></td></tr>
<tr><td><code>Light24</code></td><td>24</td><td><span class="hc-palette"><i style="background:#fd3216" title="#FD3216"></i><i style="background:#00fe35" title="#00FE35"></i><i style="background:#6a76fc" title="#6A76FC"></i><i style="background:#fed4c4" title="#FED4C4"></i><i style="background:#fe00ce" title="#FE00CE"></i><i style="background:#0df9ff" title="#0DF9FF"></i><i style="background:#f6f926" title="#F6F926"></i><i style="background:#ff9616" title="#FF9616"></i><i style="background:#479b55" title="#479B55"></i><i style="background:#eea6fb" title="#EEA6FB"></i><i style="background:#dc587d" title="#DC587D"></i><i style="background:#d626ff" title="#D626FF"></i><i style="background:#6e899c" title="#6E899C"></i><i style="background:#00b5f7" title="#00B5F7"></i><i style="background:#b68e00" title="#B68E00"></i><i style="background:#c9fbe5" title="#C9FBE5"></i><i style="background:#ff0092" title="#FF0092"></i><i style="background:#22ffa7" title="#22FFA7"></i><i style="background:#e3ee9e" title="#E3EE9E"></i><i style="background:#86ce00" title="#86CE00"></i><i style="background:#bc7196" title="#BC7196"></i><i style="background:#7e7dcd" title="#7E7DCD"></i><i style="background:#fc6955" title="#FC6955"></i><i style="background:#e48f72" title="#E48F72"></i></span></td></tr>
<tr><td><code>Set1</code></td><td>9</td><td><span class="hc-palette"><i style="background:#e41a1c" title="rgb(228,26,28)"></i><i style="background:#377eb8" title="rgb(55,126,184)"></i><i style="background:#4daf4a" title="rgb(77,175,74)"></i><i style="background:#984ea3" title="rgb(152,78,163)"></i><i style="background:#ff7f00" title="rgb(255,127,0)"></i><i style="background:#ffff33" title="rgb(255,255,51)"></i><i style="background:#a65628" title="rgb(166,86,40)"></i><i style="background:#f781bf" title="rgb(247,129,191)"></i><i style="background:#999999" title="rgb(153,153,153)"></i></span></td></tr>
<tr><td><code>Pastel1</code></td><td>9</td><td><span class="hc-palette"><i style="background:#fbb4ae" title="rgb(251,180,174)"></i><i style="background:#b3cde3" title="rgb(179,205,227)"></i><i style="background:#ccebc5" title="rgb(204,235,197)"></i><i style="background:#decbe4" title="rgb(222,203,228)"></i><i style="background:#fed9a6" title="rgb(254,217,166)"></i><i style="background:#ffffcc" title="rgb(255,255,204)"></i><i style="background:#e5d8bd" title="rgb(229,216,189)"></i><i style="background:#fddaec" title="rgb(253,218,236)"></i><i style="background:#f2f2f2" title="rgb(242,242,242)"></i></span></td></tr>
<tr><td><code>Dark2</code></td><td>8</td><td><span class="hc-palette"><i style="background:#1b9e77" title="rgb(27,158,119)"></i><i style="background:#d95f02" title="rgb(217,95,2)"></i><i style="background:#7570b3" title="rgb(117,112,179)"></i><i style="background:#e7298a" title="rgb(231,41,138)"></i><i style="background:#66a61e" title="rgb(102,166,30)"></i><i style="background:#e6ab02" title="rgb(230,171,2)"></i><i style="background:#a6761d" title="rgb(166,118,29)"></i><i style="background:#666666" title="rgb(102,102,102)"></i></span></td></tr>
<tr><td><code>Set2</code></td><td>8</td><td><span class="hc-palette"><i style="background:#66c2a5" title="rgb(102,194,165)"></i><i style="background:#fc8d62" title="rgb(252,141,98)"></i><i style="background:#8da0cb" title="rgb(141,160,203)"></i><i style="background:#e78ac3" title="rgb(231,138,195)"></i><i style="background:#a6d854" title="rgb(166,216,84)"></i><i style="background:#ffd92f" title="rgb(255,217,47)"></i><i style="background:#e5c494" title="rgb(229,196,148)"></i><i style="background:#b3b3b3" title="rgb(179,179,179)"></i></span></td></tr>
<tr><td><code>Pastel2</code></td><td>8</td><td><span class="hc-palette"><i style="background:#b3e2cd" title="rgb(179,226,205)"></i><i style="background:#fdcdac" title="rgb(253,205,172)"></i><i style="background:#cbd5e8" title="rgb(203,213,232)"></i><i style="background:#f4cae4" title="rgb(244,202,228)"></i><i style="background:#e6f5c9" title="rgb(230,245,201)"></i><i style="background:#fff2ae" title="rgb(255,242,174)"></i><i style="background:#f1e2cc" title="rgb(241,226,204)"></i><i style="background:#cccccc" title="rgb(204,204,204)"></i></span></td></tr>
<tr><td><code>Set3</code></td><td>12</td><td><span class="hc-palette"><i style="background:#8dd3c7" title="rgb(141,211,199)"></i><i style="background:#ffffb3" title="rgb(255,255,179)"></i><i style="background:#bebada" title="rgb(190,186,218)"></i><i style="background:#fb8072" title="rgb(251,128,114)"></i><i style="background:#80b1d3" title="rgb(128,177,211)"></i><i style="background:#fdb462" title="rgb(253,180,98)"></i><i style="background:#b3de69" title="rgb(179,222,105)"></i><i style="background:#fccde5" title="rgb(252,205,229)"></i><i style="background:#d9d9d9" title="rgb(217,217,217)"></i><i style="background:#bc80bd" title="rgb(188,128,189)"></i><i style="background:#ccebc5" title="rgb(204,235,197)"></i><i style="background:#ffed6f" title="rgb(255,237,111)"></i></span></td></tr>
<tr><td><code>Antique</code></td><td>11</td><td><span class="hc-palette"><i style="background:#855c75" title="rgb(133, 92, 117)"></i><i style="background:#d9af6b" title="rgb(217, 175, 107)"></i><i style="background:#af6458" title="rgb(175, 100, 88)"></i><i style="background:#736f4c" title="rgb(115, 111, 76)"></i><i style="background:#526a83" title="rgb(82, 106, 131)"></i><i style="background:#625377" title="rgb(98, 83, 119)"></i><i style="background:#68855c" title="rgb(104, 133, 92)"></i><i style="background:#9c9c5e" title="rgb(156, 156, 94)"></i><i style="background:#a06177" title="rgb(160, 97, 119)"></i><i style="background:#8c785d" title="rgb(140, 120, 93)"></i><i style="background:#7c7c7c" title="rgb(124, 124, 124)"></i></span></td></tr>
<tr><td><code>Bold</code></td><td>11</td><td><span class="hc-palette"><i style="background:#7f3c8d" title="rgb(127, 60, 141)"></i><i style="background:#11a579" title="rgb(17, 165, 121)"></i><i style="background:#3969ac" title="rgb(57, 105, 172)"></i><i style="background:#f2b701" title="rgb(242, 183, 1)"></i><i style="background:#e73f74" title="rgb(231, 63, 116)"></i><i style="background:#80ba5a" title="rgb(128, 186, 90)"></i><i style="background:#e68310" title="rgb(230, 131, 16)"></i><i style="background:#008695" title="rgb(0, 134, 149)"></i><i style="background:#cf1c90" title="rgb(207, 28, 144)"></i><i style="background:#f97b72" title="rgb(249, 123, 114)"></i><i style="background:#a5aa99" title="rgb(165, 170, 153)"></i></span></td></tr>
<tr><td><code>Pastel</code></td><td>11</td><td><span class="hc-palette"><i style="background:#66c5cc" title="rgb(102, 197, 204)"></i><i style="background:#f6cf71" title="rgb(246, 207, 113)"></i><i style="background:#f89c74" title="rgb(248, 156, 116)"></i><i style="background:#dcb0f2" title="rgb(220, 176, 242)"></i><i style="background:#87c55f" title="rgb(135, 197, 95)"></i><i style="background:#9eb9f3" title="rgb(158, 185, 243)"></i><i style="background:#fe88b1" title="rgb(254, 136, 177)"></i><i style="background:#c9db74" title="rgb(201, 219, 116)"></i><i style="background:#8be0a4" title="rgb(139, 224, 164)"></i><i style="background:#b497e7" title="rgb(180, 151, 231)"></i><i style="background:#b3b3b3" title="rgb(179, 179, 179)"></i></span></td></tr>
<tr><td><code>Prism</code></td><td>11</td><td><span class="hc-palette"><i style="background:#5f4690" title="rgb(95, 70, 144)"></i><i style="background:#1d6996" title="rgb(29, 105, 150)"></i><i style="background:#38a6a5" title="rgb(56, 166, 165)"></i><i style="background:#0f8554" title="rgb(15, 133, 84)"></i><i style="background:#73af48" title="rgb(115, 175, 72)"></i><i style="background:#edad08" title="rgb(237, 173, 8)"></i><i style="background:#e17c05" title="rgb(225, 124, 5)"></i><i style="background:#cc503e" title="rgb(204, 80, 62)"></i><i style="background:#94346e" title="rgb(148, 52, 110)"></i><i style="background:#6f4070" title="rgb(111, 64, 112)"></i><i style="background:#666666" title="rgb(102, 102, 102)"></i></span></td></tr>
<tr><td><code>Safe</code></td><td>11</td><td><span class="hc-palette"><i style="background:#88ccee" title="rgb(136, 204, 238)"></i><i style="background:#cc6677" title="rgb(204, 102, 119)"></i><i style="background:#ddcc77" title="rgb(221, 204, 119)"></i><i style="background:#117733" title="rgb(17, 119, 51)"></i><i style="background:#332288" title="rgb(51, 34, 136)"></i><i style="background:#aa4499" title="rgb(170, 68, 153)"></i><i style="background:#44aa99" title="rgb(68, 170, 153)"></i><i style="background:#999933" title="rgb(153, 153, 51)"></i><i style="background:#882255" title="rgb(136, 34, 85)"></i><i style="background:#661100" title="rgb(102, 17, 0)"></i><i style="background:#888888" title="rgb(136, 136, 136)"></i></span></td></tr>
<tr><td><code>Vivid</code></td><td>11</td><td><span class="hc-palette"><i style="background:#e58606" title="rgb(229, 134, 6)"></i><i style="background:#5d69b1" title="rgb(93, 105, 177)"></i><i style="background:#52bca3" title="rgb(82, 188, 163)"></i><i style="background:#99c945" title="rgb(153, 201, 69)"></i><i style="background:#cc61b0" title="rgb(204, 97, 176)"></i><i style="background:#24796c" title="rgb(36, 121, 108)"></i><i style="background:#daa51b" title="rgb(218, 165, 27)"></i><i style="background:#2f8ac4" title="rgb(47, 138, 196)"></i><i style="background:#764e9f" title="rgb(118, 78, 159)"></i><i style="background:#ed645a" title="rgb(237, 100, 90)"></i><i style="background:#a5aa99" title="rgb(165, 170, 153)"></i></span></td></tr>
<tr><td><code>Accent</code></td><td>8</td><td><span class="hc-palette"><i style="background:#7fc97f" title="rgb(127,201,127)"></i><i style="background:#beaed4" title="rgb(190,174,212)"></i><i style="background:#fdc086" title="rgb(253,192,134)"></i><i style="background:#ffff99" title="rgb(255,255,153)"></i><i style="background:#386cb0" title="rgb(56,108,176)"></i><i style="background:#f0027f" title="rgb(240,2,127)"></i><i style="background:#bf5b17" title="rgb(191,91,23)"></i><i style="background:#666666" title="rgb(102,102,102)"></i></span></td></tr>
<tr><td><code>Paired</code></td><td>12</td><td><span class="hc-palette"><i style="background:#a6cee3" title="rgb(166,206,227)"></i><i style="background:#1f78b4" title="rgb(31,120,180)"></i><i style="background:#b2df8a" title="rgb(178,223,138)"></i><i style="background:#33a02c" title="rgb(51,160,44)"></i><i style="background:#fb9a99" title="rgb(251,154,153)"></i><i style="background:#e31a1c" title="rgb(227,26,28)"></i><i style="background:#fdbf6f" title="rgb(253,191,111)"></i><i style="background:#ff7f00" title="rgb(255,127,0)"></i><i style="background:#cab2d6" title="rgb(202,178,214)"></i><i style="background:#6a3d9a" title="rgb(106,61,154)"></i><i style="background:#ffff99" title="rgb(255,255,153)"></i><i style="background:#b15928" title="rgb(177,89,40)"></i></span></td></tr>
</tbody>
</table>

## Defaults

A figure that sets neither `layout.template` nor these attributes gets them from the `holochart` template:

<table>
<thead><tr><th>Attribute</th><th>Default</th></tr></thead>
<tbody>
<tr><td><code>layout.colorway</code></td><td><span class="hc-palette"><i style="background:#ea2a37" title="rgb(234, 42, 55)"></i><i style="background:#5e74d5" title="rgb(94, 116, 213)"></i><i style="background:#9962c0" title="rgb(153, 98, 192)"></i><i style="background:#118e36" title="rgb(17, 142, 54)"></i><i style="background:#cc540a" title="rgb(204, 84, 10)"></i><i style="background:#128b8b" title="rgb(18, 139, 139)"></i><i style="background:#997600" title="rgb(153, 118, 0)"></i><i style="background:#b8267e" title="rgb(184, 38, 126)"></i></span></td></tr>
<tr><td><code>layout.colorscale.sequential</code></td><td><span class="hc-colorscale" role="img" aria-label="layout.colorscale.sequential" style="background:linear-gradient(to right,#3a0ca3 0%,#6a00f4 30%,#ff2bd6 60%,#ff9e00 85%,#f9f871 100%)"></span></td></tr>
<tr><td><code>layout.colorscale.sequentialminus</code></td><td><span class="hc-colorscale" role="img" aria-label="layout.colorscale.sequentialminus" style="background:linear-gradient(to right,#c8f7ff 0%,#3fd0e0 15%,#2f7de1 40%,#2a1a8f 70%,#1f2a6b 100%)"></span></td></tr>
<tr><td><code>layout.colorscale.diverging</code></td><td><span class="hc-colorscale" role="img" aria-label="layout.colorscale.diverging" style="background:linear-gradient(to right,#6fe3ff 0%,#2f7de1 25%,#4b475c 50%,#ff2bd6 75%,#ff9e00 100%)"></span></td></tr>
</tbody>
</table>

<!-- generated:colors-gallery:end -->

Other templates set their own colorway and automatic colorscales: see
[Themes & templates](/customization/themes-templates).
