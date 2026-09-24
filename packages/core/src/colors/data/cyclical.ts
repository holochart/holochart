/**
 * Cyclical color scales, as shipped in plotly.py's `plotly.colors.cyclical` (plotly.py 5.18). The
 * first and last colors match so the scale wraps. Twilight comes from matplotlib (CC0) and
 * IceFire from seaborn (BSD-3-Clause).
 */

/** Twilight (matplotlib, from Bastian Bechtold), 10 colors. */
export const Twilight: readonly string[] = [
  '#e2d9e2',
  '#9ebbc9',
  '#6785be',
  '#5e43a5',
  '#421257',
  '#471340',
  '#8e2c50',
  '#ba6657',
  '#ceac94',
  '#e2d9e2',
];

/** IceFire (seaborn), 17 colors. */
export const IceFire: readonly string[] = [
  '#000000',
  '#001f4d',
  '#003786',
  '#0e58a8',
  '#217eb8',
  '#30a4ca',
  '#54c8df',
  '#9be4ef',
  '#e1e9d1',
  '#f3d573',
  '#e7b000',
  '#da8200',
  '#c65400',
  '#ac2301',
  '#820000',
  '#4c0000',
  '#000000',
];

/** Edge (plotly.py), 17 colors. */
export const Edge: readonly string[] = [
  '#313131',
  '#3d019d',
  '#3810dc',
  '#2d47f9',
  '#2593ff',
  '#2adef6',
  '#60fdfa',
  '#aefdff',
  '#f3f3f1',
  '#fffda9',
  '#fafd5b',
  '#f7da29',
  '#ff8e25',
  '#f8432d',
  '#d90d39',
  '#97023d',
  '#313131',
];

/** Phase (cmocean phase, by Kristen Thyng), 12 colors. */
export const Phase: readonly string[] = [
  'rgb(167, 119, 12)',
  'rgb(197, 96, 51)',
  'rgb(217, 67, 96)',
  'rgb(221, 38, 163)',
  'rgb(196, 59, 224)',
  'rgb(153, 97, 244)',
  'rgb(95, 127, 228)',
  'rgb(40, 144, 183)',
  'rgb(15, 151, 136)',
  'rgb(39, 153, 79)',
  'rgb(119, 141, 17)',
  'rgb(167, 119, 12)',
];

/** HSV hue wheel, 10 colors. */
export const HSV: readonly string[] = [
  '#ff0000',
  '#ffa700',
  '#afff00',
  '#08ff00',
  '#00ff9f',
  '#00b7ff',
  '#0010ff',
  '#9700ff',
  '#ff00bf',
  '#ff0000',
];

/** mrybm magenta-red-yellow-blue-magenta (plotly.py), 17 colors. */
export const mrybm: readonly string[] = [
  '#f884f7',
  '#f968c4',
  '#ea4388',
  '#cf244b',
  '#b51a15',
  '#bd4304',
  '#cc6904',
  '#d58f04',
  '#cfaa27',
  '#a19f62',
  '#588a93',
  '#2269c4',
  '#3e3ef0',
  '#6b4ef9',
  '#956bfa',
  '#cd7dfe',
  '#f884f7',
];

/** mygbm magenta-yellow-green-blue-magenta (plotly.py), 17 colors. */
export const mygbm: readonly string[] = [
  '#ef55f1',
  '#fb84ce',
  '#fbafa1',
  '#fcd471',
  '#f0ed35',
  '#c6e516',
  '#96d310',
  '#61c10b',
  '#31ac28',
  '#439064',
  '#3d719a',
  '#284ec8',
  '#2e21ea',
  '#6324f5',
  '#9139fa',
  '#c543fa',
  '#ef55f1',
];

/** plotly.py cyclical scales by name. */
export const CYCLICAL: Readonly<Record<string, readonly string[]>> = {
  Twilight,
  IceFire,
  Edge,
  Phase,
  HSV,
  mrybm,
  mygbm,
};
