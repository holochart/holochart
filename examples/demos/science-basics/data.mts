/**
 * Data and small helpers shared by the "Chemistry and physics basics" demo: the periodic table
 * (PubChem, see data/SOURCES.md), the planets, a few constants and a seeded random generator for
 * the simulated measurements.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import elementsJson from './data/elements.json';

export type Category =
  | 'Alkali metal'
  | 'Alkaline earth metal'
  | 'Transition metal'
  | 'Post-transition metal'
  | 'Metalloid'
  | 'Nonmetal'
  | 'Halogen'
  | 'Noble gas'
  | 'Lanthanide'
  | 'Actinide';

export type State = 'Solid' | 'Liquid' | 'Gas';

export interface Element {
  /** Atomic number. */
  z: number;
  symbol: string;
  name: string;
  /** Atomic mass, u. */
  mass: number;
  /** Row of the periodic table, 1–7. */
  period: number;
  /** Column of the 18-column table; `null` for the f-block rows drawn below it. */
  group: number | null;
  category: Category;
  /** State at room conditions. */
  state: State;
  /** True where the state is a prediction (the heaviest elements). */
  statePredicted: boolean;
  /** CPK color, as molecule models use it. */
  cpk: string | null;
  /** Pauling electronegativity. */
  electronegativity: number | null;
  /** Van der Waals radius, pm. */
  radius: number | null;
  /** First ionization energy, eV. */
  ionization: number | null;
  /** Melting point, K. */
  melting: number | null;
  /** Boiling point, K. */
  boiling: number | null;
  /** Density, g/cm³. */
  density: number | null;
  /** Year of discovery; `null` for elements known since antiquity. */
  discovered: number | null;
}

export const ELEMENTS = elementsJson as readonly Element[];

/** The element with this symbol. */
export function element(symbol: string): Element {
  const e = ELEMENTS.find((x) => x.symbol === symbol);
  if (!e) throw new Error(`Unknown element "${symbol}".`);
  return e;
}

/** Element categories, metals first, in the order legends list them. */
export const CATEGORIES: readonly Category[] = [
  'Alkali metal',
  'Alkaline earth metal',
  'Transition metal',
  'Post-transition metal',
  'Lanthanide',
  'Actinide',
  'Metalloid',
  'Nonmetal',
  'Halogen',
  'Noble gas',
];

/** One color per element category, readable on the dark template. */
export const CATEGORY_COLOR: Record<Category, string> = {
  'Alkali metal': '#ea2a37',
  'Alkaline earth metal': '#e8833a',
  'Transition metal': '#5e74d5',
  'Post-transition metal': '#3aa0c8',
  Lanthanide: '#9962c0',
  Actinide: '#c0559d',
  Metalloid: '#12a38a',
  Nonmetal: '#3fae4f',
  Halogen: '#c2a019',
  'Noble gas': '#8a90a6',
};

export const STATE_COLOR: Record<State, string> = {
  Solid: '#5e74d5',
  Liquid: '#12a38a',
  Gas: '#e8833a',
};

/**
 * Where an element sits in the usual drawing of the periodic table: column 1–18 and row 1–7, with
 * the lanthanides and actinides on rows 8.5 and 9.5 under columns 3–16.
 */
export function tableCell(e: Element): { col: number; row: number } {
  if (e.group !== null) return { col: e.group, row: e.period };
  const first = e.period === 6 ? 57 : 89;
  return { col: 3 + (e.z - first), row: e.period === 6 ? 8.5 : 9.5 };
}

export interface Planet {
  name: string;
  /** Mass, 10²⁴ kg. */
  mass: number;
  /** Equatorial diameter, km. */
  diameter: number;
  /** Mean density, kg/m³. */
  density: number;
  /** Surface gravity, m/s². */
  gravity: number;
  /** Mean distance from the Sun, astronomical units. */
  distance: number;
  /** Orbital period, Earth days. */
  period: number;
  /** Orbital eccentricity (0 is a circle). */
  eccentricity: number;
  /** Mean temperature, °C. */
  temperature: number;
  kind: 'Rocky' | 'Gas giant' | 'Ice giant';
  color: string;
}

/** NASA Planetary Fact Sheet. */
export const PLANETS: readonly Planet[] = [
  {
    name: 'Mercury',
    mass: 0.33,
    diameter: 4879,
    density: 5429,
    gravity: 3.7,
    distance: 0.387,
    period: 88.0,
    eccentricity: 0.206,
    temperature: 167,
    kind: 'Rocky',
    color: '#a4a7b5',
  },
  {
    name: 'Venus',
    mass: 4.87,
    diameter: 12104,
    density: 5243,
    gravity: 8.9,
    distance: 0.723,
    period: 224.7,
    eccentricity: 0.007,
    temperature: 464,
    kind: 'Rocky',
    color: '#e3b04b',
  },
  {
    name: 'Earth',
    mass: 5.97,
    diameter: 12756,
    density: 5514,
    gravity: 9.8,
    distance: 1.0,
    period: 365.2,
    eccentricity: 0.017,
    temperature: 15,
    kind: 'Rocky',
    color: '#3aa0c8',
  },
  {
    name: 'Mars',
    mass: 0.642,
    diameter: 6792,
    density: 3934,
    gravity: 3.7,
    distance: 1.524,
    period: 687.0,
    eccentricity: 0.094,
    temperature: -65,
    kind: 'Rocky',
    color: '#ea2a37',
  },
  {
    name: 'Jupiter',
    mass: 1898,
    diameter: 142984,
    density: 1326,
    gravity: 23.1,
    distance: 5.204,
    period: 4331,
    eccentricity: 0.049,
    temperature: -110,
    kind: 'Gas giant',
    color: '#e8833a',
  },
  {
    name: 'Saturn',
    mass: 568,
    diameter: 120536,
    density: 687,
    gravity: 9.0,
    distance: 9.573,
    period: 10747,
    eccentricity: 0.052,
    temperature: -140,
    kind: 'Gas giant',
    color: '#c2a019',
  },
  {
    name: 'Uranus',
    mass: 86.8,
    diameter: 51118,
    density: 1270,
    gravity: 8.7,
    distance: 19.165,
    period: 30589,
    eccentricity: 0.047,
    temperature: -195,
    kind: 'Ice giant',
    color: '#12a38a',
  },
  {
    name: 'Neptune',
    mass: 102,
    diameter: 49528,
    density: 1638,
    gravity: 11.0,
    distance: 30.178,
    period: 59800,
    eccentricity: 0.01,
    temperature: -200,
    kind: 'Ice giant',
    color: '#5e74d5',
  },
];

/** Constants, SI units. */
export const G = 9.81; // standard gravity, m/s²
export const R_GAS = 8.314; // gas constant, J/(mol·K)
export const K_B = 1.380649e-23; // Boltzmann constant, J/K
export const N_A = 6.02214076e23; // Avogadro constant, 1/mol
export const C_LIGHT = 299_792_458; // speed of light, m/s

/**
 * A seeded random generator (mulberry32) returning numbers in [0, 1). The examples never call
 * `Math.random()`: they double as visual tests, so every run must draw the same picture.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal sampler (Box–Muller) on top of a `rng`. */
export function normal(random: () => number): () => number {
  return () => {
    const u = 1 - random();
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** `n` evenly spaced numbers from `a` to `b`, both included. */
export function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
