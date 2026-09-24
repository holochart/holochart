/**
 * Axis type changes that convert layout coordinates: a port of the `type` branch of plotly.js'
 * `_relayout`, `lib/to_log_range.js`, and the annotations and images `convertCoords`.
 *
 * On a log axis, layout coordinates (the axis `range`, annotation `x`/`y`/`ax`/`ay`, image
 * `x`/`y`/`sizex`/`sizey`) are exponents (log10 of the data value), so switching an axis between
 * `linear` and `log` must convert them to keep things in place. Shapes are not converted, as in
 * Plotly ("Shapes do not need this"); a shapes implementation can reuse {@link convertAxisCoord}.
 *
 * Deviations from Plotly (deliberate):
 * - a fixed range with both ends ≤ 0 going to `log` only turns autorange on; Plotly also writes a
 *   NaN range that autorange then replaces;
 * - a `type` equal to the current full type, `'-'`, `null` or an unknown type is not a type change
 *   (Plotly autoranges on any `type` edit other than linear ↔ log);
 * - the range "in use" is the input `range`, else the full one (Plotly only reads the input
 *   `range` and autoranges without one).
 */
import type { FullLayout } from '../defaults/types.ts';
import { parsePath, stringifyPath } from '../path/path.ts';

/** An axis type between which layout coordinates convert. */
export type ConvertibleAxisType = 'linear' | 'log';

/** A range as a pair of finite numbers, in the units of the axis' current type. */
export type AxisRangePair = readonly [number, number];

/** Plotly's `isNumeric`: finite numbers and numeric strings. */
function numeric(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * A linear value as a log-axis coordinate (Plotly's `toLogRange`): `log10(val)` for a positive
 * value, else the log of the smaller end of `range` (the axis' current linear range), else, when
 * that is not positive either, six decades below the log of the larger end.
 *
 * @param val - The linear value.
 * @param range - The axis' current range, in linear units.
 * @returns The log10 coordinate (may be non-finite when neither `val` nor `range` is positive).
 */
export function toLogRange(val: number, range: AxisRangePair): number {
  if (val > 0) return Math.log10(val);
  const low = Math.log10(Math.min(range[0], range[1]));
  return Number.isFinite(low) ? low : Math.log10(Math.max(range[0], range[1])) - 6;
}

/**
 * Convert one layout coordinate (an annotation `x`/`ax`, a shape vertex, …) for an axis type
 * change, as Plotly's annotations `convertCoords` does: linear → log is {@link toLogRange},
 * log → linear is `10 ** value`. Any other pair (including `from === to`) returns the value as a
 * number unchanged.
 *
 * @param value - The current coordinate; numeric strings are accepted (Plotly's `isNumeric`).
 * @param from - The axis' current type.
 * @param to - The axis' new type.
 * @param range - The axis' current range, in `from` units (used for non-positive values going to
 * log).
 * @returns The converted coordinate, or `null` when it is not numeric (so it resets to its
 * default, as in Plotly).
 */
export function convertAxisCoord(
  value: unknown,
  from: ConvertibleAxisType,
  to: ConvertibleAxisType,
  range: AxisRangePair,
): number | null {
  const v = numeric(value);
  if (v === undefined) return null;
  let out = v;
  if (from === 'linear' && to === 'log') out = toLogRange(v, range);
  else if (from === 'log' && to === 'linear') out = 10 ** v;
  return Number.isFinite(out) ? out : null;
}

/**
 * Convert a centered position and size (a layout image's `x`/`sizex`) for an axis type change, as
 * Plotly's images `convertCoords` does. log → linear: `pos' = 10^pos`,
 * `size' = pos' · (10^(size/2) − 10^(−size/2))` (a sinh); linear → log is its exact inverse
 * (an arcsinh), so switching back and forth round-trips.
 *
 * @param pos - The current position; numeric strings are accepted.
 * @param size - The current size (images default it to 1).
 * @param from - The axis' current type.
 * @param to - The axis' new type.
 * @param range - The axis' current range, in `from` units.
 * @returns The new position and size; `pos: null` (and `size: null`) when the position does not
 * convert, `size: null` alone when only the size does not.
 */
export function convertAxisSize(
  pos: unknown,
  size: unknown,
  from: ConvertibleAxisType,
  to: ConvertibleAxisType,
  range: AxisRangePair,
): { pos: number | null; size: number | null } {
  const p = numeric(pos);
  const s = numeric(size);
  let newPos: number;
  let newSize: number;
  if (from === 'linear' && to === 'log') {
    newPos = p === undefined ? NaN : toLogRange(p, range);
    const dx = (s ?? NaN) / 10 ** newPos / 2;
    newSize = 2 * Math.log10(dx + Math.sqrt(1 + dx * dx));
  } else if (from === 'log' && to === 'linear') {
    newPos = 10 ** (p ?? NaN);
    const half = (s ?? NaN) / 2;
    newSize = newPos * (10 ** half - 10 ** -half);
  } else {
    newPos = p ?? NaN;
    newSize = s ?? NaN;
  }
  if (!Number.isFinite(newPos)) return { pos: null, size: null };
  return { pos: newPos, size: Number.isFinite(newSize) ? newSize : null };
}

const TYPE_PATH = /^([xy])axis(\d*)\.type$/;
const AXIS_TYPES = new Set(['linear', 'log', 'date', 'category', 'multicategory']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Whether `update` already sets `path`, one of its parents (`annotations`, `annotations[0]`) or
 * one of its children (`yaxis.range[0]` for `yaxis.range`): Plotly's `doextra` never overrides an
 * explicit value with an implied one.
 */
function setExplicitly(update: Readonly<Record<string, unknown>>, path: string): boolean {
  if (path in update) return true;
  const segs = parsePath(path);
  for (let i = 1; i < segs.length; i++) {
    if (stringifyPath(segs.slice(0, i)) in update) return true;
  }
  return Object.keys(update).some((k) => k.startsWith(`${path}.`) || k.startsWith(`${path}[`));
}

/** The defaulted items of an array container, else the input ones (component not registered). */
function itemsOf(
  name: string,
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout | undefined,
): { item: Record<string, unknown>; index: number }[] {
  const full = fullLayout?.[name];
  if (Array.isArray(full)) {
    return full.filter(isRecord).map((item, k) => {
      const index = item['_index'];
      return { item, index: typeof index === 'number' ? index : k };
    });
  }
  const input = layoutIn[name];
  if (!Array.isArray(input)) return [];
  const out: { item: Record<string, unknown>; index: number }[] = [];
  input.forEach((item, index) => {
    if (isRecord(item)) out.push({ item, index });
  });
  return out;
}

function rangePair(v: unknown): AxisRangePair | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const a = numeric(v[0]);
  const b = numeric(v[1]);
  return a === undefined || b === undefined ? undefined : [a, b];
}

/**
 * The edits a relayout implies when it changes axis types (Plotly's `_relayout` `type` branch):
 *
 * - linear ↔ log with a fixed range (full `autorange: false`): the range in use (input, else full)
 *   converts (`log10` / `10 **`; a non-positive end going to log is put six decades below the
 *   other, and both non-positive turns autorange on). Autoranged axes keep their range, which is
 *   recomputed anyway.
 * - linear ↔ log: annotations whose `xref`/`yref` (and `axref`/`ayref`) is the axis id convert
 *   `x`/`y` (`ax`/`ay`) with {@link convertAxisCoord}; layout images referenced to the axis convert
 *   `x`/`sizex` (`y`/`sizey`) with {@link convertAxisSize}. `'x domain'`/`'paper'` references are
 *   untouched. Shapes are not converted (as in Plotly).
 * - any other real type change (e.g. linear → date): `autorange: true` and `range: null`, as the
 *   old range means nothing in the new type.
 *
 * Nothing the update sets explicitly (the attribute, a parent or a child of it) is overridden.
 * Current types, ranges and items are read from `fullLayout` (defaulted annotations/images, else
 * `layoutIn`'s when those components are not registered); without a full axis there is no
 * conversion.
 *
 * @param update - Flat attribute-string edits (`{ 'yaxis2.type': 'log' }`).
 * @param layoutIn - The input layout before the update.
 * @param fullLayout - The full layout before the update, if the chart has been drawn.
 * @returns `update` itself without a type edit, else a copy with the implied edits added
 * (`'yaxis.range': [0, 3]`, `'annotations[2].y': 1.5`, `'images[0].sizex': null`, …).
 */
export function axisTypeChangeEdits(
  update: Readonly<Record<string, unknown>>,
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout | undefined,
): Record<string, unknown> {
  let out: Record<string, unknown> | undefined;
  for (const [path, next] of Object.entries(update)) {
    const m = TYPE_PATH.exec(path);
    if (!m || typeof next !== 'string' || !AXIS_TYPES.has(next)) continue;
    const letter = m[1] as 'x' | 'y';
    const num = m[2] as string;
    const axisName = `${letter}axis${num}`;
    const axisId = `${letter}${num}`;
    const fullAxis = fullLayout?.[axisName];
    if (!isRecord(fullAxis)) continue;
    const current = fullAxis['type'];
    if (typeof current !== 'string' || current === next) continue;
    out ??= { ...update };
    const edits = out;
    const extra = (p: string, v: unknown): void => {
      if (!setExplicitly(update, p)) edits[p] = v;
    };

    const toLog = current === 'linear' && next === 'log';
    const fromLog = current === 'log' && next === 'linear';
    if (!toLog && !fromLog) {
      extra(`${axisName}.autorange`, true);
      extra(`${axisName}.range`, null);
      continue;
    }

    const inputAxis = layoutIn[axisName];
    const inUse =
      rangePair(isRecord(inputAxis) ? inputAxis['range'] : undefined) ??
      rangePair(fullAxis['range']);
    const rangeTouched =
      setExplicitly(update, `${axisName}.range`) || setExplicitly(update, `${axisName}.autorange`);
    if (inUse && fullAxis['autorange'] === false && !rangeTouched) {
      let [r0, r1] = inUse;
      if (toLog) {
        if (r0 <= 0 && r1 <= 0) {
          extra(`${axisName}.autorange`, true);
        } else {
          if (r0 <= 0) r0 = r1 / 1e6;
          else if (r1 <= 0) r1 = r0 / 1e6;
          extra(`${axisName}.range`, [Math.log10(r0), Math.log10(r1)]);
        }
      } else {
        extra(`${axisName}.range`, [10 ** r0, 10 ** r1]);
      }
    }

    // Coordinates convert with the range in the current (`from`) units.
    const range = rangePair(fullAxis['range']) ?? inUse ?? [0, 1];
    const from = current as ConvertibleAxisType;
    const to = next as ConvertibleAxisType;

    for (const { item, index } of itemsOf('annotations', layoutIn, fullLayout)) {
      if (index < 0) continue;
      for (const key of [letter, `a${letter}`]) {
        const value = item[key];
        if (item[`${key}ref`] !== axisId || value === undefined || value === null) continue;
        extra(`annotations[${index}].${key}`, convertAxisCoord(value, from, to, range));
      }
    }

    for (const { item, index } of itemsOf('images', layoutIn, fullLayout)) {
      if (index < 0 || item[`${letter}ref`] !== axisId) continue;
      const pos = item[letter];
      if (pos === undefined || pos === null) continue;
      const converted = convertAxisSize(pos, item[`size${letter}`] ?? 1, from, to, range);
      extra(`images[${index}].${letter}`, converted.pos);
      extra(`images[${index}].size${letter}`, converted.size);
    }
  }
  return out ?? (update as Record<string, unknown>);
}
