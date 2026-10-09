/**
 * The maths the globe's builders share (backlog GEO8, ADR-028): longitude and latitude to the unit
 * sphere and back, the angle between two points, and points along a great arc.
 *
 * Positions are **globe coordinates** (`globe-frame.ts` has the same formula for the package's
 * initial code): `x = cos φ sin λ`, `y = sin φ`, `z = cos φ cos λ`.
 */

export const RADIANS = Math.PI / 180;
export const DEGREES = 180 / Math.PI;

/** A point of the unit sphere, written to by the functions below. */
export type Vec3 = [x: number, y: number, z: number];

/** Globe coordinates of a longitude and latitude, in degrees. */
export function toSphere(lon: number, lat: number, out: Vec3): Vec3 {
  const lambda = lon * RADIANS;
  const phi = lat * RADIANS;
  const c = Math.cos(phi);
  out[0] = c * Math.sin(lambda);
  out[1] = Math.sin(phi);
  out[2] = c * Math.cos(lambda);
  return out;
}

/** The latitude of a point of the unit sphere, in degrees. */
export function latitudeOf(p: Readonly<Vec3>): number {
  return Math.asin(Math.max(-1, Math.min(1, p[1]))) * DEGREES;
}

/**
 * The longitude of a point of the unit sphere, in degrees, as the one within 180° of `near`: a
 * ring cut at the antimeridian stays on its side of it. At a pole, where every longitude is the
 * point's, it is `near`.
 */
export function longitudeOf(p: Readonly<Vec3>, near: number): number {
  if (Math.hypot(p[0], p[2]) < 1e-12) return near;
  const raw = Math.atan2(p[0], p[2]) * DEGREES;
  return near + ((((raw - near + 180) % 360) + 360) % 360) - 180;
}

/**
 * The angle between two points of the unit sphere, in radians: the length of the great arc from
 * one to the other. By `atan2` of the cross and the dot product, which keeps its digits for arcs
 * of a fraction of a degree and for arcs near half a turn, where `acos` of the dot product has
 * none left.
 */
export function angleBetween(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(x, y, z), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

/**
 * The point a fraction `t` of the way along the great arc from `a` to `b`, which are `angle`
 * radians apart (not 0, and not half a turn: antipodes have no one arc between them).
 */
export function alongArc(
  a: Readonly<Vec3>,
  b: Readonly<Vec3>,
  angle: number,
  t: number,
  out: Vec3,
): Vec3 {
  const s = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / s;
  const wb = Math.sin(t * angle) / s;
  out[0] = wa * a[0] + wb * b[0];
  out[1] = wa * a[1] + wb * b[1];
  out[2] = wa * a[2] + wb * b[2];
  return out;
}

/**
 * The middle of the great arc from `a` to `b`. The sum of the two is the same whichever comes
 * first, so two regions that share an edge split it at the same point, to the last bit.
 */
export function arcMiddle(a: Readonly<Vec3>, b: Readonly<Vec3>, out: Vec3): Vec3 {
  const x = a[0] + b[0];
  const y = a[1] + b[1];
  const z = a[2] + b[2];
  const length = Math.hypot(x, y, z);
  out[0] = x / length;
  out[1] = y / length;
  out[2] = z / length;
  return out;
}

/** How many equal steps cut an arc of `angle` radians into pieces of at most `step` degrees. */
export function arcSteps(angle: number, step: number): number {
  // The margin keeps an arc of exactly n steps, less a rounding error, at n.
  return Math.max(1, Math.ceil((angle * DEGREES) / step - 1e-9));
}

/** `value` when it is a positive finite number, else `fallback`. */
export function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value) ? value : fallback;
}

/** A float array that grows as it is appended to. */
export class FloatBuffer {
  data: Float64Array;
  length = 0;

  constructor(capacity: number) {
    this.data = new Float64Array(Math.max(16, capacity));
  }

  push(value: number): void {
    if (this.length === this.data.length) {
      const next = new Float64Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
}

/** An index array that grows as it is appended to. */
export class IndexBuffer {
  data: Uint32Array;
  length = 0;

  constructor(capacity: number) {
    this.data = new Uint32Array(Math.max(16, capacity));
  }

  push(value: number): void {
    if (this.length === this.data.length) {
      const next = new Uint32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }

  /** The values in use, as an array of their own. */
  finish(): Uint32Array {
    return this.data.slice(0, this.length);
  }
}
