/**
 * A synthetic national energy balance (TWh per year) shared by the sankey examples: primary
 * sources on the left, conversion in the middle, final uses and losses on the right. Invented,
 * deterministic numbers (no download), shaped like the classic energy-flow diagrams.
 */

export const ENERGY_NODES = [
  'Coal', // 0
  'Natural gas', // 1
  'Oil', // 2
  'Nuclear', // 3
  'Wind', // 4
  'Solar', // 5
  'Hydro', // 6
  'Biomass', // 7
  'Thermal plants', // 8
  'Electricity grid', // 9
  'Refineries', // 10
  'Industry', // 11
  'Homes', // 12
  'Transport', // 13
  'Services', // 14
  'Losses', // 15
] as const;

/** `[source, target, TWh]`. */
export const ENERGY_LINKS: readonly (readonly [number, number, number])[] = [
  [0, 8, 62],
  [0, 11, 18],
  [1, 8, 96],
  [1, 11, 64],
  [1, 12, 118],
  [1, 14, 41],
  [2, 10, 212],
  [3, 9, 58],
  [4, 9, 71],
  [5, 9, 24],
  [6, 9, 9],
  [7, 8, 27],
  [7, 12, 14],
  [8, 9, 104],
  [8, 15, 81],
  [9, 11, 96],
  [9, 12, 101],
  [9, 13, 9],
  [9, 14, 48],
  [9, 15, 12],
  [10, 13, 164],
  [10, 11, 22],
  [10, 15, 26],
];
