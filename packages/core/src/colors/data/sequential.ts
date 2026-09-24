/**
 * plotly.py's own sequential color lists from `plotly.colors.sequential` (plotly.py 5.18), excluding
 * the ColorBrewer, cmocean and CARTO scales it re-exports (see `colorbrewer.ts`, `cmocean.ts`,
 * `carto.ts`). Viridis/Cividis/Inferno/Magma/Plasma come from matplotlib (CC0), Turbo from Google
 * (Apache-2.0), and Rainbow/Blackbody/Bluered/Electric/Hot/Jet/Picnic/Portland are the evenly
 * spaced list versions of plotly.js scales from plotly.py's `plotlyjs.py`. Picnic and Portland
 * are listed under `plotly.colors.diverging` upstream.
 */

/** Plotly3 (plotly.py), 13 colors. */
export const Plotly3: readonly string[] = [
  '#0508b8',
  '#1910d8',
  '#3c19f0',
  '#6b1cfb',
  '#981cfd',
  '#bf1cfd',
  '#dd2bfd',
  '#f246fe',
  '#fc67fd',
  '#fe88fc',
  '#fea5fd',
  '#febefe',
  '#fec3fe',
];

/** Viridis (matplotlib), 10 colors. */
export const Viridis: readonly string[] = [
  '#440154',
  '#482878',
  '#3e4989',
  '#31688e',
  '#26828e',
  '#1f9e89',
  '#35b779',
  '#6ece58',
  '#b5de2b',
  '#fde725',
];

/** Cividis (matplotlib), 10 colors. */
export const Cividis: readonly string[] = [
  '#00224e',
  '#123570',
  '#3b496c',
  '#575d6d',
  '#707173',
  '#8a8678',
  '#a59c74',
  '#c3b369',
  '#e1cc55',
  '#fee838',
];

/** Inferno (matplotlib), 10 colors. */
export const Inferno: readonly string[] = [
  '#000004',
  '#1b0c41',
  '#4a0c6b',
  '#781c6d',
  '#a52c60',
  '#cf4446',
  '#ed6925',
  '#fb9b06',
  '#f7d13d',
  '#fcffa4',
];

/** Magma (matplotlib), 10 colors. */
export const Magma: readonly string[] = [
  '#000004',
  '#180f3d',
  '#440f76',
  '#721f81',
  '#9e2f7f',
  '#cd4071',
  '#f1605d',
  '#fd9668',
  '#feca8d',
  '#fcfdbf',
];

/** Plasma (matplotlib), 10 colors. */
export const Plasma: readonly string[] = [
  '#0d0887',
  '#46039f',
  '#7201a8',
  '#9c179e',
  '#bd3786',
  '#d8576b',
  '#ed7953',
  '#fb9f3a',
  '#fdca26',
  '#f0f921',
];

/** Turbo (Google), 15 colors. */
export const Turbo: readonly string[] = [
  '#30123b',
  '#4145ab',
  '#4675ed',
  '#39a2fc',
  '#1bcfd4',
  '#24eca6',
  '#61fc6c',
  '#a4fc3b',
  '#d1e834',
  '#f3c63a',
  '#fe9b2d',
  '#f36315',
  '#d93806',
  '#b11901',
  '#7a0402',
];

/** Rainbow (plotly.js), 9 colors. */
export const Rainbow: readonly string[] = [
  'rgb(150,0,90)',
  'rgb(0,0,200)',
  'rgb(0,25,255)',
  'rgb(0,152,255)',
  'rgb(44,255,150)',
  'rgb(151,255,0)',
  'rgb(255,234,0)',
  'rgb(255,111,0)',
  'rgb(255,0,0)',
];

/** Blackbody (plotly.js), 5 colors. */
export const Blackbody: readonly string[] = [
  'rgb(0,0,0)',
  'rgb(230,0,0)',
  'rgb(230,210,0)',
  'rgb(255,255,255)',
  'rgb(160,200,255)',
];

/** Bluered (plotly.js), 2 colors. */
export const Bluered: readonly string[] = ['rgb(0,0,255)', 'rgb(255,0,0)'];

/** Electric (plotly.js), 6 colors. */
export const Electric: readonly string[] = [
  'rgb(0,0,0)',
  'rgb(30,0,100)',
  'rgb(120,0,100)',
  'rgb(160,90,0)',
  'rgb(230,200,0)',
  'rgb(255,250,220)',
];

/** Hot (plotly.js), 4 colors. */
export const Hot: readonly string[] = [
  'rgb(0,0,0)',
  'rgb(230,0,0)',
  'rgb(255,210,0)',
  'rgb(255,255,255)',
];

/** Jet (plotly.js), 6 colors. */
export const Jet: readonly string[] = [
  'rgb(0,0,131)',
  'rgb(0,60,170)',
  'rgb(5,255,255)',
  'rgb(255,255,0)',
  'rgb(250,0,0)',
  'rgb(128,0,0)',
];

/** Picnic (plotly.js), diverging, 11 colors. */
export const Picnic: readonly string[] = [
  'rgb(0,0,255)',
  'rgb(51,153,255)',
  'rgb(102,204,255)',
  'rgb(153,204,255)',
  'rgb(204,204,255)',
  'rgb(255,255,255)',
  'rgb(255,204,255)',
  'rgb(255,153,255)',
  'rgb(255,102,204)',
  'rgb(255,102,102)',
  'rgb(255,0,0)',
];

/** Portland (plotly.js), diverging, 5 colors. */
export const Portland: readonly string[] = [
  'rgb(12,51,131)',
  'rgb(10,136,186)',
  'rgb(242,211,56)',
  'rgb(242,143,56)',
  'rgb(217,30,30)',
];

/** plotly.py's own sequential scales by name. */
export const SEQUENTIAL: Readonly<Record<string, readonly string[]>> = {
  Plotly3,
  Viridis,
  Cividis,
  Inferno,
  Magma,
  Plasma,
  Turbo,
  Rainbow,
  Blackbody,
  Bluered,
  Electric,
  Hot,
  Jet,
};

/** plotly.js-derived diverging scales (plotly.colors.diverging). */
export const DIVERGING_PLOTLY: Readonly<Record<string, readonly string[]>> = {
  Picnic,
  Portland,
};
