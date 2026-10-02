/**
 * Helpers shared by the waves, fields and planets examples of the chemistry and physics demo: the
 * pair of charges the potential and field charts use, and a color tint.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */

/** Coulomb constant, N·m²/C². */
export const K_COULOMB = 8.99e9;

/** The two charges of the dipole charts: +1 nC and −1 nC, 4 cm apart on the x axis. */
export const CHARGES = [
  { sign: 1, x: -2, label: '+', name: '+1 nC', color: '#ea2a37' },
  { sign: -1, x: 2, label: '−', name: '−1 nC', color: '#5e74d5' },
] as const;

/** Size of each charge, coulombs (1 nanocoulomb). */
export const CHARGE = 1e-9;

/** Blue for negative, near-black at zero, red for positive: a diverging scale for the dark page. */
export const DIVERGING: [number, string][] = [
  [0, '#7f93ff'],
  [0.25, '#3b4bb0'],
  [0.5, '#14141c'],
  [0.75, '#b0262f'],
  [1, '#ff6b6b'],
];

/** `#rrggbb` → `rgba(r, g, b, a)`. */
export function tint(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
