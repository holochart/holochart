---
title: Marker symbols
description: Every built-in marker symbol with its shape, numeric codes and variants, generated from the symbol table, and the trace types that take them.
status: complete
---

# Marker symbols

Every value of `marker.symbol` that is built in. The lists on this page are generated from the
symbol table the renderer draws from, which follows plotly.js' symbol order and numbering.

<!-- generated:symbols-summary:start -->

Holochart has **55** marker symbols. Each has 4 variants, the plain symbol and `-open`, `-dot`, `-open-dot`, which makes **220** names.

Every name also has a numeric code. The plain symbols are numbered 0 to 54 in the order of the table below, and each variant adds 100: `arrow-wide` is 54, `arrow-wide-open` is 154, `arrow-wide-dot` is 254, `arrow-wide-open-dot` is 354.

<!-- generated:symbols-summary:end -->

The chart below draws all of them with `marker.symbol`. Hover a marker for its name and code.

<Example id="scatter/marker-symbols" />

## Using a symbol

Set `marker.symbol` to a name or a code, for the whole trace or with one value per point:

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x: [1, 2, 3, 4],
      y: [2, 3, 1, 4],
      marker: {
        // 317 is 'star-open-dot'.
        symbol: ['diamond', 'diamond-open', 'star-dot', 317],
        size: 14,
        color: '#5e74d5',
        line: { width: 1, color: '#eceef4' },
      },
    },
  ],
});
```

- The default is `'circle'`.
- Names are lower case. A code can also be given as a string: `'317'`.
- A value for the whole trace that the trace type does not accept is reported as an invalid
  `marker.symbol`, and the trace draws circles. The entries of a per-point array are not
  checked: an unknown name draws a circle.

The variants differ in what `marker.color` and `marker.line` paint:

| Variant     | Fill           | Outline and inner lines                                             | Dot                 |
| ----------- | -------------- | ------------------------------------------------------------------- | ------------------- |
| plain       | `marker.color` | `marker.line.color`, `marker.line.width` wide                       | none                |
| `-open`     | none           | `marker.color`, `marker.line.width` wide or 1 px, whichever is more | none                |
| `-dot`      | `marker.color` | as the plain symbol                                                 | `marker.line.color` |
| `-open-dot` | none           | as `-open`                                                          | `marker.color`      |

In the default look `marker.line.width` is 0, so a plain symbol has no outline until you set a
width.

## Trace types

<!-- generated:symbols-traces:start -->

| Trace types                                                                                             | Attribute       | Symbols                                                                                      | Numeric codes | One per point | Custom symbols |
| ------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------- | ------------- | ------------- | -------------- |
| [`scatter`](/reference/scatter), [`splom`](/reference/splom), [`scatterpolar`](/reference/scatterpolar) | `marker.symbol` | All 220 names                                                                                | Yes           | Yes           | Yes            |
| [`box`](/reference/box), [`violin`](/reference/violin)                                                  | `marker.symbol` | All 220 names                                                                                | Yes           | No            | Yes            |
| [`scatter3d`](/reference/scatter3d)                                                                     | `marker.symbol` | 8: `circle`, `circle-open`, `cross`, `diamond`, `diamond-open`, `square`, `square-open`, `x` | No            | Yes           | No             |

<!-- generated:symbols-traces:end -->

Custom symbols are registered names and `text:` glyphs: see [Custom symbols](#custom-symbols).

## All symbols

**Shape** is drawn from the symbol's geometry, all at the same scale: the filled area is shaded
and the lines are what `marker.line` strokes. The `arrow` symbols have their tip on the data
point, so they extend to one side of it.

<!-- generated:symbols-table:start -->

<table>
<thead><tr><th>Shape</th><th>Name</th><th>Code</th><th><code>-open</code></th><th><code>-dot</code></th><th><code>-open-dot</code></th><th>Notes</th></tr></thead>
<tbody>
<tr><td><svg class="hc-symbol" role="img" aria-label="circle" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><circle r="1"/></svg></td><td><code>circle</code></td><td>0</td><td>100</td><td>200</td><td>300</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="square" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1 1L1 1L1 -1L-1 -1Z" fill-rule="evenodd"/></svg></td><td><code>square</code></td><td>1</td><td>101</td><td>201</td><td>301</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="diamond" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.3 0L0 -1.3L-1.3 0L0 1.3Z" fill-rule="evenodd"/></svg></td><td><code>diamond</code></td><td>2</td><td>102</td><td>202</td><td>302</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="cross" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0.4 -1.2L0.4 -0.4L1.2 -0.4L1.2 0.4L0.4 0.4L0.4 1.2L-0.4 1.2L-0.4 0.4L-1.2 0.4L-1.2 -0.4L-0.4 -0.4L-0.4 -1.2Z" fill-rule="evenodd"/></svg></td><td><code>cross</code></td><td>3</td><td>103</td><td>203</td><td>303</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="x" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-0.566 -1.131L0 -0.566L0.566 -1.131L1.131 -0.566L0.566 0L1.131 0.566L0.566 1.131L0 0.566L-0.566 1.131L-1.131 0.566L-0.566 0L-1.131 -0.566Z" fill-rule="evenodd"/></svg></td><td><code>x</code></td><td>4</td><td>104</td><td>204</td><td>304</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-up" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1.155 0.5L1.155 0.5L0 -1Z" fill-rule="evenodd"/></svg></td><td><code>triangle-up</code></td><td>5</td><td>105</td><td>205</td><td>305</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-down" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1.155 -0.5L1.155 -0.5L0 1Z" fill-rule="evenodd"/></svg></td><td><code>triangle-down</code></td><td>6</td><td>106</td><td>206</td><td>306</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-left" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0.5 1.155L0.5 -1.155L-1 0Z" fill-rule="evenodd"/></svg></td><td><code>triangle-left</code></td><td>7</td><td>107</td><td>207</td><td>307</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-right" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-0.5 1.155L-0.5 -1.155L1 0Z" fill-rule="evenodd"/></svg></td><td><code>triangle-right</code></td><td>8</td><td>108</td><td>208</td><td>308</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-ne" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1.2 -0.6L0.6 -0.6L0.6 1.2Z" fill-rule="evenodd"/></svg></td><td><code>triangle-ne</code></td><td>9</td><td>109</td><td>209</td><td>309</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-se" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1.2 0.6L0.6 0.6L0.6 -1.2Z" fill-rule="evenodd"/></svg></td><td><code>triangle-se</code></td><td>10</td><td>110</td><td>210</td><td>310</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-sw" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.2 0.6L-0.6 0.6L-0.6 -1.2Z" fill-rule="evenodd"/></svg></td><td><code>triangle-sw</code></td><td>11</td><td>111</td><td>211</td><td>311</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="triangle-nw" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.2 -0.6L-0.6 -0.6L-0.6 1.2Z" fill-rule="evenodd"/></svg></td><td><code>triangle-nw</code></td><td>12</td><td>112</td><td>212</td><td>312</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="pentagon" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 -1L-0.951 -0.309L-0.588 0.809L0.588 0.809L0.951 -0.309Z" fill-rule="evenodd"/></svg></td><td><code>pentagon</code></td><td>13</td><td>113</td><td>213</td><td>313</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="hexagon" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 -1L-0.866 -0.5L-0.866 0.5L0 1L0.866 0.5L0.866 -0.5Z" fill-rule="evenodd"/></svg></td><td><code>hexagon</code></td><td>14</td><td>114</td><td>214</td><td>314</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="hexagon2" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1 0L0.5 -0.866L-0.5 -0.866L-1 0L-0.5 0.866L0.5 0.866Z" fill-rule="evenodd"/></svg></td><td><code>hexagon2</code></td><td>15</td><td>115</td><td>215</td><td>315</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="octagon" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0.924 -0.383L0.383 -0.924L-0.383 -0.924L-0.924 -0.383L-0.924 0.383L-0.383 0.924L0.383 0.924L0.924 0.383Z" fill-rule="evenodd"/></svg></td><td><code>octagon</code></td><td>16</td><td>116</td><td>216</td><td>316</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="star" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 -1.4L-0.314 -0.433L-1.331 -0.433L-0.509 0.165L-0.823 1.133L0 0.535L0.823 1.133L0.509 0.165L1.331 -0.433L0.314 -0.433Z" fill-rule="evenodd"/></svg></td><td><code>star</code></td><td>17</td><td>117</td><td>217</td><td>317</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="hexagram" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 -1.32L-0.38 -0.658L-1.143 -0.66L-0.76 0L-1.143 0.66L-0.38 0.658L0 1.32L0.38 0.658L1.143 0.66L0.76 0L1.143 -0.66L0.38 -0.658Z" fill-rule="evenodd"/></svg></td><td><code>hexagram</code></td><td>18</td><td>118</td><td>218</td><td>318</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="star-triangle-up" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1.386 0.8L-0.935 0.663L-0.471 0.58L0 0.552L0.471 0.58L0.935 0.663L1.386 0.8L1.042 0.478L0.738 0.117L0.478 -0.276L0.267 -0.698L0.107 -1.141L0 -1.6L-0.107 -1.141L-0.267 -0.698L-0.478 -0.276L-0.738 0.117L-1.042 0.478Z" fill-rule="evenodd"/></svg></td><td><code>star-triangle-up</code></td><td>19</td><td>119</td><td>219</td><td>319</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="star-triangle-down" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.386 -0.8L0.935 -0.663L0.471 -0.58L0 -0.552L-0.471 -0.58L-0.935 -0.663L-1.386 -0.8L-1.042 -0.478L-0.738 -0.117L-0.478 0.276L-0.267 0.698L-0.107 1.141L0 1.6L0.107 1.141L0.267 0.698L0.478 0.276L0.738 -0.117L1.042 -0.478Z" fill-rule="evenodd"/></svg></td><td><code>star-triangle-down</code></td><td>20</td><td>120</td><td>220</td><td>320</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="star-square" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1.1 1.1L-0.757 0.919L-0.386 0.808L0 0.77L0.386 0.808L0.757 0.919L1.1 1.1L0.919 0.757L0.808 0.386L0.77 0L0.808 -0.386L0.919 -0.757L1.1 -1.1L0.757 -0.919L0.386 -0.808L0 -0.77L-0.386 -0.808L-0.757 -0.919L-1.1 -1.1L-0.919 -0.757L-0.808 -0.386L-0.77 0L-0.808 0.386L-0.919 0.757Z" fill-rule="evenodd"/></svg></td><td><code>star-square</code></td><td>21</td><td>121</td><td>221</td><td>321</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="star-diamond" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.4 0L1.072 -0.112L0.77 -0.282L0.503 -0.503L0.282 -0.77L0.112 -1.072L0 -1.4L-0.112 -1.072L-0.282 -0.77L-0.503 -0.503L-0.77 -0.282L-1.072 -0.112L-1.4 0L-1.072 0.112L-0.77 0.282L-0.503 0.503L-0.282 0.77L-0.112 1.072L0 1.4L0.112 1.072L0.282 0.77L0.503 0.503L0.77 0.282L1.072 0.112Z" fill-rule="evenodd"/></svg></td><td><code>star-diamond</code></td><td>22</td><td>122</td><td>222</td><td>322</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="diamond-tall" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0.7 0L0 -1.4L-0.7 0L0 1.4Z" fill-rule="evenodd"/></svg></td><td><code>diamond-tall</code></td><td>23</td><td>123</td><td>223</td><td>323</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="diamond-wide" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.4 0L0 -0.7L-1.4 0L0 0.7Z" fill-rule="evenodd"/></svg></td><td><code>diamond-wide</code></td><td>24</td><td>124</td><td>224</td><td>324</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="hourglass" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1 -1L-1 -1L1 1L-1 1Z" fill-rule="evenodd"/></svg></td><td><code>hourglass</code></td><td>25</td><td>125</td><td>225</td><td>325</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="bowtie" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1 -1L1 1L-1 -1L-1 1Z" fill-rule="evenodd"/></svg></td><td><code>bowtie</code></td><td>26</td><td>126</td><td>226</td><td>326</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="circle-cross" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><circle r="1"/><path d="M0 -1L0 1M1 0L-1 0" fill="none"/></svg></td><td><code>circle-cross</code></td><td>27</td><td>127</td><td>227</td><td>327</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="circle-x" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><circle r="1"/><path d="M0.707 -0.707L-0.707 0.707M0.707 0.707L-0.707 -0.707" fill="none"/></svg></td><td><code>circle-x</code></td><td>28</td><td>128</td><td>228</td><td>328</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="square-cross" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1 1L1 1L1 -1L-1 -1Z" fill-rule="evenodd"/><path d="M0 -1L0 1M1 0L-1 0" fill="none"/></svg></td><td><code>square-cross</code></td><td>29</td><td>129</td><td>229</td><td>329</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="square-x" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1 1L1 1L1 -1L-1 -1Z" fill-rule="evenodd"/><path d="M1 -1L-1 1M1 1L-1 -1" fill="none"/></svg></td><td><code>square-x</code></td><td>30</td><td>130</td><td>230</td><td>330</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="diamond-cross" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.3 0L0 -1.3L-1.3 0L0 1.3Z" fill-rule="evenodd"/><path d="M0 -1.3L0 1.3M1.3 0L-1.3 0" fill="none"/></svg></td><td><code>diamond-cross</code></td><td>31</td><td>131</td><td>231</td><td>331</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="diamond-x" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.3 0L0 -1.3L-1.3 0L0 1.3Z" fill-rule="evenodd"/><path d="M0.65 -0.65L-0.65 0.65M0.65 0.65L-0.65 -0.65" fill="none"/></svg></td><td><code>diamond-x</code></td><td>32</td><td>132</td><td>232</td><td>332</td><td></td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="cross-thin" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 -1.4L0 1.4M1.4 0L-1.4 0" fill="none"/></svg></td><td><code>cross-thin</code></td><td>33</td><td>133</td><td>233</td><td>333</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="x-thin" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1 -1L-1 1M1 1L-1 -1" fill="none"/></svg></td><td><code>x-thin</code></td><td>34</td><td>134</td><td>234</td><td>334</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="asterisk" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 -1.2L0 1.2M1.2 0L-1.2 0M0.85 -0.85L-0.85 0.85M0.85 0.85L-0.85 -0.85" fill="none"/></svg></td><td><code>asterisk</code></td><td>35</td><td>135</td><td>235</td><td>335</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="hash" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0.5 -1L0.5 1M-0.5 1L-0.5 -1M1 -0.5L-1 -0.5M-1 0.5L1 0.5" fill="none"/></svg></td><td><code>hash</code></td><td>36</td><td>136</td><td>236</td><td>336</td><td>Line only</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="y-up" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-1.2 0.8M0 0L1.2 0.8M0 0L0 -1.6" fill="none"/></svg></td><td><code>y-up</code></td><td>37</td><td>137</td><td>237</td><td>337</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="y-down" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-1.2 -0.8M0 0L1.2 -0.8M0 0L0 1.6" fill="none"/></svg></td><td><code>y-down</code></td><td>38</td><td>138</td><td>238</td><td>338</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="y-left" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L0.8 1.2M0 0L0.8 -1.2M0 0L-1.6 0" fill="none"/></svg></td><td><code>y-left</code></td><td>39</td><td>139</td><td>239</td><td>339</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="y-right" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-0.8 1.2M0 0L-0.8 -1.2M0 0L1.6 0" fill="none"/></svg></td><td><code>y-right</code></td><td>40</td><td>140</td><td>240</td><td>340</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="line-ew" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1.4 0L-1.4 0" fill="none"/></svg></td><td><code>line-ew</code></td><td>41</td><td>141</td><td>241</td><td>341</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="line-ns" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 -1.4L0 1.4" fill="none"/></svg></td><td><code>line-ns</code></td><td>42</td><td>142</td><td>242</td><td>342</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="line-ne" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M1 -1L-1 1" fill="none"/></svg></td><td><code>line-ne</code></td><td>43</td><td>143</td><td>243</td><td>343</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="line-nw" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M-1 -1L1 1" fill="none"/></svg></td><td><code>line-nw</code></td><td>44</td><td>144</td><td>244</td><td>344</td><td>Line only, No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-up" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-1 2L1 2Z" fill-rule="evenodd"/></svg></td><td><code>arrow-up</code></td><td>45</td><td>145</td><td>245</td><td>345</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-down" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-1 -2L1 -2Z" fill-rule="evenodd"/></svg></td><td><code>arrow-down</code></td><td>46</td><td>146</td><td>246</td><td>346</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-left" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L2 1L2 -1Z" fill-rule="evenodd"/></svg></td><td><code>arrow-left</code></td><td>47</td><td>147</td><td>247</td><td>347</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-right" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-2 1L-2 -1Z" fill-rule="evenodd"/></svg></td><td><code>arrow-right</code></td><td>48</td><td>148</td><td>248</td><td>348</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-bar-up" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-1 2L1 2Z" fill-rule="evenodd"/><path d="M-1 0L1 0" fill="none"/></svg></td><td><code>arrow-bar-up</code></td><td>49</td><td>149</td><td>249</td><td>349</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-bar-down" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-1 -2L1 -2Z" fill-rule="evenodd"/><path d="M-1 0L1 0" fill="none"/></svg></td><td><code>arrow-bar-down</code></td><td>50</td><td>150</td><td>250</td><td>350</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-bar-left" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L2 1L2 -1Z" fill-rule="evenodd"/><path d="M0 1L0 -1" fill="none"/></svg></td><td><code>arrow-bar-left</code></td><td>51</td><td>151</td><td>251</td><td>351</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-bar-right" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-2 1L-2 -1Z" fill-rule="evenodd"/><path d="M0 1L0 -1" fill="none"/></svg></td><td><code>arrow-bar-right</code></td><td>52</td><td>152</td><td>252</td><td>352</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-1 2L0 1.4L1 2Z" fill-rule="evenodd"/></svg></td><td><code>arrow</code></td><td>53</td><td>153</td><td>253</td><td>353</td><td>No dot</td></tr>
<tr><td><svg class="hc-symbol" role="img" aria-label="arrow-wide" width="28" height="28" viewBox="-2.2 -2.2 4.4 4.4" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.2" stroke-linejoin="round"><path d="M0 0L-2 2L0 1.4L2 2Z" fill-rule="evenodd"/></svg></td><td><code>arrow-wide</code></td><td>54</td><td>154</td><td>254</td><td>354</td><td>No dot</td></tr>
</tbody>
</table>

<!-- generated:symbols-table:end -->

Two notes apply to some symbols:

- **Line only**: the symbol has no area to fill. The plain symbol is drawn with `marker.line`
  alone, so it is invisible while `marker.line.width` is 0, which is the default. Set a line
  width, or use the `-open` name, which draws the lines in `marker.color`.
- **No dot**: the `-dot` and `-open-dot` names and codes are valid, but draw no dot. They look
  like the plain and the `-open` symbol.

## Custom symbols

`symbols.register` turns an SVG path into a symbol name with the same three variants, and
`'text:…'` draws a character or an emoji as the marker. Both are covered in
[Custom markers](/customization/custom-markers). Registered names are not listed on this page:
`symbols.names()` returns them at run time.

## Related

- Line dash styles (`line.dash`): [Line charts](/charts/basic/line).
- Pattern fills for bars, slices and areas (`marker.pattern`, `fillpattern`):
  [Patterns & textures](/customization/markers-patterns).
- 3D markers: [3D scatter](/charts/3d/scatter3d).
