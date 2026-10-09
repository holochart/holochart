---
title: Colors, colorscales & colorbars
description: Color formats, qualitative palettes, colorscales for numeric data, interpolation spaces, and colorbars.
status: complete
---

# Colors, colorscales & colorbars

Holochart colors work like Plotly's: any CSS color string for one color, a **colorway** that
gives each trace its default color, and **colorscales** that map numbers to colors. This page
covers all three, plus the palettes and scales that ship with Holochart and how to add your own.

## Color formats

Every color attribute accepts a CSS color string: a name (`'tomato'`), hex (`'#1f77b4'`,
`'#1f77b480'` with alpha), `rgb()`/`rgba()`, `hsl()`/`hsla()`, or `'transparent'`. Holochart
stores colors in canonical `rgb()`/`rgba()` form in `fullLayout`/`fullData`, so the same color
written two ways compares equal. Attributes marked `arrayOk` (such as `marker.color`) also take
one color per point.

## Colorways and qualitative palettes

`layout.colorway` is the list of default trace colors, used in trace order and cycled when there
are more traces than colors. The default look (the `holochart` template) has eight colors: red
`#ea2a37`, blue `#5e74d5`, indigo `#9962c0`, emerald `#118e36`, orange `#cc540a`, teal `#128b8b`,
gold `#997600` and magenta `#b8267e`. `plotly-classic` (Plotly's look) uses D3's category10, the
same as Plotly.js, and every other [theme](/customization/themes-templates) sets its own.

```ts
import { colorways, QUALITATIVE } from '@mk7s/holochart';

createChart(el, {
  data,
  layout: { colorway: QUALITATIVE.Bold }, // or colorways.get('Bold')
});
```

`QUALITATIVE` holds every palette of plotly.py's `plotly.colors.qualitative`: Plotly, D3, G10,
T10, Alphabet, Dark24, Light24, Set1–3, Pastel1–2, Dark2, Antique, Bold, Pastel, Prism, Safe,
Vivid, Accent and Paired. `colorways.register(name, colors)` adds your own, and
`colorways.get(name)` looks any of them up by name (case-insensitive). `layout.colorway` also
takes a palette's name: `colorway: 'Bold'`. Swatches are in the
[reference](/reference/colorscales#qualitative-palettes).

## Colorscales

A colorscale maps numbers to colors. Pass numbers to a color attribute that supports colorscales
(`marker.color`, `marker.line.color`) and name the scale:

```ts
const temperature = [12.5, 17.1, 21.8, 26.4];

const trace = {
  type: 'scatter',
  mode: 'markers',
  x: [1, 2, 3, 4],
  y: [3, 1, 4, 2],
  marker: { color: temperature, colorscale: 'Viridis', showscale: true },
};
```

`colorscale` takes:

- a **name**, matched case-insensitively: `'Viridis'`, `'thermal'`, `'RdBu'`, …;
- a **reversed name**: add `_r` (`'Viridis_r'`), or set `reversescale: true`;
- a list of colors, spread evenly from 0 to 1: `['#000', 'orange', '#fff']`. A plain list needs
  `autocolorscale: false` next to it: without that, the list is ignored and the automatic
  colorscale is drawn. Names and stops don't need it;
- `[position, color]` stops from 0 to 1: `[[0, 'navy'], [0.8, 'gold'], [1, 'white']]`.

The domain is the data's extent unless you set `cmin`/`cmax`; `cmid` makes an automatic domain
symmetric around a value (for diverging data). Traces that set the same `coloraxis`
(`'coloraxis'`, `'coloraxis2'`, …) share one scale, one domain and one colorbar through
`layout.coloraxis`.

When `colorscale` is not given (`autocolorscale`), the scale is picked from the sign of the
domain: `layout.colorscale.sequential` for values ≥ 0, `sequentialminus` for values ≤ 0, and
`diverging` for domains that cross 0. In the default look, brighter means further from zero:

- `sequential` is a "neon plasma" ramp, from a deep violet (which still shows on the background)
  through violet, magenta and orange to pale yellow;
- `sequentialminus` mirrors it in cool hues, pale cyan at the most negative value fading to a dark
  blue at zero;
- `diverging` has a muted `#4b475c` midpoint, blue to cyan for negative values and magenta to
  orange for positive ones.

With `plotly-classic` (or `template: 'none'`) they are Plotly's `Reds`, `Blues` and `RdBu`, and
other themes set their own (`plotly` uses Plasma, `simple_white` Viridis).

<Example id="scatter/colorscale" />

### Built-in colorscales

Every scale of plotly.py's `plotly.colors` is built in: the plotly.js scales, Plotly3, Viridis,
Cividis, Inferno, Magma, Plasma and Turbo; ColorBrewer's sequential and diverging scales; all of
cmocean and CARTO; and the cyclical Twilight, IceFire, Edge, Phase, HSV, mrybm and mygbm. That
is 94 names, 188 with their `_r` variants. [The reference shows all of them](/reference/colorscales).

A few names exist twice in plotly.py: `plotly.colors.sequential.Blues` is ColorBrewer's 9-class
scale, but the string `'Blues'` has always meant plotly.js's older scale. Holochart keeps
Plotly's meaning for the string (so charts look the same as in Plotly) and exports the other
lists as values: `COLORBREWER_SEQUENTIAL.Blues`, `SEQUENTIAL.Viridis`, and so on.

::: tip Bundle size
The full `@mk7s/holochart` bundle registers every scale and palette. With the runtime and
individual traces only (a
[partial bundle](/getting-started/installation#smaller-bundles-with-partial-packages)), only
the [names every bundle has](/reference/colorscales#partial-bundles) are available until you
call `registerBuiltinColors()` once, or register just the scales you use:
`colors.register('tempo', CMOCEAN_SEQUENTIAL.tempo)`. The data is tree-shaken otherwise, so a
scatter-only page does not ship a hundred colorscales.
:::

### Your own colorscales

```ts
import { colors } from '@mk7s/holochart';

colors.register('Brand', ['#0b1f3a', '#1d6fa5', '#9ad0ec']);
colors.register('Traffic', [
  [0, 'seagreen'],
  [0.6, 'gold'],
  [1, 'crimson'],
]);

// Then, anywhere: marker: { color: values, colorscale: 'Brand' }  (or 'Brand_r')
```

Registering a name that exists replaces it (names are case-insensitive). `register` returns a
function that unregisters the scale. `colors.get(name)` returns a scale's stops, `colors.names()`
lists every name, and `colors.reverse(stops)` mirrors a scale.

### Interpolation spaces

Between stops, Plotly interpolates colors in sRGB, and so does Holochart by default. sRGB
midpoints of distant colors are often dull or dark (red to blue passes through a muddy purple).
`layout.colorscaleInterpolation` picks another space for every colorscale in the chart:

| Value   | Space                                                                      |
| ------- | -------------------------------------------------------------------------- |
| `rgb`   | sRGB, as Plotly (default)                                                  |
| `oklab` | [Oklab](https://bottosson.github.io/posts/oklab/): perceptually even steps |
| `lab`   | CIE L\*a\*b\* (D65)                                                        |
| `hcl`   | CIE LCh: Lab in polar form, hue along the shorter arc; keeps saturation    |

```ts
createChart(el, { data, layout: { colorscaleInterpolation: 'oklab' } });
```

The space is baked into the colorscale texture on the GPU, the colorbar and hover colors alike,
so everything matches. For example, the midpoint of black and white is `rgb(128,128,128)` in
sRGB, `rgb(99,99,99)` in Oklab and `rgb(119,119,119)` in Lab (Lab and Oklab put perceptual middle
gray darker). The same ramps in each space:

<!-- interpolation:start (generated) -->
<table class="hc-swatches">
<thead><tr><th>Scale</th><th><code>rgb</code></th><th><code>oklab</code></th><th><code>lab</code></th><th><code>hcl</code></th></tr></thead>
<tbody>
<tr><td>red → blue</td><td><span class="hc-swatch" title="red → blue (rgb)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#ff0000 0%,#fa0005 2.08%,#f4000b 4.17%,#ef0010 6.25%,#ea0015 8.33%,#e4001b 10.42%,#df0020 12.5%,#da0025 14.58%,#d5002b 16.67%,#cf0030 18.75%,#ca0035 20.83%,#c5003a 22.92%,#bf0040 25%,#ba0045 27.08%,#b5004a 29.17%,#af0050 31.25%,#aa0055 33.33%,#a5005a 35.42%,#9f0060 37.5%,#9a0065 39.58%,#95006a 41.67%,#8f0070 43.75%,#8a0075 45.83%,#85007a 47.92%,#800080 50%,#7a0085 52.08%,#75008a 54.17%,#70008f 56.25%,#6a0095 58.33%,#65009a 60.42%,#60009f 62.5%,#5a00a5 64.58%,#5500aa 66.67%,#5000af 68.75%,#4a00b5 70.83%,#4500ba 72.92%,#4000bf 75%,#3a00c5 77.08%,#3500ca 79.17%,#3000cf 81.25%,#2a00d5 83.33%,#2500da 85.42%,#2000df 87.5%,#1b00e4 89.58%,#1500ea 91.67%,#1000ef 93.75%,#0b00f4 95.83%,#0500fa 97.92%,#0000ff 100%)"></span></td><td><span class="hc-swatch" title="red → blue (oklab)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#ff0000 0%,#fa151b 2.08%,#f52029 4.17%,#f12833 6.25%,#ec2e3c 8.33%,#e73344 10.42%,#e2384b 12.5%,#de3c51 14.58%,#d93f57 16.67%,#d4425d 18.75%,#cf4563 20.83%,#cb4768 22.92%,#c6496d 25%,#c14b72 27.08%,#bc4c77 29.17%,#b84e7b 31.25%,#b34f80 33.33%,#ae5085 35.42%,#a95189 37.5%,#a4528d 39.58%,#a05292 41.67%,#9b5396 43.75%,#96539a 45.83%,#91539e 47.92%,#8c53a2 50%,#8853a6 52.08%,#8353aa 54.17%,#7e52ae 56.25%,#7952b2 58.33%,#7451b6 60.42%,#6f50ba 62.5%,#6a4fbe 64.58%,#654ec2 66.67%,#604cc6 68.75%,#5b4bca 70.83%,#5649ce 72.92%,#5147d2 75%,#4b45d5 77.08%,#4643d9 79.17%,#4140dd 81.25%,#3b3de1 83.33%,#3639e5 85.42%,#3036e8 87.5%,#2a31ec 89.58%,#232cf0 91.67%,#1d26f4 93.75%,#151ef7 95.83%,#0b13fb 97.92%,#0000ff 100%)"></span></td><td><span class="hc-swatch" title="red → blue (lab)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#ff0000 0%,#fd000d 2.08%,#fb0017 4.17%,#fa001f 6.25%,#f80025 8.33%,#f6002b 10.42%,#f40031 12.5%,#f20036 14.58%,#f0003c 16.67%,#ee0041 18.75%,#ec0046 20.83%,#ea004b 22.92%,#e80050 25%,#e60054 27.08%,#e40059 29.17%,#e1005e 31.25%,#df0063 33.33%,#dd0067 35.42%,#da006c 37.5%,#d70071 39.58%,#d50076 41.67%,#d2007a 43.75%,#cf007f 45.83%,#cc0084 47.92%,#ca0088 50%,#c6008d 52.08%,#c30092 54.17%,#c00097 56.25%,#bc009c 58.33%,#b900a0 60.42%,#b500a5 62.5%,#b100aa 64.58%,#ad00af 66.67%,#a900b4 68.75%,#a400b9 70.83%,#9f00be 72.92%,#9a00c3 75%,#9500c8 77.08%,#8f00cc 79.17%,#8900d1 81.25%,#8200d6 83.33%,#7b00db 85.42%,#7300e0 87.5%,#6a00e6 89.58%,#6000eb 91.67%,#5400f0 93.75%,#4500f5 95.83%,#3000fa 97.92%,#0000ff 100%)"></span></td><td><span class="hc-swatch" title="red → blue (hcl)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#ff0000 0%,#ff000a 2.08%,#ff0012 4.17%,#ff0019 6.25%,#ff001f 8.33%,#ff0024 10.42%,#ff0029 12.5%,#ff002e 14.58%,#ff0032 16.67%,#ff0037 18.75%,#ff003c 20.83%,#ff0040 22.92%,#ff0045 25%,#ff0049 27.08%,#ff004e 29.17%,#ff0053 31.25%,#ff0058 33.33%,#ff005c 35.42%,#ff0061 37.5%,#ff0066 39.58%,#ff006b 41.67%,#ff0071 43.75%,#ff0076 45.83%,#fd007b 47.92%,#fa0080 50%,#f80086 52.08%,#f5008b 54.17%,#f10091 56.25%,#ee0096 58.33%,#ea009c 60.42%,#e600a1 62.5%,#e100a7 64.58%,#dc00ac 66.67%,#d700b2 68.75%,#d200b8 70.83%,#cc00bd 72.92%,#c500c3 75%,#be00c8 77.08%,#b700ce 79.17%,#af00d3 81.25%,#a600d8 83.33%,#9c00de 85.42%,#9200e3 87.5%,#8600e8 89.58%,#7900ed 91.67%,#6900f1 93.75%,#5700f6 95.83%,#3d00fb 97.92%,#0000ff 100%)"></span></td></tr>
<tr><td>black → yellow</td><td><span class="hc-swatch" title="black → yellow (rgb)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#000000 0%,#050500 2.08%,#0b0b00 4.17%,#101000 6.25%,#151500 8.33%,#1b1b00 10.42%,#202000 12.5%,#252500 14.58%,#2b2b00 16.67%,#303000 18.75%,#353500 20.83%,#3a3a00 22.92%,#404000 25%,#454500 27.08%,#4a4a00 29.17%,#505000 31.25%,#555500 33.33%,#5a5a00 35.42%,#606000 37.5%,#656500 39.58%,#6a6a00 41.67%,#707000 43.75%,#757500 45.83%,#7a7a00 47.92%,#808000 50%,#858500 52.08%,#8a8a00 54.17%,#8f8f00 56.25%,#959500 58.33%,#9a9a00 60.42%,#9f9f00 62.5%,#a5a500 64.58%,#aaaa00 66.67%,#afaf00 68.75%,#b5b500 70.83%,#baba00 72.92%,#bfbf00 75%,#c5c500 77.08%,#caca00 79.17%,#cfcf00 81.25%,#d5d500 83.33%,#dada00 85.42%,#dfdf00 87.5%,#e4e400 89.58%,#eaea00 91.67%,#efef00 93.75%,#f4f400 95.83%,#fafa00 97.92%,#ffff00 100%)"></span></td><td><span class="hc-swatch" title="black → yellow (oklab)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#000000 0%,#000000 2.08%,#000000 4.17%,#010100 6.25%,#020200 8.33%,#040400 10.42%,#060600 12.5%,#0a0a00 14.58%,#0f0f00 16.67%,#131300 18.75%,#181800 20.83%,#1d1d00 22.92%,#222200 25%,#272700 27.08%,#2c2c00 29.17%,#313100 31.25%,#363600 33.33%,#3b3b00 35.42%,#414100 37.5%,#464600 39.58%,#4c4c00 41.67%,#525200 43.75%,#575700 45.83%,#5d5d00 47.92%,#636300 50%,#696900 52.08%,#6f6f00 54.17%,#757500 56.25%,#7b7b00 58.33%,#818100 60.42%,#878700 62.5%,#8e8e00 64.58%,#949400 66.67%,#9a9a00 68.75%,#a1a100 70.83%,#a7a700 72.92%,#aeae00 75%,#b4b400 77.08%,#bbbb00 79.17%,#c2c200 81.25%,#c8c800 83.33%,#cfcf00 85.42%,#d6d600 87.5%,#dcdc00 89.58%,#e3e300 91.67%,#eaea00 93.75%,#f1f100 95.83%,#f8f800 97.92%,#ffff00 100%)"></span></td><td><span class="hc-swatch" title="black → yellow (lab)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#000000 0%,#080803 2.08%,#100e05 4.17%,#151408 6.25%,#1a180a 8.33%,#1e1c0d 10.42%,#22200e 12.5%,#262510 14.58%,#2b2911 16.67%,#2f2e12 18.75%,#343213 20.83%,#383714 22.92%,#3d3b15 25%,#424015 27.08%,#464516 29.17%,#4b4917 31.25%,#504e17 33.33%,#555318 35.42%,#5a5819 37.5%,#5f5d19 39.58%,#646219 41.67%,#69671a 43.75%,#6e6c1a 45.83%,#73721a 47.92%,#78771b 50%,#7e7c1b 52.08%,#83811b 54.17%,#88871b 56.25%,#8d8c1b 58.33%,#93921b 60.42%,#98971b 62.5%,#9e9d1b 64.58%,#a3a21b 66.67%,#a9a81a 68.75%,#aead1a 70.83%,#b4b319 72.92%,#b9b919 75%,#bfbe18 77.08%,#c5c417 79.17%,#caca16 81.25%,#d0d015 83.33%,#d6d514 85.42%,#dcdb12 87.5%,#e2e110 89.58%,#e7e70e 91.67%,#eded0b 93.75%,#f3f308 95.83%,#f9f904 97.92%,#ffff00 100%)"></span></td><td><span class="hc-swatch" title="black → yellow (hcl)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#000000 0%,#080803 2.08%,#100e05 4.17%,#151408 6.25%,#1a180a 8.33%,#1e1c0d 10.42%,#22200e 12.5%,#262510 14.58%,#2b2911 16.67%,#2f2e12 18.75%,#343213 20.83%,#383714 22.92%,#3d3b15 25%,#424015 27.08%,#464516 29.17%,#4b4917 31.25%,#504e17 33.33%,#555318 35.42%,#5a5819 37.5%,#5f5d19 39.58%,#646219 41.67%,#69671a 43.75%,#6e6c1a 45.83%,#73721a 47.92%,#78771b 50%,#7e7c1b 52.08%,#83811b 54.17%,#88871b 56.25%,#8d8c1b 58.33%,#93921b 60.42%,#98971b 62.5%,#9e9d1b 64.58%,#a3a21b 66.67%,#a9a81a 68.75%,#aead1a 70.83%,#b4b319 72.92%,#b9b919 75%,#bfbe18 77.08%,#c5c417 79.17%,#caca16 81.25%,#d0d015 83.33%,#d6d514 85.42%,#dcdb12 87.5%,#e2e110 89.58%,#e7e70e 91.67%,#eded0b 93.75%,#f3f308 95.83%,#f9f904 97.92%,#ffff00 100%)"></span></td></tr>
<tr><td>RdBu (plotly.js)</td><td><span class="hc-swatch" title="RdBu (plotly.js) (rgb)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#050aac 0%,#0b12b0 2.08%,#1119b5 4.17%,#1721b9 6.25%,#1d28be 8.33%,#2330c2 10.42%,#2937c7 12.5%,#2f3fcb 14.58%,#3546d0 16.67%,#3b4ed4 18.75%,#4156d9 20.83%,#475ddd 22.92%,#4d65e2 25%,#536ce6 27.08%,#5974eb 29.17%,#5f7bef 31.25%,#6583f3 33.33%,#6c8af5 35.42%,#7892ee 37.5%,#8499e6 39.58%,#8fa1de 41.67%,#9ba8d6 43.75%,#a7afce 45.83%,#b2b7c6 47.92%,#bebebe 50%,#c4bab2 52.08%,#cbb6a6 54.17%,#d1b29a 56.25%,#d7ad8e 58.33%,#dca982 60.42%,#dfa47a 62.5%,#e19f71 64.58%,#e39968 66.67%,#e5945f 68.75%,#e58d58 70.83%,#e18454 72.92%,#dd7a4f 75%,#da714a 77.08%,#d66846 79.17%,#d35e41 81.25%,#cf553d 83.33%,#cb4c38 85.42%,#c84234 87.5%,#c4392f 89.58%,#c0302a 91.67%,#bd2626 93.75%,#b91d21 95.83%,#b6131d 97.92%,#b20a18 100%)"></span></td><td><span class="hc-swatch" title="RdBu (plotly.js) (oklab)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#050aac 0%,#071ab1 2.08%,#0b24b5 4.17%,#102dba 6.25%,#1635be 8.33%,#1c3dc3 10.42%,#2244c7 12.5%,#284bcc 14.58%,#2f52d0 16.67%,#3558d5 18.75%,#3c5fd9 20.83%,#4265dd 22.92%,#496be2 25%,#5072e6 27.08%,#5778eb 29.17%,#5d7eef 31.25%,#6484f3 33.33%,#6c8bf6 35.42%,#7793ef 37.5%,#839be8 39.58%,#8ea3e0 41.67%,#9aaad8 43.75%,#a6b1d0 45.83%,#b2b8c7 47.92%,#bebebe 50%,#c5bab2 52.08%,#cbb6a7 54.17%,#d1b29b 56.25%,#d7ae8e 58.33%,#dca982 60.42%,#dfa47a 62.5%,#e19f71 64.58%,#e39a69 66.67%,#e59460 68.75%,#e58e58 70.83%,#e28754 72.92%,#de7f4f 75%,#db784a 77.08%,#d87046 79.17%,#d46841 81.25%,#d1603d 83.33%,#cd5938 85.42%,#c95034 87.5%,#c6482f 89.58%,#c23f2b 91.67%,#be3526 93.75%,#ba2b22 95.83%,#b61e1d 97.92%,#b20a18 100%)"></span></td><td><span class="hc-swatch" title="RdBu (plotly.js) (lab)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#050aac 0%,#1615b0 2.08%,#201fb5 4.17%,#2827b9 6.25%,#2f2ebe 8.33%,#3536c2 10.42%,#3b3dc7 12.5%,#4144cb 14.58%,#464bcf 16.67%,#4a52d4 18.75%,#4f59d8 20.83%,#5360dd 22.92%,#5767e1 25%,#5c6ee6 27.08%,#6075ea 29.17%,#637cef 31.25%,#6783f3 33.33%,#6e8af5 35.42%,#7e91ee 37.5%,#8c99e6 39.58%,#98a0de 41.67%,#a3a7d6 43.75%,#adafce 45.83%,#b6b6c6 47.92%,#bebebe 50%,#c6bab2 52.08%,#cdb6a6 54.17%,#d3b29a 56.25%,#d8ad8e 58.33%,#dda982 60.42%,#dfa47a 62.5%,#e19f71 64.58%,#e39968 66.67%,#e5945f 68.75%,#e58e58 70.83%,#e28753 72.92%,#de7f4e 75%,#db7849 77.08%,#d87045 79.17%,#d46840 81.25%,#d1613b 83.33%,#cd5936 85.42%,#c95032 87.5%,#c6482d 89.58%,#c23f29 91.67%,#be3525 93.75%,#ba2b20 95.83%,#b61e1c 97.92%,#b20a18 100%)"></span></td><td><span class="hc-swatch" title="RdBu (plotly.js) (hcl)" style="display:block;height:18px;border-radius:3px;background:linear-gradient(to right,#050aac 0%,#0e17b1 2.08%,#1620b6 4.17%,#1d28bb 6.25%,#2330c0 8.33%,#2838c5 10.42%,#2e3fc9 12.5%,#3346ce 14.58%,#394dd3 16.67%,#3e54d7 18.75%,#435bdb 20.83%,#4962e0 22.92%,#4e68e4 25%,#546fe8 27.08%,#5a76ec 29.17%,#5f7df0 31.25%,#6584f4 33.33%,#6e8af5 35.42%,#7e91ee 37.5%,#8c99e6 39.58%,#98a0de 41.67%,#a3a7d6 43.75%,#adafce 45.83%,#b6b6c6 47.92%,#bebebe 50%,#c6bab2 52.08%,#cdb6a6 54.17%,#d3b29a 56.25%,#d8ad8e 58.33%,#dca982 60.42%,#dfa479 62.5%,#e19f70 64.58%,#e39a67 66.67%,#e5945f 68.75%,#e58e58 70.83%,#e18751 72.92%,#de804c 75%,#da7846 77.08%,#d77141 79.17%,#d4693b 81.25%,#d06136 83.33%,#cc5932 85.42%,#c9512d 87.5%,#c54929 89.58%,#c14025 91.67%,#be3621 93.75%,#ba2b1e 95.83%,#b61e1b 97.92%,#b20a18 100%)"></span></td></tr>
</tbody>
</table>
<!-- interpolation:end -->

## Colorbars

`marker.showscale: true` draws a colorbar for the trace's colorscale (a color axis draws one for
all its traces). `marker.colorbar` takes the whole axis tick API (`dtick`, `tickformat`,
`ticksuffix`, …) plus `title`, `orientation` (`'v'` or `'h'`), `thickness`, `len`, position
(`x`, `y`, anchors and refs) and outline/border/background styling. Themes style colorbars too:
`plotly` removes the outline and ticks, `simple_white` draws outside ticks.

## Swatches

[Colorscales & palettes](/reference/colorscales) shows every built-in colorscale and palette
with a swatch drawn from its stops. That page is generated from the color registries, and it
also lists the names that have two definitions and which one a name resolves to.

## Not supported

- Holochart has no colorblind-safety checker: nothing warns when adjacent colorway colors are
  hard to tell apart under deuteranopia. The `Safe` palette and the
  [accessibility guide](/guides/accessibility) cover colorblind-safe colors.

See also: [Styling & themes](/fundamentals/styling-themes),
[Themes & templates](/customization/themes-templates), and the
[colorscales gallery](/reference/colorscales).
