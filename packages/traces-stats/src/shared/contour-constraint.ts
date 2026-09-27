/**
 * Constraint contours (Plotly `contour/constraint_defaults.js`, `constraint_mapping.js`,
 * `convert_to_constraints.js` and the constraint branch of `close_boundaries.js`). Pure.
 *
 * `contours.type: 'constraint'` draws the boundary of `{z op value}` and, for inequalities, shades
 * the region where the constraint holds (the "feasible" region). Plotly's operations reduce to
 * five (open and closed ends draw the same):
 *
 * | operation                    | reduced | levels       | shaded region                 |
 * | ---------------------------- | ------- | ------------ | ----------------------------- |
 * | `=`                          | `=`     | `[v]`        | none (the line only)          |
 * | `<`, `<=`                    | `<`     | `[v]`        | `z < v`                       |
 * | `>`, `>=`                    | `>`     | `[v]`        | `z ≥ v`                       |
 * | `[]`, `()`, `[)`, `(]`       | `[]`    | `[lo, hi]`   | `lo ≤ z < hi`                 |
 * | `][`, `)(`, `](`, `)[`       | `][`    | `[lo, hi]`   | `z < lo` or `z ≥ hi`          |
 *
 * {@link constraintRegion} composes the shaded region from the `{z ≥ level}` regions of
 * `contour-fill.ts` (rings for the NONZERO rule, winding 0 or 1): a complement is the grid
 * rectangle plus the region's rings reversed, a difference is one region plus the other reversed,
 * so every point keeps a winding of 0 or 1.
 */
import type { ContourRegion } from './contour-fill.ts';

/** Every `contours.operation` value (Plotly's `COMPARISON_OPS2` and `INTERVAL_OPS`). */
export const CONSTRAINT_OPERATIONS = [
  '=',
  '<',
  '>=',
  '>',
  '<=',
  '[]',
  '()',
  '[)',
  '(]',
  '][',
  ')(',
  '](',
  ')[',
] as const;

/** A `contours.operation`. */
export type ConstraintOperation = (typeof CONSTRAINT_OPERATIONS)[number];

/** The five operations constraint contours draw differently. */
export type ReducedOperation = '=' | '<' | '>' | '[]' | '][';

/** Plotly's `CONSTRAINT_REDUCTION`: open and closed ends draw the same. */
export const CONSTRAINT_REDUCTION: Readonly<Record<ConstraintOperation, ReducedOperation>> = {
  '=': '=',
  '<': '<',
  '<=': '<',
  '>': '>',
  '>=': '>',
  '[]': '[]',
  '()': '[]',
  '[)': '[]',
  '(]': '[]',
  '][': '][',
  ')(': '][',
  '](': '][',
  ')[': '][',
};

/** Whether an operation takes an interval `[lo, hi]` (else a single value). */
export function isIntervalOperation(op: ConstraintOperation | ReducedOperation): boolean {
  const r = CONSTRAINT_REDUCTION[op as ConstraintOperation] ?? op;
  return r === '[]' || r === '][';
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/**
 * The defaulted `contours.value` (Plotly `handleConstraintValueDefaults`): a number for
 * comparisons (the first element of an array; 0 when invalid), a `[lo, hi]` pair for intervals
 * (a single number `v` becomes `[v, v + 1]`; `[0, 1]` when invalid).
 */
export function constraintValue(
  op: ConstraintOperation,
  value: unknown,
): number | [number, number] {
  if (isIntervalOperation(op)) {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      const arr = value as ArrayLike<unknown>;
      const a = toNumber(arr[0]);
      const b = toNumber(arr[1]);
      if (arr.length >= 2 && Number.isFinite(a) && Number.isFinite(b)) return [a, b];
      if (Number.isFinite(a)) return [a, a + 1];
      return [0, 1];
    }
    const v = toNumber(value);
    return Number.isFinite(v) ? [v, v + 1] : [0, 1];
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const v = toNumber((value as ArrayLike<unknown>)[0]);
    return Number.isFinite(v) ? v : 0;
  }
  const v = toNumber(value);
  return Number.isFinite(v) ? v : 0;
}

/**
 * The contour levels of a constraint (Plotly `constraint_mapping.js`): the value for comparisons,
 * the interval ends in ascending order for intervals.
 */
export function constraintLevels(op: ConstraintOperation, value: unknown): number[] {
  const v = constraintValue(op, value);
  if (typeof v === 'number') return [v];
  return [Math.min(v[0], v[1]), Math.max(v[0], v[1])];
}

/** Whether a constraint shades a region (every operation but `=`). */
export function constraintHasFill(op: ConstraintOperation): boolean {
  return CONSTRAINT_REDUCTION[op] !== '=';
}

/** A region with every ring reversed (winding negated). */
export function reverseRegion(region: ContourRegion): ContourRegion {
  const { x, y, rings } = region;
  const n = x.length;
  const rx = new Float64Array(n);
  const ry = new Float64Array(n);
  for (let r = 0; r < rings.length; r++) {
    const a = rings[r]!;
    const b = r + 1 < rings.length ? rings[r + 1]! : n;
    for (let k = a; k < b; k++) {
      rx[k] = x[a + b - 1 - k]!;
      ry[k] = y[a + b - 1 - k]!;
    }
  }
  return { x: rx, y: ry, rings: Uint32Array.from(rings) };
}

/** Concatenate regions (their rings, in order). */
export function concatRegions(regions: readonly ContourRegion[]): ContourRegion {
  let n = 0;
  let r = 0;
  for (const reg of regions) {
    n += reg.x.length;
    r += reg.rings.length;
  }
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const rings = new Uint32Array(r);
  let v = 0;
  let q = 0;
  for (const reg of regions) {
    x.set(reg.x, v);
    y.set(reg.y, v);
    for (let k = 0; k < reg.rings.length; k++) rings[q++] = reg.rings[k]! + v;
    v += reg.x.length;
  }
  return { x, y, rings };
}

/**
 * The shaded region of a constraint, from the `{z ≥ level}` regions of its levels (one for
 * comparisons, two for intervals: lower level first) and the grid rectangle `rect` (a
 * counter-clockwise ring). `undefined` for `=`, which shades nothing.
 */
export function constraintRegion(
  op: ConstraintOperation,
  levelRegions: readonly ContourRegion[],
  rect: ContourRegion,
): ContourRegion | undefined {
  const [r0, r1] = levelRegions;
  if (!r0) return undefined;
  switch (CONSTRAINT_REDUCTION[op]) {
    case '=':
      return undefined;
    case '>':
      return r0;
    case '<':
      return concatRegions([rect, reverseRegion(r0)]);
    case '[]':
      return r1 ? concatRegions([r0, reverseRegion(r1)]) : r0;
    case '][':
      return concatRegions(r1 ? [rect, reverseRegion(r0), r1] : [rect, reverseRegion(r0)]);
  }
}

/** Whether `z` satisfies a constraint (for tests and hover). */
export function satisfiesConstraint(op: ConstraintOperation, value: unknown, z: number): boolean {
  const levels = constraintLevels(op, value);
  const lo = levels[0]!;
  const hi = levels[levels.length - 1]!;
  switch (CONSTRAINT_REDUCTION[op]) {
    case '=':
      return z === lo;
    case '<':
      return z < lo;
    case '>':
      return z >= lo;
    case '[]':
      return z >= lo && z < hi;
    case '][':
      return z < lo || z >= hi;
  }
}
