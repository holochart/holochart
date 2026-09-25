/**
 * Linked axes and axis constraints: defaults (plan E3.9, Plotly `cartesian/constraints.js`
 * `handleDefaults`).
 *
 * Runs once over every cartesian axis (x axes, then y axes, each by number — Plotly's `idSort`)
 * after the axes and `overlaying` are resolved:
 *
 * - `constraintoward` gets its per-letter default (`center` for x, `middle` for y); a value for
 *   the other letter (`top` on an x axis) is invalid and falls back like any invalid value.
 * - `matches` / `scaleanchor` are read from the user's axis only, never the template (a template
 *   value would link every axis). The candidates are the other axes (either letter) of the same
 *   `type` that are not already in this axis' constraint group, so links never form loops;
 *   `matches` wins over `scaleanchor`. Anything else — `false`, unknown ids, loops, type
 *   mismatches — leaves the attribute unset in the full axis.
 * - Links build `fullLayout._axisMatchGroups` (`{ x: 1, x2: 1 }`) and
 *   `fullLayout._axisConstraintGroups` (`{ x: 1, y: 2 }`: px per unit of each axis divided by
 *   its value is the same across the group). A `matches` link also joins the constraint group,
 *   with ratio = this axis' domain length / the target's; cross-letter ratios are strings with an
 *   `x`/`y` prefix per plot-aspect factor (see {@link multiplyScales}), resolved at draw time.
 * - `fixedrange: true` on any axis of a constraint group fixes the whole group.
 * - A constraint group made only of one match group is dropped (matching already equalizes the
 *   scales).
 * - Match groups share `constrain`, `range`, `autorange`, `rangemode`, `rangebreaks`,
 *   `categoryorder` and `categoryarray` (see {@link supplyAxisConstraints}).
 *
 * Every rule reads the user's values the way it writes the full axis, so the full output fed back
 * in gives the same groups and values (supply-defaults idempotence).
 */
import { getIn } from '../path/path.ts';
import { keyForSubplotId } from '../schema/walk.ts';
import { isPlainObject } from '../util/objects.ts';
import type { FullAxis, FullLayout } from './types.ts';

/** A group of axes whose ranges are linked by `matches` (Plotly `_axisMatchGroups` item). */
export type AxisMatchGroup = Record<string, 1>;

/**
 * A group of axes whose scales are linked (Plotly `_axisConstraintGroups` item): for each axis id,
 * its ratio; px per unit ÷ ratio is the same for every axis of the group once constraints are
 * enforced. String ratios carry `x`/`y` prefixes for cross-letter links (see
 * {@link multiplyScales}).
 */
export type AxisConstraintGroup = Record<string, number | string>;

const TOWARD = {
  x: ['left', 'center', 'right'],
  y: ['bottom', 'middle', 'top'],
} as const;

/** Attributes shared by every axis of a match group (Plotly's list). */
const MATCH_SYNCED = [
  'constrain',
  'range',
  'autorange',
  'rangemode',
  'rangebreaks',
  'categoryorder',
  'categoryarray',
] as const;

const PREFIX = /^[xy]*/;

function splitRatio(v: number | string): [prefix: string, value: number] {
  if (typeof v !== 'string') return ['', v];
  const prefix = (PREFIX.exec(v) as RegExpExecArray)[0];
  return [prefix, Number(v.slice(prefix.length))];
}

/**
 * Plotly's `multiplyScales`: multiply two constraint ratios. A ratio string's `x`/`y` prefix
 * stands for a factor of the plot aspect (resolved at draw time): prefixes of the same letter
 * accumulate (`'x2' × 'x3'` → `'xx6'`), opposite letters cancel (`'x2' × 'y3'` → `6`).
 */
export function multiplyScales(a: number | string, b: number | string): number | string {
  const [pa, va] = splitRatio(a);
  const [pb, vb] = splitRatio(b);
  const product = va * vb;
  if (pa === '' && pb === '') return product;
  if (pa === '' || pb === '' || pa.charAt(0) === pb.charAt(0)) return `${pa}${pb}${product}`;
  if (pa.length === pb.length) return product;
  return `${pa.length > pb.length ? pa.slice(pb.length) : pb.slice(pa.length)}${product}`;
}

/** The group of `groups` containing axis `id`, or `null` (Plotly `findConstraintGroup`). */
export function findAxisGroup<G extends Readonly<Record<string, unknown>>>(
  groups: readonly G[],
  id: string,
): G | null {
  for (const g of groups) if (Object.hasOwn(g, id)) return g;
  return null;
}

/**
 * Plotly's `updateConstraintGroups`: link `thisId` to `thatId` with `scaleFactor` (px per unit of
 * `thisId` ÷ px per unit of `thatId`). When `thatId` is already in another group, this axis'
 * group is merged into it (rescaled to its ratios); otherwise `thatId` joins this axis' group.
 * Mutates `groups`.
 */
export function updateConstraintGroups<V extends number | string>(
  groups: Record<string, V>[],
  thisId: string,
  thatId: string,
  scaleFactor: V,
): void {
  let group = findAxisGroup(groups, thisId);
  let index: number;
  if (group === null) {
    group = { [thisId]: 1 } as Record<string, V>;
    index = groups.length;
    groups.push(group);
  } else {
    index = groups.indexOf(group);
  }
  const ids = Object.keys(group);
  for (let i = 0; i < groups.length; i++) {
    const other = groups[i] as Record<string, V>;
    if (i === index || !Object.hasOwn(other, thatId)) continue;
    const base = other[thatId] as V;
    for (const id of ids) {
      other[id] = multiplyScales(base, multiplyScales(scaleFactor, group[id] as V)) as V;
    }
    groups.splice(index, 1);
    return;
  }
  if (scaleFactor !== 1) {
    for (const id of ids) group[id] = multiplyScales(scaleFactor, group[id] as V) as V;
  }
  group[thatId] = 1 as V;
}

function axisKey(id: string): string {
  const letter = id.charAt(0);
  return keyForSubplotId(id, `${letter}axis`, letter);
}

function domainLength(ax: FullAxis): number {
  return ax.domain[1] - ax.domain[0];
}

/** Is `range` a two-element range with both ends set? */
function isFullRange(range: unknown): boolean {
  return Array.isArray(range) && range.length === 2 && range[0] != null && range[1] != null;
}

/** Copy of a synced value: arrays and plain objects are copied (deeply), so axes never share them. */
function copyValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(copyValue);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = copyValue(val);
    return out;
  }
  return v;
}

/**
 * Constraint and linked-axis defaults over all cartesian axes (see the module comment). Sets
 * `fullLayout._axisMatchGroups` and `fullLayout._axisConstraintGroups`.
 *
 * Match-group sync (Plotly): for each synced attribute, the value comes from the group's axis
 * without `matches` (its root) if the user set it there, else from the first axis of the group
 * where the user set it. When an explicit full `range` was synced and no axis sets `autorange`,
 * `autorange` becomes `false`. Otherwise the root's full value is used. The value is copied to
 * every axis of the group.
 *
 * @param ids - Every cartesian axis id, x axes first, then y axes, each by number.
 * @param templateLayout - The template's layout (only `constraintoward` reads it).
 * @param matchDefaults - Default `matches` by axis id, used when the user's axis sets none (splom
 *   dimensions with `axis.matches`, E10.9; Plotly's `splomStash.matches`).
 */
export function supplyAxisConstraints(
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout,
  ids: readonly string[],
  templateLayout: Record<string, unknown> | undefined,
  matchDefaults?: ReadonlyMap<string, string>,
): void {
  const constraintGroups: AxisConstraintGroup[] = [];
  const matchGroups: AxisMatchGroup[] = [];
  fullLayout._axisConstraintGroups = constraintGroups;
  fullLayout._axisMatchGroups = matchGroups;
  const axis = (id: string): FullAxis => fullLayout[axisKey(id)] as FullAxis;
  const input = (id: string): Record<string, unknown> => {
    const v = layoutIn[axisKey(id)];
    return isPlainObject(v) ? v : {};
  };

  for (const id of ids) {
    const ax = axis(id);
    const axIn = input(id);
    const letter = id.charAt(0) === 'x' ? 'x' : 'y';

    const allowed: readonly string[] = TOWARD[letter];
    const pick = (v: unknown): FullAxis['constraintoward'] | undefined =>
      typeof v === 'string' && allowed.includes(v) ? (v as FullAxis['constraintoward']) : undefined;
    const key = axisKey(id);
    const tmpl = templateLayout?.[key] ?? templateLayout?.[`${letter}axis`];
    ax.constraintoward =
      pick(axIn['constraintoward']) ??
      pick(getIn(tmpl, 'constraintoward')) ??
      (letter === 'x' ? 'center' : 'middle');

    const group = findAxisGroup(constraintGroups, id);
    const candidates = ids.filter(
      (other) =>
        other !== id && axis(other).type === ax.type && !(group && Object.hasOwn(group, other)),
    );
    const isCandidate = (v: unknown): v is string =>
      typeof v === 'string' && candidates.includes(v);
    const requested = axIn['matches'] ?? matchDefaults?.get(id);
    const matches = isCandidate(requested) ? requested : undefined;
    const scaleanchor =
      matches === undefined && isCandidate(axIn['scaleanchor']) ? axIn['scaleanchor'] : undefined;

    if (matches !== undefined) {
      ax.matches = matches;
      updateConstraintGroups(matchGroups, id, matches, 1);
      const target = axis(matches);
      const lenRatio = domainLength(ax) / domainLength(target);
      const ratio = Number.isFinite(lenRatio) && lenRatio > 0 ? lenRatio : 1;
      const sameLetter = matches.charAt(0) === letter;
      updateConstraintGroups<number | string>(
        constraintGroups,
        id,
        matches,
        sameLetter ? ratio : `${letter}${ratio}`,
      );
    } else {
      delete (ax as { matches?: unknown }).matches;
    }
    if (scaleanchor !== undefined) {
      ax.scaleanchor = scaleanchor;
      // Plotly: a zero ratio means 1.
      if (!ax.scaleratio) ax.scaleratio = 1;
      updateConstraintGroups<number | string>(constraintGroups, id, scaleanchor, ax.scaleratio);
    } else {
      delete (ax as { scaleanchor?: unknown }).scaleanchor;
    }
  }

  // `fixedrange` on one axis fixes its whole constraint group.
  for (const group of constraintGroups) {
    const members = Object.keys(group);
    if (members.some((id) => axis(id).fixedrange)) {
      for (const id of members) axis(id).fixedrange = true;
    }
  }

  // A constraint group that is exactly a match group adds nothing.
  for (let i = 0; i < constraintGroups.length;) {
    const group = constraintGroups[i] as AxisConstraintGroup;
    const first = Object.keys(group)[0] as string;
    const matchGroup = findAxisGroup(matchGroups, first);
    if (matchGroup && Object.keys(matchGroup).length === Object.keys(group).length) {
      constraintGroups.splice(i, 1);
    } else {
      i++;
    }
  }

  for (const group of matchGroups) {
    const members = Object.keys(group);
    let explicitRange = false;
    for (const attr of MATCH_SYNCED) {
      let value: unknown;
      let root: FullAxis | undefined;
      let source: Record<string, unknown> | undefined;
      for (const id of members) {
        const ax = axis(id);
        const axIn = input(id);
        if (ax[attr] === undefined) continue;
        const set = axIn[attr] !== undefined;
        if (ax.matches === undefined) {
          root = ax;
          if (set) {
            value = ax[attr];
            source = axIn;
            break;
          }
        }
        if (value === undefined && set) {
          value = ax[attr];
          source = axIn;
        }
      }
      if (attr === 'range' && value !== undefined && isFullRange(source?.['range'])) {
        explicitRange = true;
      }
      if (attr === 'autorange' && value === undefined && explicitRange) value = false;
      if (value === undefined && root) value = root[attr];
      if (value === undefined) continue;
      for (const id of members) (axis(id) as Record<string, unknown>)[attr] = copyValue(value);
    }
    // As for a single axis (`defaults/axes.ts`): `reversed` with a synced partial range only
    // autoranges the `null` end — the full output fed back in reads it that way.
    for (const id of members) {
      const ax = axis(id);
      const range: readonly unknown[] = Array.isArray(ax.range) ? ax.range : [];
      if (ax.autorange !== 'reversed') continue;
      if (range[0] == null && range[1] != null) ax.autorange = 'max reversed';
      else if (range[0] != null && range[1] == null) ax.autorange = 'min reversed';
    }
  }
}
