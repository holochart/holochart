/**
 * What the basemap build is allowed to decide (ADR-024): the grid each resolution is snapped to,
 * which countries keep their subunits, which continent a scope shows and the ids of the features
 * Natural Earth has no ISO code for. The README has the measurements behind the numbers.
 */

/** `layout.geo.resolution`: the Natural Earth scale denominator in millions. */
export type Resolution = 110 | 50;

export const RESOLUTIONS: readonly Resolution[] = [110, 50];

/**
 * Grid steps across 360° of longitude and across 180° of latitude (a TopoJSON quantization): a
 * vertex moves to the nearest grid point, at most half a cell diagonal away. Chosen from the
 * measurements and pictures the README records (`--measure` prints the table again):
 *
 * - 110m, 1e4 (0.036° × 0.018°, at most 2.2 km): a 110m map shows the world or a continent,
 *   0.1° per px or more, so the grid is a third of a px there, and the source is generalized to
 *   tens of km. Finer grids add 4 to 14 kB for nothing one can see.
 * - 50m, 2e4 (0.018° × 0.009°, at most 1.1 km): 50m is what a figure asks for to show a region.
 *   In a view 10° wide no grid can be told from the source. In one 3° wide, where a 50m island
 *   is six vertices, 1e4 bends small islands onto the grid and 2e4 does not; 1e4 also loses the
 *   Vatican, Tuvalu and Ashmore and Cartier Islands, whose every polygon collapses. 5e4 and 1e5
 *   add 65 and 120 kB for a difference visible only past that zoom.
 */
export const GRID: Readonly<Record<Resolution, number>> = { 110: 1e4, 50: 2e4 };

/**
 * Countries whose first-level subdivisions ship as `subunits`, by `adm0_a3`. Natural Earth has
 * only US states at 1:110m; at 1:50m it has nine countries, of which these are the four Plotly
 * ships (plotly.js `topojson/config.mjs`). They are also the four whose subdivisions all have a
 * `postal` code, which is the id: India's, for one, do not.
 */
export const SUBUNIT_COUNTRIES: readonly string[] = ['AUS', 'BRA', 'CAN', 'USA'];

/**
 * Natural Earth's `CONTINENT` to the code a country carries in its `c` property; the loader maps
 * a Plotly `scope` to one of these. sane-topojson (the recipe of Plotly's files) scopes by the
 * same field. Countries of "Seven seas (open ocean)" carry no code and show in `world` only.
 */
export const CONTINENT_CODES: Readonly<Record<string, string>> = {
  Africa: 'af',
  Antarctica: 'an',
  Asia: 'as',
  Europe: 'eu',
  'North America': 'na',
  Oceania: 'oc',
  'South America': 'sa',
};

/** The code lakes and rivers carry, beside their continents, when they lie in the `usa` scope. */
export const USA_CODE = 'us';

/** `ADM0_A3` of the country the `usa` scope shows. */
export const USA_ADM0 = 'USA';

/**
 * Ids for features Natural Earth gives no ISO 3166-1 alpha-3 code, by `ADM0_A3`. Kosovo has no
 * ISO code; `XKX` is the user-assigned code the World Bank, the EU and Plotly's current files
 * use, so a dataset keyed that way joins.
 */
export const ID_OVERRIDES: Readonly<Record<string, string>> = { KOS: 'XKX' };
