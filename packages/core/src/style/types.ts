/**
 * Types of conditional styling (plan E8.5, E8.6, ADR-012): serializable style rules
 * (`trace.styleRules`) and style functions on per-point (`arrayOk`) attributes.
 *
 * The chart runtime resolves both into plain per-point arrays before trace modules see the data;
 * see the runtime's `style/` code and the "Conditional styling" docs page.
 */

/** A value a condition compares against: numbers, strings (ISO dates compare as dates), booleans. */
export type StyleValue = string | number | boolean | null;

/**
 * Operators on one field. Several operators on one field must all hold.
 *
 * - `eq` / `ne`: strict equality (`eq: null` matches missing values).
 * - `gt` / `gte` / `lt` / `lte`: numbers compare numerically (numeric strings and `Date`s too),
 *   strings lexicographically (so ISO dates compare in time order). Missing values never match.
 * - `in` / `nin`: membership in a list.
 * - `between`: `[low, high]`, both ends included.
 * - `regex`: a pattern tested against string (and number) values: `'^A'` or
 *   `{ pattern: '^a', flags: 'i' }`.
 */
export interface StyleOperators {
  readonly eq?: StyleValue;
  readonly ne?: StyleValue;
  readonly gt?: number | string;
  readonly gte?: number | string;
  readonly lt?: number | string;
  readonly lte?: number | string;
  readonly in?: readonly StyleValue[];
  readonly nin?: readonly StyleValue[];
  readonly between?: readonly [number | string, number | string];
  readonly regex?: string | { readonly pattern: string; readonly flags?: string };
}

/**
 * A condition on a point. Keys are fields of the trace (`'y'`, `'text'`, `'marker.size'`,
 * `'customdata[1]'`, or `'pointNumber'`, the point's index) holding {@link StyleOperators} or a
 * value (shorthand for `eq`). Several fields must all hold; `and`, `or` and `not` combine
 * conditions.
 *
 * @example
 * ```ts
 * { y: { gt: 10 }, 'customdata[1]': { in: ['A', 'B'] } }
 * { or: [{ y: { lt: 0 } }, { not: { text: { regex: '^ok' } } }] }
 * ```
 */
export interface StyleCondition {
  readonly and?: readonly StyleCondition[];
  readonly or?: readonly StyleCondition[];
  readonly not?: StyleCondition;
  readonly [field: string]:
    StyleOperators | StyleValue | StyleCondition | readonly StyleCondition[] | undefined;
}

/**
 * A serializable style rule (plan E8.5): per-point attributes (`'marker.color'`, `'marker.size'`,
 * `'text'`, … — any `arrayOk` attribute of the trace) set on the points matching `when`. Later rules
 * win over earlier ones; points no rule matches keep the trace's own value.
 *
 * @example
 * ```ts
 * { when: { y: { gt: 10 } }, set: { 'marker.color': 'gold', 'marker.size': 14 } }
 * ```
 */
export interface StyleRule {
  /** Which points the rule applies to. Omitted: every point. */
  readonly when?: StyleCondition;
  /** Attribute strings of per-point (`arrayOk`) attributes and the value to give them. */
  readonly set: Readonly<Record<string, StyleValue>>;
}

/**
 * What a style function gets for each point (plan E8.6): the point's value in each of the trace's
 * data arrays (`x`, `y`, `z`, `customdata`, `ids`, …) and in its top-level per-point arrays such
 * as `text` (dataset `'@column'` references resolved), and its index.
 */
export interface StylePoint {
  /** Index of the point in the trace's data arrays. */
  readonly pointNumber: number;
  readonly [field: string]: unknown;
}

/**
 * A style function (plan E8.6, ADR-012) on a per-point (`arrayOk`) attribute, e.g.
 * `marker: { color: (p) => (p.y > 10 ? 'gold' : 'gray') }`. It is called once per point with the
 * point, its index and the input trace, and behaves exactly like the array of its results. Not
 * serializable: `chartToJSON()` stores the evaluated array (with a warning).
 */
export type StyleFunction<T = unknown> = (
  point: StylePoint,
  index: number,
  trace: Readonly<Record<string, unknown>>,
) => T;
