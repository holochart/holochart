/**
 * Helpers shared by the "matter" examples of the chemistry and physics demo: one color per
 * element (so oxygen is the same red in every composition chart), the Earth's crust by mass, and
 * the simulated molecular speeds of an ideal gas (Maxwell–Boltzmann).
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { K_B, normal, rng } from './data.mts';

/** Atomic mass unit, kg. */
export const U = 1.66053907e-27;

/** One color per element symbol, used by every composition chart. */
export const ELEMENT_COLOR = {
  O: '#ea2a37',
  C: '#80838f',
  H: '#d8dae3',
  He: '#e0b93a',
  N: '#5e74d5',
  Ca: '#118e36',
  P: '#cc540a',
  Si: '#997600',
  Al: '#128b8b',
  Fe: '#b8267e',
  Na: '#9962c0',
  Mg: '#6aa72f',
  K: '#c98ad8',
  Ti: '#4f7fa8',
  Ar: '#3fb5c4',
  other: '#3e3e4c',
} as const;

export type ElementSymbol = keyof typeof ELEMENT_COLOR;

export const ELEMENT_NAME: Record<ElementSymbol, string> = {
  O: 'Oxygen',
  C: 'Carbon',
  H: 'Hydrogen',
  He: 'Helium',
  N: 'Nitrogen',
  Ca: 'Calcium',
  P: 'Phosphorus',
  Si: 'Silicon',
  Al: 'Aluminium',
  Fe: 'Iron',
  Na: 'Sodium',
  Mg: 'Magnesium',
  K: 'Potassium',
  Ti: 'Titanium',
  Ar: 'Argon',
  other: 'Everything else',
};

/** Text color that stays readable on an element's color. */
export function inkOn(symbol: ElementSymbol): string {
  return symbol === 'H' || symbol === 'He' || symbol === 'K' || symbol === 'Ar'
    ? '#0a0a0f'
    : '#eceef4';
}

/** Standard deviation of one velocity component, sqrt(kT/m), in m/s. */
export function sigma(massU: number, kelvin: number): number {
  return Math.sqrt((K_B * kelvin) / (massU * U));
}

/**
 * Simulated speeds (m/s) of `n` gas molecules of mass `massU` (in u) at `kelvin`: each of the three
 * velocity components is normal with standard deviation sqrt(kT/m); the speed is the length of
 * the velocity vector.
 */
export function sampleSpeeds(massU: number, kelvin: number, n: number, seed: number): number[] {
  const gauss = normal(rng(seed));
  const s = sigma(massU, kelvin);
  return Array.from({ length: n }, () => Math.hypot(gauss(), gauss(), gauss()) * s);
}

/** Maxwell–Boltzmann probability density of the speed `v` (per m/s). */
export function maxwell(v: number, massU: number, kelvin: number): number {
  const s = sigma(massU, kelvin);
  return (Math.sqrt(2 / Math.PI) * v * v * Math.exp((-v * v) / (2 * s * s))) / (s * s * s);
}

/** Mean speed of the Maxwell–Boltzmann distribution, sqrt(8kT/(πm)), in m/s. */
export function meanSpeed(massU: number, kelvin: number): number {
  return sigma(massU, kelvin) * Math.sqrt(8 / Math.PI);
}
