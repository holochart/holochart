/**
 * Cartesian subplot discovery and minimal axis defaults (plan E1.4). Traces referencing
 * `xaxis: 'x2'` create `fullLayout.xaxis2`; axes declared in the layout are kept even if unused.
 * The full axis machinery (ticks, autorange, linked axes) is E3.
 */
import { isArrayLike, resolveAttr, toNumber } from '../coerce/coerce.ts';
import { isDateString, isValidDate } from '../data/dates.ts';
import { getIn } from '../path/path.ts';
import { keyForSubplotId, splitSubplotKey, subplotIdForKey } from '../schema/walk.ts';
import type { AttrSpec, ObjectNode } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';
import { coerceContainer } from './container.ts';
import type { FullAxis, FullLayout, FullTrace, Subplots } from './types.ts';

const SAMPLE = 1000;

/**
 * Detect an axis type from data (Plotly's `autotype`, simplified): typed arrays and numbers →
 * `linear`; mostly `Date`s or ISO date strings → `date`; otherwise `category` when non-numeric
 * strings are at least half as common as numbers.
 */
export function autoType(values: unknown): 'linear' | 'date' | 'category' {
  // Typed arrays can only hold numbers.
  if (!isArrayLike(values) || !Array.isArray(values)) return 'linear';
  let nums = 0;
  let dates = 0;
  let cats = 0;
  const step = Math.max(1, Math.floor(values.length / SAMPLE));
  for (let i = 0; i < values.length; i += step) {
    const v: unknown = values[i];
    if (v === null || v === undefined || v === '') continue;
    if (isValidDate(v) || isDateString(v)) dates++;
    else if (toNumber(v) !== undefined) nums++;
    else cats++;
  }
  const total = nums + dates + cats;
  if (total === 0) return 'linear';
  if (dates > nums + cats) return 'date';
  if (cats > 0 && nums < 2 * cats) return 'category';
  return 'linear';
}

function byId(a: string, b: string): number {
  const [, na] = splitSubplotKey(a);
  const [, nb] = splitSubplotKey(b);
  return na - nb || (a < b ? -1 : a > b ? 1 : 0);
}

function addUnique(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}

/**
 * Discover cartesian subplots and coerce one minimal axis per id into `fullLayout`.
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
  const firstData = { x: new Map<string, unknown>(), y: new Map<string, unknown>() };

  for (const trace of fullData) {
    if (trace._module?.categories.includes('cartesian') !== true) continue;
    const x = typeof trace['xaxis'] === 'string' ? trace['xaxis'] : 'x';
    const y = typeof trace['yaxis'] === 'string' ? trace['yaxis'] : 'y';
    addUnique(subplots.xaxis, x);
    addUnique(subplots.yaxis, y);
    addUnique(subplots.cartesian, x + y);
    if (!counterpart.x.has(x)) counterpart.x.set(x, y);
    if (!counterpart.y.has(y)) counterpart.y.set(y, x);
    if (trace.visible !== false) {
      if (!firstData.x.has(x) && trace['x'] !== undefined) firstData.x.set(x, trace['x']);
      if (!firstData.y.has(y) && trace['y'] !== undefined) firstData.y.set(y, trace['y']);
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
    const rangeSpec = node.children['range'] as AttrSpec;
    const other = letter === 'x' ? 'y' : 'x';
    for (const id of subplots[family as 'xaxis' | 'yaxis']) {
      const key = keyForSubplotId(id, family, letter);
      const axIn = layoutIn[key];
      const tmpl = templateLayout?.[key] ?? templateLayout?.[family];
      const range =
        resolveAttr(rangeSpec, getIn(axIn, 'range')) ??
        resolveAttr(rangeSpec, getIn(tmpl, 'range'));
      const ax = coerceContainer(
        node,
        axIn,
        {},
        {
          template: tmpl,
          overrides: {
            anchor: counterpart[letter].get(id) ?? other,
            // Plotly: giving a range without autorange means "use this range".
            autorange: range === undefined,
          },
        },
      ) as FullAxis;
      if (ax.type === '-') ax.type = autoType(firstData[letter].get(id));
      ax._id = id;
      ax._name = key;
      fullLayout[key] = ax;
    }
  }
  return subplots;
}
