/**
 * Helpers shared by the atoms and mechanics examples of the chemistry and physics demo: the atom
 * colors and sizes of the ball-and-stick models.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */

export type AtomKind = 'H' | 'C' | 'N' | 'O';

export interface Atom {
  kind: AtomKind;
  /** Position in ångström (1 Å = 0.1 nm). */
  at: [number, number, number];
}

/**
 * The usual model-kit colors, adjusted for a dark page: hydrogen light grey, carbon a mid grey
 * that still shows on the dark background, oxygen red, nitrogen blue.
 */
export const ATOM_COLOR: Record<AtomKind, string> = {
  H: '#e6e8ee',
  C: '#7c808c',
  N: '#5e74d5',
  O: '#ea2a37',
};

/** Marker diameters in px: hydrogen is the smallest atom. */
export const ATOM_SIZE: Record<AtomKind, number> = { H: 26, C: 40, N: 38, O: 37 };

export const ATOM_NAME: Record<AtomKind, string> = {
  H: 'Hydrogen',
  C: 'Carbon',
  N: 'Nitrogen',
  O: 'Oxygen',
};

/** The four corners of a regular tetrahedron at distance `d` from the origin. */
export function tetrahedron(d: number): [number, number, number][] {
  const s = d / Math.sqrt(3);
  return [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s],
  ];
}

/** The angle at `center` between the directions to `a` and `b`, in degrees. */
export function angleDeg(
  center: readonly number[],
  a: readonly number[],
  b: readonly number[],
): number {
  const u = a.map((v, i) => v - (center[i] as number));
  const w = b.map((v, i) => v - (center[i] as number));
  const dot = u.reduce((s, v, i) => s + v * (w[i] as number), 0);
  return (Math.acos(dot / (Math.hypot(...u) * Math.hypot(...w))) * 180) / Math.PI;
}
