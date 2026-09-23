/**
 * Value comparison for figure diffing and `uirevision` (plan E1.8).
 *
 * Two notions of equality are needed. Data arrays are compared by reference, because walking a
 * million-point column on every `react` would cost more than the update it saves. Everything else
 * (ranges, colorways, fonts, `uirevision` values) is small and compared by value, so that a React
 * app writing `range: [0, 1]` as a fresh literal on every render does not look like an edit.
 */
import { isPlainObject } from '../util/objects.ts';

/**
 * Past this depth values compare by reference. Real figure specs are a handful of levels deep; the
 * cap only keeps pathological (or cyclic) `any`-valued attributes from blowing the stack.
 */
export const MAX_DEPTH = 64;

/** A plain array or any typed array / `DataView`: the shapes a data column can take. */
export function isArrayLike(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || ArrayBuffer.isView(v);
}

/** Own-property read that ignores the prototype chain (so `'toString'` is never "present"). */
export function own(obj: object, key: PropertyKey): unknown {
  return Object.hasOwn(obj, key) ? (obj as Record<PropertyKey, unknown>)[key] : undefined;
}

/**
 * Deep value equality for small, non-data values.
 *
 * - Primitives compare with `===`, except that `NaN` equals `NaN` (a `NaN` in a range must not
 *   look like a change on every update).
 * - Plain arrays and plain objects compare structurally; a key holding `undefined` equals a missing
 *   key, matching how coercion treats them.
 * - `Date`s compare by time. Typed arrays, functions and class instances compare by reference:
 *   typed arrays are data by construction, and the others have no meaningful structural equality.
 */
export function deepEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], depth + 1)) return false;
    }
    return true;
  }
  if (a instanceof Date) return b instanceof Date && Object.is(a.getTime(), b.getTime());
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  for (const k of Object.keys(a)) {
    if (!deepEqual(a[k], own(b, k), depth + 1)) return false;
  }
  for (const k of Object.keys(b)) {
    if (!Object.hasOwn(a, k) && b[k] !== undefined) return false;
  }
  return true;
}
