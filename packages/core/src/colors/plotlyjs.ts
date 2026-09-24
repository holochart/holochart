/**
 * Plotly.js's named colorscales (`plotly.js/src/components/colorscale/scales.js`), plus `Plasma`
 * (the sequential scale of Plotly's default template), with their exact stop positions.
 *
 * These are the names a string `colorscale` has always resolved to, in Plotly and in Holochart, so
 * they are always available: the colorscale lookup ({@link getColorscale}) falls back to this table
 * without any registration. They are small (about 2 kB gzipped) and core + scatter already paid for
 * them before E8.2. Every other built-in scale (plan E8.2: cmocean, carto, ColorBrewer, …) lives in
 * `colors/data/` and is registered on demand ({@link registerBuiltinColors}), so a scatter-only page
 * does not ship them.
 *
 * Where plotly.py has a list with the same name (`plotly.colors.sequential.Blues` is the ColorBrewer
 * 9-class scale, the string `'Blues'` is plotly.js's scale below), the string keeps plotly.js's
 * meaning, as in Plotly.
 */

/** A colorscale as `[position, CSS color]` stops, positions from 0 to 1 in order. */
export type ColorscaleStops = readonly (readonly [number, string])[];

const rgb = (r: number, g: number, b: number): string => `rgb(${r},${g},${b})`;

/** Evenly spaced stops from a list of colors. */
export function evenStops(colors: readonly string[]): ColorscaleStops {
  const n = colors.length;
  return colors.map((c, i) => [n > 1 ? i / (n - 1) : 0, c] as const);
}

/** Plotly.js's named colorscales, by their canonical names. */
export const PLOTLYJS_COLORSCALES: Readonly<Record<string, ColorscaleStops>> = {
  Greys: [
    [0, rgb(0, 0, 0)],
    [1, rgb(255, 255, 255)],
  ],
  YlGnBu: evenStops([
    rgb(8, 29, 88),
    rgb(37, 52, 148),
    rgb(34, 94, 168),
    rgb(29, 145, 192),
    rgb(65, 182, 196),
    rgb(127, 205, 187),
    rgb(199, 233, 180),
    rgb(237, 248, 217),
    rgb(255, 255, 217),
  ]),
  Greens: evenStops([
    rgb(0, 68, 27),
    rgb(0, 109, 44),
    rgb(35, 139, 69),
    rgb(65, 171, 93),
    rgb(116, 196, 118),
    rgb(161, 217, 155),
    rgb(199, 233, 192),
    rgb(229, 245, 224),
    rgb(247, 252, 245),
  ]),
  YlOrRd: evenStops([
    rgb(128, 0, 38),
    rgb(189, 0, 38),
    rgb(227, 26, 28),
    rgb(252, 78, 42),
    rgb(253, 141, 60),
    rgb(254, 178, 76),
    rgb(254, 217, 118),
    rgb(255, 237, 160),
    rgb(255, 255, 204),
  ]),
  Bluered: [
    [0, rgb(0, 0, 255)],
    [1, rgb(255, 0, 0)],
  ],
  RdBu: [
    [0, rgb(5, 10, 172)],
    [0.35, rgb(106, 137, 247)],
    [0.5, rgb(190, 190, 190)],
    [0.6, rgb(220, 170, 132)],
    [0.7, rgb(230, 145, 90)],
    [1, rgb(178, 10, 24)],
  ],
  Reds: [
    [0, rgb(220, 220, 220)],
    [0.2, rgb(245, 195, 157)],
    [0.4, rgb(245, 160, 105)],
    [1, rgb(178, 10, 24)],
  ],
  Blues: [
    [0, rgb(5, 10, 172)],
    [0.35, rgb(40, 60, 190)],
    [0.5, rgb(70, 100, 245)],
    [0.6, rgb(90, 120, 245)],
    [0.7, rgb(106, 137, 247)],
    [1, rgb(220, 220, 220)],
  ],
  Picnic: evenStops([
    rgb(0, 0, 255),
    rgb(51, 153, 255),
    rgb(102, 204, 255),
    rgb(153, 204, 255),
    rgb(204, 204, 255),
    rgb(255, 255, 255),
    rgb(255, 204, 255),
    rgb(255, 153, 255),
    rgb(255, 102, 204),
    rgb(255, 102, 102),
    rgb(255, 0, 0),
  ]),
  Rainbow: evenStops([
    rgb(150, 0, 90),
    rgb(0, 0, 200),
    rgb(0, 25, 255),
    rgb(0, 152, 255),
    rgb(44, 255, 150),
    rgb(151, 255, 0),
    rgb(255, 234, 0),
    rgb(255, 111, 0),
    rgb(255, 0, 0),
  ]),
  Portland: evenStops([
    rgb(12, 51, 131),
    rgb(10, 136, 186),
    rgb(242, 211, 56),
    rgb(242, 143, 56),
    rgb(217, 30, 30),
  ]),
  Jet: [
    [0, rgb(0, 0, 131)],
    [0.125, rgb(0, 60, 170)],
    [0.375, rgb(5, 255, 255)],
    [0.625, rgb(255, 255, 0)],
    [0.875, rgb(250, 0, 0)],
    [1, rgb(128, 0, 0)],
  ],
  Hot: [
    [0, rgb(0, 0, 0)],
    [0.3, rgb(230, 0, 0)],
    [0.6, rgb(255, 210, 0)],
    [1, rgb(255, 255, 255)],
  ],
  Blackbody: [
    [0, rgb(0, 0, 0)],
    [0.2, rgb(230, 0, 0)],
    [0.4, rgb(230, 210, 0)],
    [0.7, rgb(255, 255, 255)],
    [1, rgb(160, 200, 255)],
  ],
  Earth: [
    [0, rgb(0, 0, 130)],
    [0.1, rgb(0, 180, 180)],
    [0.2, rgb(40, 210, 40)],
    [0.4, rgb(230, 230, 50)],
    [0.6, rgb(120, 70, 20)],
    [1, rgb(255, 255, 255)],
  ],
  Electric: [
    [0, rgb(0, 0, 0)],
    [0.15, rgb(30, 0, 100)],
    [0.4, rgb(120, 0, 100)],
    [0.6, rgb(160, 90, 0)],
    [0.8, rgb(230, 200, 0)],
    [1, rgb(255, 250, 220)],
  ],
  Viridis: evenStops([
    '#440154',
    '#48186a',
    '#472d7b',
    '#424086',
    '#3b528b',
    '#33638d',
    '#2c728e',
    '#26828e',
    '#21918c',
    '#1fa088',
    '#28ae80',
    '#3fbc73',
    '#5ec962',
    '#84d44b',
    '#addc30',
    '#d8e219',
    '#fde725',
  ]),
  Cividis: evenStops([
    rgb(0, 32, 76),
    rgb(0, 42, 102),
    rgb(0, 52, 110),
    rgb(39, 63, 108),
    rgb(60, 74, 107),
    rgb(76, 85, 107),
    rgb(91, 95, 109),
    rgb(104, 106, 112),
    rgb(117, 117, 117),
    rgb(131, 129, 120),
    rgb(146, 140, 120),
    rgb(161, 152, 118),
    rgb(176, 165, 114),
    rgb(192, 177, 109),
    rgb(209, 191, 102),
    rgb(225, 204, 92),
    rgb(243, 219, 79),
    rgb(255, 233, 69),
  ]),
  Plasma: evenStops([
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
  ]),
};
