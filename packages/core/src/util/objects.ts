/** Small object helpers shared by the defaults, templates and diffing code. */

/** A plain object (`{}` literal or `Object.create(null)`), not an array, class instance or null. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively merge plain objects; `b` wins. Arrays and other values are replaced, not merged.
 * Returns new objects along merged paths; never mutates the inputs.
 */
export function deepMerge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a;
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v);
  return out;
}

/**
 * Deep copy of `v` without keys starting with `_` (internal back-references such as `_index`,
 * `_input`, `_subplots`). Data arrays and typed arrays are kept by reference.
 */
export function stripInternal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripInternal);
  if (!isPlainObject(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!k.startsWith('_')) out[k] = stripInternal(val);
  }
  return out;
}
