/**
 * Cartesian subplot discovery and axis defaults (plan E1.4, E3).
 *
 * Traces referencing `xaxis: 'x2'` create `fullLayout.xaxis2`; axes declared in the layout are
 * kept even if unused. Each axis is coerced from its schema, with the defaults that depend on
 * other values filled in here, as Plotly's axis `supplyDefaults` does:
 *
 * - `type: '-'` → detected from the first trace with data on the axis ({@link autoType});
 * - `autorange` → `false` for a full `range`, `'min'`/`'max'` for a partial one (`[null, 5]`);
 * - `linecolor`, `tickcolor`, `zerolinecolor`, `dividercolor` → `color`;
 * - `tickfont` → `layout.font` (color → `color` when it was changed); `title.font` → 1.2× that;
 * - `tickmode` → `array` with `tickvals`, `linear` with `dtick`, else `auto` (same for `minor`);
 * - `categoryorder` → `array` with a `categoryarray`, else `trace`;
 * - `ticklabeloverflow` → by `ticklabelposition`; `minor.*` styles → the major ones;
 * - `dtick`/`tick0` of linear tick modes are validated per axis type.
 *
 * Every rule reads the resolved input the same way it writes it, so the output fed back in is a
 * fixed point (supply-defaults idempotence).
 */
import { canonicalColor, toRGBA } from '../coerce/color.ts';
import { isArrayLike } from '../coerce/coerce.ts';
import { formatDate, isDateString, isValidDate } from '../data/dates.ts';
import { getIn } from '../path/path.ts';
import { dateTick0, ONEDAY, ONEWEEK } from '../scales/date-math.ts';
import { cleanNumber, dateToMs } from '../scales/scale.ts';
import {
  getNodeAtPath,
  keyForSubplotId,
  splitSubplotKey,
  subplotIdForKey,
} from '../schema/walk.ts';
import type { AttrSpec, ObjectNode } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';
import { coerceContainer, resolveWithTemplate } from './container.ts';
import type { FullAxis, FullLayout, FullTrace, Subplots } from './types.ts';

/** Axis types {@link autoType} can detect. */
export type DetectedAxisType = 'linear' | 'date' | 'category' | 'multicategory';

/** Options for {@link autoType}. */
export interface AutoTypeOptions {
  /** `strict`: only real numbers count as numbers (numeric strings are categories). */
  autotypenumbers?: 'convert types' | 'strict';
  /** Treat two-level arrays as flat data instead of `multicategory`. */
  noMultiCategory?: boolean;
}

/** Most values sampled per array: evenly spaced, like Plotly. */
const SAMPLE = 1000;

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/** Distinct sampled values (by string form), skipping blanks. */
function sampleDistinct(a: ArrayLike<unknown>): unknown[] {
  const inc = Math.max(1, (a.length - 1) / SAMPLE);
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (let f = 0; f < a.length; f += inc) {
    const v = a[Math.round(f)];
    if (isEmptyValue(v)) continue;
    const key = String(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Detect an axis type from data with Plotly's `autoType` rules, on distinct values (at most 1000
 * sampled):
 *
 * - two-level arrays `[[groups], [items]]` → `multicategory`;
 * - more than twice as many dates (`Date`s, ISO strings) as numbers → `date`;
 * - more than twice as many categories (non-numeric strings, booleans) as numbers → `category`
 *   (with `autotypenumbers: 'strict'`, numeric strings are categories too);
 * - otherwise `linear` (typed arrays always are).
 */
export function autoType(values: unknown, opts: AutoTypeOptions = {}): DetectedAxisType {
  // Typed arrays can only hold numbers.
  if (!isArrayLike(values) || !Array.isArray(values) || values.length === 0) return 'linear';
  let a: ArrayLike<unknown> = values;
  if (isArrayLike(values[0])) {
    if (opts.noMultiCategory !== true && isArrayLike(values[1])) return 'multicategory';
    const flat: unknown[] = [];
    for (const row of values) if (isArrayLike(row)) flat.push(...Array.from(row));
    a = flat;
  }
  const distinct = sampleDistinct(a);
  const convert = opts.autotypenumbers !== 'strict';
  let dates = 0;
  let numeric = 0;
  for (const v of distinct) {
    if (isValidDate(v) || isDateString(v)) dates++;
    if (!Number.isNaN(cleanNumber(v))) numeric++;
  }
  if (dates > numeric * 2) return 'date';
  let nums = 0;
  let cats = 0;
  for (const v of distinct) {
    if (typeof v === 'boolean') cats++;
    else if (convert ? !Number.isNaN(cleanNumber(v)) : typeof v === 'number') nums++;
    else if (typeof v === 'string') cats++;
  }
  return cats > nums * 2 ? 'category' : 'linear';
}

function byId(a: string, b: string): number {
  const [, na] = splitSubplotKey(a);
  const [, nb] = splitSubplotKey(b);
  return na - nb || (a < b ? -1 : a > b ? 1 : 0);
}

function addUnique(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}

/** Does this trace give the axis data to type from (Plotly's `getFirstNonEmptyTrace`)? */
function typingData(trace: FullTrace, letter: 'x' | 'y'): unknown {
  const v = trace[letter];
  if (isArrayLike(v) && v.length > 0) return v;
  const v0 = trace[`${letter}0`];
  // Plotly skips falsy `x0` (including the default 0), so an index-only trace does not type.
  if (v0 !== undefined && v0 !== null && v0 !== 0 && v0 !== '' && v0 !== false) return [v0];
  return undefined;
}

/** The type of an axis whose `type` is `'-'`, from the first trace with data on it. */
function detectType(
  first: { trace: FullTrace; data: unknown } | undefined,
  letter: 'x' | 'y',
  autotypenumbers: AutoTypeOptions['autotypenumbers'],
): DetectedAxisType {
  if (!first) return 'linear';
  const { trace } = first;
  // Histogram counts are numbers whatever the bins are.
  const orientation = trace['orientation'] === 'h' ? 'h' : 'v';
  if (trace.type === 'histogram' && letter === (orientation === 'h' ? 'x' : 'y')) return 'linear';
  const opts: AutoTypeOptions = {};
  if (autotypenumbers !== undefined) opts.autotypenumbers = autotypenumbers;
  return autoType(first.data, opts);
}

/** Blend two CSS colors: `t = 0` gives `a`, `t = 1` gives `b`. */
function mixColors(a: string, b: string, t: number): string {
  const ca = toRGBA(a);
  const cb = toRGBA(b);
  if (!ca || !cb) return a;
  // toRGBA gives 0–1 channels.
  const ch = (i: 0 | 1 | 2): number => Math.round((ca[i] + (cb[i] - ca[i]) * t) * 255);
  return canonicalColor(`rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`) ?? a;
}

/** Plotly's `cleanTicks.dtick`: a valid tick step for the axis type, else the default. */
export function cleanDtick(dtick: unknown, type: string): number | string {
  const isDate = type === 'date';
  const dflt = isDate ? ONEDAY : 1;
  if (dtick === undefined || dtick === null || dtick === '' || dtick === 0) return dflt;
  const n = typeof dtick === 'number' || typeof dtick === 'string' ? cleanNumber(dtick) : NaN;
  if (!Number.isNaN(n)) {
    if (n <= 0) return dflt;
    if (type === 'category' || type === 'multicategory') return Math.max(1, Math.round(n));
    // Date precision is 0.1 ms.
    return isDate ? Math.max(0.1, n) : n;
  }
  if (typeof dtick !== 'string' || !(isDate || type === 'log')) return dflt;
  const prefix = dtick.charAt(0);
  const num = cleanNumber(dtick.slice(1));
  const ok =
    num > 0 &&
    ((isDate && prefix === 'M' && Number.isInteger(num)) ||
      (type === 'log' && prefix === 'L') ||
      (type === 'log' && prefix === 'D' && (num === 1 || num === 2)));
  return ok ? dtick : dflt;
}

/**
 * Plotly's `cleanTicks.tick0`: dates become ISO strings (default 2000-01-01, or the Sunday
 * 2000-01-02 for whole-week steps); `D1`/`D2` log steps ignore `tick0`; others are numbers
 * (default 0).
 */
export function cleanTick0(
  tick0: unknown,
  type: string,
  dtick: unknown,
): number | string | undefined {
  if (type === 'date') {
    const ms = dateToMs(tick0);
    const week = typeof dtick === 'number' && dtick % ONEWEEK === 0;
    return formatDate(Number.isNaN(ms) ? dateTick0(week ? 1 : 0) : ms) as string;
  }
  if (dtick === 'D1' || dtick === 'D2') return undefined;
  const n = cleanNumber(tick0);
  return Number.isNaN(n) ? 0 : n;
}

type Resolver = (path: string, dflt?: unknown) => unknown;

/**
 * The `autorange` a `range` implies: `true` without one, `false` for a full one, and the
 * partial modes when one end is `null` — the `null` end autoranges. On a reversed axis
 * (`reversed`) `range[0]` is the maximum.
 */
function rangeAutorange(range: unknown, reversed: boolean): unknown {
  const r = Array.isArray(range) ? range : [];
  const lo = r[0] ?? null;
  const hi = r[1] ?? null;
  if (lo !== null && hi !== null) return false;
  if (lo === null && hi !== null) return reversed ? 'max reversed' : 'min';
  if (lo !== null && hi === null) return reversed ? 'min reversed' : 'max';
  return true;
}

/** Defaults of one axis that depend on other attributes (see the module comment). */
function dependentDefaults(resolve: Resolver, fullLayout: FullLayout): Record<string, unknown> {
  const font = fullLayout.font;
  const color = resolve('color') as string;
  const baseColor = canonicalColor('#444');
  const fontColor = color !== baseColor ? color : font.color;

  const tickmode = (prefix: string): string => {
    if (isArrayLike(resolve(`${prefix}tickvals`))) return 'array';
    const dtick = resolve(`${prefix}dtick`);
    return dtick !== undefined && dtick !== null && dtick !== '' && dtick !== 0 ? 'linear' : 'auto';
  };
  const categoryarray = resolve('categoryarray');
  const ticklen = resolve('ticklen') as number;
  const tickcolor = resolve('tickcolor', color);
  const gridcolor = resolve('gridcolor') as string;
  const position = resolve('ticklabelposition') as string;

  const out: Record<string, unknown> = {
    autorange: rangeAutorange(resolve('range'), false),
    linecolor: color,
    tickcolor: color,
    zerolinecolor: color,
    dividercolor: color,
    tickmode: tickmode(''),
    categoryorder: isArrayLike(categoryarray) && categoryarray.length > 0 ? 'array' : 'trace',
    ticklabeloverflow: position.includes('inside') ? 'hide past domain' : 'hide past div',
    'minor.tickmode': tickmode('minor.'),
    'minor.ticklen': ticklen * 0.6,
    'minor.tickwidth': resolve('tickwidth'),
    'minor.tickcolor': tickcolor,
    'minor.gridcolor': mixColors(gridcolor, fullLayout.plot_bgcolor, 0.5),
    'minor.gridwidth': resolve('gridwidth'),
    'minor.griddash': resolve('griddash'),
  };
  for (const [prefix, scale] of [
    ['tickfont', 1],
    ['title.font', 1.2],
  ] as const) {
    out[`${prefix}.family`] = font.family;
    out[`${prefix}.size`] = Math.round(font.size * scale);
    out[`${prefix}.color`] = fontColor;
    out[`${prefix}.weight`] = font.weight;
    out[`${prefix}.style`] = font.style;
  }
  return out;
}

/** Validate `dtick`/`tick0` for linear tick modes now that the axis type is known. */
function cleanLinearTicks(ax: FullAxis): void {
  if (ax.tickmode === 'linear') {
    ax.dtick = cleanDtick(ax.dtick, ax.type);
    const tick0 = cleanTick0(ax.tick0, ax.type, ax.dtick);
    if (tick0 === undefined) delete (ax as { tick0?: unknown }).tick0;
    else ax.tick0 = tick0;
  }
  const minor = ax.minor;
  if (minor.tickmode === 'linear') {
    minor.dtick = cleanDtick(minor.dtick, ax.type);
    // An unset minor tick0 follows the major ticks (resolved when ticks are computed).
    if (minor.tick0 !== undefined) {
      const tick0 = cleanTick0(minor.tick0, ax.type, minor.dtick);
      if (tick0 === undefined) delete (minor as { tick0?: unknown }).tick0;
      else minor.tick0 = tick0;
    }
  }
}

/**
 * Discover cartesian subplots and coerce one axis per id into `fullLayout`.
 * Returns the `_subplots` registry.
 */
export function supplyCartesianAxes(
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout,
  fullData: readonly FullTrace[],
  templateLayout: Record<string, unknown> | undefined,
  layoutSchema: ObjectNode,
): Subplots {
  const subplots: Subplots = { cartesian: [], xaxis: [], yaxis: [] };
  const counterpart = { x: new Map<string, string>(), y: new Map<string, string>() };
  type First = { trace: FullTrace; data: unknown };
  const firstData = { x: new Map<string, First>(), y: new Map<string, First>() };

  for (const trace of fullData) {
    if (trace._module?.categories.includes('cartesian') !== true) continue;
    const x = typeof trace['xaxis'] === 'string' ? trace['xaxis'] : 'x';
    const y = typeof trace['yaxis'] === 'string' ? trace['yaxis'] : 'y';
    addUnique(subplots.xaxis, x);
    addUnique(subplots.yaxis, y);
    addUnique(subplots.cartesian, x + y);
    if (!counterpart.x.has(x)) counterpart.x.set(x, y);
    if (!counterpart.y.has(y)) counterpart.y.set(y, x);
    if (trace.visible === false) continue;
    for (const [letter, id] of [
      ['x', x],
      ['y', y],
    ] as const) {
      if (firstData[letter].has(id)) continue;
      const data = typingData(trace, letter);
      if (data !== undefined) firstData[letter].set(id, { trace, data });
    }
  }
  for (const [key, value] of Object.entries(layoutIn)) {
    if (!isPlainObject(value)) continue;
    const x = subplotIdForKey(key, 'xaxis', 'x');
    if (x !== undefined) addUnique(subplots.xaxis, x);
    const y = subplotIdForKey(key, 'yaxis', 'y');
    if (y !== undefined) addUnique(subplots.yaxis, y);
  }
  // An empty figure still shows a blank cartesian plot, as in Plotly.
  if (fullData.length === 0) {
    addUnique(subplots.xaxis, 'x');
    addUnique(subplots.yaxis, 'y');
    addUnique(subplots.cartesian, 'xy');
  }
  subplots.xaxis.sort(byId);
  subplots.yaxis.sort(byId);

  for (const letter of ['x', 'y'] as const) {
    const family = `${letter}axis`;
    const node = layoutSchema.children[family];
    if (node?.kind !== 'object') continue;
    const other = letter === 'x' ? 'y' : 'x';
    for (const id of subplots[family as 'xaxis' | 'yaxis']) {
      const key = keyForSubplotId(id, family, letter);
      const axIn = layoutIn[key];
      const tmpl = templateLayout?.[key] ?? templateLayout?.[family];
      const resolve: Resolver = (path, dflt) => {
        const spec = getNodeAtPath(node, path) as AttrSpec;
        return resolveWithTemplate(
          spec,
          getIn(axIn, path),
          getIn(tmpl, path),
          dflt === undefined ? spec.dflt : dflt,
        );
      };
      const ax = coerceContainer(
        node,
        axIn,
        {},
        {
          template: tmpl,
          overrides: {
            anchor: counterpart[letter].get(id) ?? other,
            ...dependentDefaults(resolve, fullLayout),
          },
        },
      ) as FullAxis;
      // `reversed` with a partial range: only the `null` end autoranges (Plotly).
      if (ax.autorange === 'reversed') {
        const partial = rangeAutorange(ax.range, true);
        if (typeof partial === 'string') ax.autorange = partial as FullAxis['autorange'];
      }
      if (ax.type === '-') {
        ax.type = detectType(firstData[letter].get(id), letter, ax.autotypenumbers);
      }
      cleanLinearTicks(ax);
      ax._id = id;
      ax._name = key;
      fullLayout[key] = ax;
    }
  }
  return subplots;
}
