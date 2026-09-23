/**
 * Per-`valType` coercion (plan E1.3).
 *
 * {@link coerceValue} is the single place that decides whether a value is valid for an attribute
 * and what its canonical form is. Validation, supply-defaults and the templates machinery all go
 * through it, so "valid" means the same thing everywhere.
 *
 * Rules:
 * - Numeric strings become numbers (`'12'` → `12`) for numeric types.
 * - Colors become canonical `rgb()`/`rgba()` strings.
 * - Out-of-range numbers are invalid (so the caller falls back to `dflt`) unless the attribute sets
 *   `clamp: true`, in which case they are clamped and a note is attached.
 * - Per-point arrays (`arrayOk`) and data arrays are kept by reference — validating or copying
 *   millions of points here would defeat zero-copy ingestion; the calc stage handles bad points.
 */
import type { AttrSpec, Primitive } from '../schema/types.ts';
import { canonicalColor } from './color.ts';

/** Outcome of coercing one value. `note` explains a lossy but accepted coercion (clamping). */
export type CoerceResult = { ok: true; value: unknown; note?: string } | { ok: false };

const INVALID: CoerceResult = Object.freeze({ ok: false });

function valid(value: unknown, note?: string): CoerceResult {
  return note === undefined ? { ok: true, value } : { ok: true, value, note };
}

/** True for plain arrays and typed arrays (not `DataView`). */
export function isArrayLike(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
}

/** Parse a finite number from a number or numeric string. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function hasExtra(spec: AttrSpec, v: unknown): boolean {
  return spec.extras !== undefined && spec.extras.includes(v as Primitive);
}

function coerceNumeric(spec: AttrSpec, v: unknown, integer: boolean): CoerceResult {
  if (spec.arrayOk === true && isArrayLike(v)) return valid(v);
  if (hasExtra(spec, v)) return valid(v);
  const n = toNumber(v);
  if (n === undefined || (integer && !Number.isInteger(n))) return INVALID;
  const { min, max } = spec;
  const below = min !== undefined && n < min;
  const above = max !== undefined && n > max;
  if (!below && !above) return valid(n);
  if (spec.clamp !== true) return INVALID;
  const clamped = below ? (min as number) : (max as number);
  return valid(clamped, `${n} is out of range; clamped to ${clamped}`);
}

function normalizeAngle(n: number): number {
  // [-180, 180): keeps equal angles equal so diffing and transitions see one representation.
  // In-range values pass through untouched: re-running the arithmetic on them can move the last
  // bit (160.89972236040586 → 160.8997223604058), which would make defaults non-idempotent.
  if (n >= -180 && n < 180) return Object.is(n, -0) ? 0 : n;
  const r = ((((n + 180) % 360) + 360) % 360) - 180;
  return Object.is(r, -0) ? 0 : r;
}

function coerceFlaglist(spec: AttrSpec, v: unknown): CoerceResult {
  if (hasExtra(spec, v)) return valid(v);
  if (typeof v !== 'string' || v === '') return INVALID;
  const flags = spec.flags ?? [];
  const parts = v.split('+');
  const seen = new Set<string>();
  for (const p of parts) {
    if (!flags.includes(p) || seen.has(p)) return INVALID;
    seen.add(p);
  }
  return valid(v);
}

function coerceColorscale(v: unknown): CoerceResult {
  if (typeof v === 'string') return v.trim() === '' ? INVALID : valid(v.trim());
  if (!Array.isArray(v) || v.length < 2) return INVALID;
  // A plain list of colors is spread evenly from 0 to 1.
  if (v.every((c) => typeof c === 'string')) {
    const stops: [number, string][] = [];
    for (let i = 0; i < v.length; i++) {
      const c = canonicalColor(v[i]);
      if (c === null) return INVALID;
      stops.push([i / (v.length - 1), c]);
    }
    return valid(stops);
  }
  const stops: [number, string][] = [];
  let prev = -Infinity;
  for (const stop of v) {
    if (!Array.isArray(stop) || stop.length !== 2) return INVALID;
    const pos = toNumber(stop[0]);
    const c = canonicalColor(stop[1]);
    if (pos === undefined || c === null || pos < 0 || pos > 1 || pos < prev) return INVALID;
    prev = pos;
    stops.push([pos, c]);
  }
  if (stops[0]?.[0] !== 0 || stops[stops.length - 1]?.[0] !== 1) return INVALID;
  return valid(stops);
}

function coerceSubplotId(spec: AttrSpec, v: unknown): CoerceResult {
  if (hasExtra(spec, v)) return valid(v);
  const base = typeof spec.dflt === 'string' ? spec.dflt : undefined;
  if (typeof v !== 'string' || base === undefined || !v.startsWith(base)) return INVALID;
  const suffix = v.slice(base.length);
  if (suffix === '' || suffix === '1') return valid(base);
  return /^([2-9]|[1-9]\d+)$/.test(suffix) ? valid(v) : INVALID;
}

function coerceInfoArray(spec: AttrSpec, v: unknown): CoerceResult {
  if (!Array.isArray(v)) return INVALID;
  const items = spec.items;
  if (items === undefined) return valid([...v]);
  const perPosition = Array.isArray(items);
  const free = !perPosition || spec.freeLength === true;
  const len = free ? v.length : (items as readonly AttrSpec[]).length;
  if (!free && v.length > len) return INVALID;
  const dflt = Array.isArray(spec.dflt) ? (spec.dflt as readonly unknown[]) : undefined;
  const out: unknown[] = [];
  const notes: string[] = [];
  for (let i = 0; i < len; i++) {
    const itemSpec = perPosition ? (items as readonly AttrSpec[])[i] : (items as AttrSpec);
    if (itemSpec === undefined) return INVALID;
    let item = v[i];
    if (item === undefined || item === null) item = dflt?.[i] ?? itemSpec.dflt;
    if (item === undefined) return INVALID;
    const r = coerceValue(itemSpec, item);
    if (!r.ok) return INVALID;
    if (r.note !== undefined) notes.push(`[${i}] ${r.note}`);
    out.push(r.value);
  }
  return valid(out, notes.length > 0 ? notes.join('; ') : undefined);
}

/**
 * Coerce `v` (which must not be `undefined`/`null`) to a valid value for `spec`.
 * Returns `{ ok: false }` when the value cannot be used; callers then fall back to a default.
 */
export function coerceValue(spec: AttrSpec, v: unknown): CoerceResult {
  switch (spec.valType) {
    case 'number':
      return coerceNumeric(spec, v, false);
    case 'integer':
      return coerceNumeric(spec, v, true);
    case 'angle': {
      if (spec.arrayOk === true && isArrayLike(v)) return valid(v);
      if (hasExtra(spec, v)) return valid(v);
      const n = toNumber(v);
      return n === undefined ? INVALID : valid(normalizeAngle(n));
    }
    case 'string': {
      if (spec.arrayOk === true && isArrayLike(v)) return valid(v);
      if (typeof v === 'number' && spec.strict !== true && Number.isFinite(v))
        return valid(String(v));
      if (typeof v !== 'string') return INVALID;
      return spec.noBlank === true && v.trim() === '' ? INVALID : valid(v);
    }
    case 'boolean':
      if (spec.arrayOk === true && isArrayLike(v)) return valid(v);
      return typeof v === 'boolean' ? valid(v) : INVALID;
    case 'enumerated': {
      if (spec.arrayOk === true && isArrayLike(v)) return valid(v);
      const values = spec.values ?? [];
      if (values.includes(v as Primitive)) return valid(v);
      // '1' for a numeric enum: same leniency as numeric attributes.
      const n = typeof v === 'string' ? toNumber(v) : undefined;
      return n !== undefined && values.includes(n) ? valid(n) : INVALID;
    }
    case 'flaglist':
      if (spec.arrayOk === true && isArrayLike(v)) return valid(v);
      return coerceFlaglist(spec, v);
    case 'color': {
      if (spec.arrayOk === true && isArrayLike(v)) return valid(v);
      const c = canonicalColor(v);
      return c === null ? INVALID : valid(c);
    }
    case 'colorlist': {
      if (!Array.isArray(v) || v.length === 0) return INVALID;
      const out: string[] = [];
      for (const item of v) {
        const c = canonicalColor(item);
        if (c === null) return INVALID;
        out.push(c);
      }
      return valid(out);
    }
    case 'colorscale':
      return coerceColorscale(v);
    case 'subplotid':
      return coerceSubplotId(spec, v);
    case 'data_array':
      return isArrayLike(v) ? valid(v) : INVALID;
    case 'info_array':
      return coerceInfoArray(spec, v);
    case 'any':
      return valid(v);
    case 'function':
      return typeof v === 'function' ? valid(v) : INVALID;
  }
}

/**
 * The value to store for an attribute: the coerced user value when valid, else the coerced
 * default. `null` and `undefined` both mean "unset". Returns `undefined` when there is no valid
 * value and no default.
 */
export function resolveAttr(spec: AttrSpec, value: unknown, dflt: unknown = spec.dflt): unknown {
  if (value !== undefined && value !== null) {
    const r = coerceValue(spec, value);
    if (r.ok) return r.value;
  }
  return canonicalDefault(spec, dflt);
}

/**
 * Canonical form of a default value (e.g. `'#444'` → `'rgb(68, 68, 68)'`). Defaults are run
 * through coercion too, so full output is canonical regardless of where a value came from — this
 * is what makes supply-defaults idempotent.
 */
export function canonicalDefault(spec: AttrSpec, dflt: unknown): unknown {
  if (dflt === undefined || dflt === null) return undefined;
  const r = coerceValue(spec, dflt);
  return r.ok ? r.value : dflt;
}

function quote(v: Primitive): string {
  return typeof v === 'string' ? `'${v}'` : String(v);
}

function range(spec: AttrSpec): string {
  const { min, max } = spec;
  if (min !== undefined && max !== undefined) return ` between ${min} and ${max}`;
  if (min !== undefined) return ` >= ${min}`;
  if (max !== undefined) return ` <= ${max}`;
  return '';
}

/** Human-readable description of what `spec` accepts, used in validation issues. */
export function describeExpected(spec: AttrSpec): string {
  const extras =
    spec.extras !== undefined && spec.extras.length > 0
      ? `, or ${spec.extras.map(quote).join(', ')}`
      : '';
  const arr = spec.arrayOk === true ? ' (or an array of them)' : '';
  switch (spec.valType) {
    case 'number':
      return `a number${range(spec)}${extras}${arr}`;
    case 'integer':
      return `an integer${range(spec)}${extras}${arr}`;
    case 'angle':
      return `an angle in degrees${extras}${arr}`;
    case 'string':
      return `a${spec.noBlank === true ? ' non-empty' : ''} string${arr}`;
    case 'boolean':
      return `true or false${arr}`;
    case 'enumerated':
      return `one of ${(spec.values ?? []).map(quote).join(', ')}${arr}`;
    case 'flaglist':
      return `any combination of ${(spec.flags ?? []).map(quote).join(', ')} joined with '+'${extras}${arr}`;
    case 'color':
      return `a CSS color${arr}`;
    case 'colorlist':
      return 'a non-empty array of CSS colors';
    case 'colorscale':
      return 'a colorscale name, a list of colors, or [position, color] stops from 0 to 1';
    case 'subplotid':
      return `a subplot id like '${String(spec.dflt)}', '${String(spec.dflt)}2'${extras}`;
    case 'data_array':
      return 'an array or typed array';
    case 'info_array': {
      const items = spec.items;
      if (Array.isArray(items)) {
        return `an array of ${items.length} items [${items.map(describeExpected).join('; ')}]`;
      }
      return items === undefined
        ? 'an array'
        : `an array of ${describeExpected(items as AttrSpec)}`;
    }
    case 'any':
      return 'any value';
    case 'function':
      return 'a function';
  }
}
