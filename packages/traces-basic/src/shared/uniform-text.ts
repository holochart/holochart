/**
 * Cross-trace `layout.uniformtext` negotiation (plan E4.6) for trace views.
 *
 * Plotly sizes bar (and pie) labels uniformly per trace TYPE: every trace of the type records its
 * labels' sizes (`recordMinTextSize`), and once all are plotted each label is resized to the
 * type's minimum (`resizeText`). Holochart's trace views update one after another with no hook
 * after the last one, so this coordinator keeps, per chart and trace type, each view's latest
 * items and the uniform size it last drew with. A view {@link negotiateUniformText | records} its
 * items and draws with the size returned; when that size differs from what another view drew
 * with, that view is refreshed synchronously (it recomputes its labels from its cached context and
 * records identical items, so the negotiation settles without loops).
 *
 * The math is core's (`uniformTextSize`); this module only does the bookkeeping. Groups live in a
 * `WeakMap` keyed by the chart's `ctx.primitives` (stable per chart), so they go with the chart.
 */
import { uniformTextSize, type UniformText, type UniformTextItem } from '@mk7s/holochart-core';

/**
 * Recompute and redraw a view's labels with this `uniformtext` (the group's, which may be newer
 * than the view's cached layout), recording them again through {@link negotiateUniformText}.
 */
export type UniformTextRefresh = (uniform: UniformText) => void;

interface Group {
  /** The `uniformtext` of the latest recording. */
  uniform: UniformText;
  readonly items: Map<object, readonly UniformTextItem[]>;
  /** The uniform size each view last drew with. */
  readonly applied: Map<object, number | undefined>;
  readonly refresh: Map<object, UniformTextRefresh>;
  /** Refreshing other views: nested recordings don't start another round. */
  busy: boolean;
}

/** Refresh rounds before giving up (each settles unless a view's items keep changing). */
const MAX_ROUNDS = 4;

const scopes = new WeakMap<object, Map<string, Group>>();

function groupOf(scope: object, type: string): Group | undefined {
  return scopes.get(scope)?.get(type);
}

function sizeOf(group: Group): number | undefined {
  const all: UniformTextItem[] = [];
  for (const items of group.items.values()) for (const item of items) all.push(item);
  return uniformTextSize(all, group.uniform);
}

/** Refresh every view whose drawn size differs from the group's, until none does. */
function settle(group: Group): void {
  if (group.busy) return;
  group.busy = true;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const size = sizeOf(group);
      const stale: object[] = [];
      for (const [view, applied] of group.applied) if (applied !== size) stale.push(view);
      if (stale.length === 0) return;
      // A refresh re-records (updating `applied`) or releases the view.
      for (const view of stale) group.refresh.get(view)?.(group.uniform);
    }
  } finally {
    group.busy = false;
  }
}

/**
 * Record a view's label items for its trace type and get the uniform size to draw them with
 * (`undefined` when `uniform.mode` is off: draw as laid out). Other views of the type are
 * refreshed when the size they drew with is no longer the type's.
 *
 * @param scope - Per-chart key: the view's `ctx.primitives`.
 * @param type - The trace type (`trace.type`): Plotly negotiates per type.
 * @param view - The recording view (identity key).
 * @param items - `{ fontSize, scale }` of each of its labels, hidden candidates included.
 * @param refresh - Redraws the view with a given `uniformtext` (see {@link UniformTextRefresh}).
 */
export function negotiateUniformText(
  scope: object,
  type: string,
  view: object,
  items: readonly UniformTextItem[],
  uniform: UniformText,
  refresh: UniformTextRefresh,
): number | undefined {
  if (!uniform.mode) {
    const group = groupOf(scope, type);
    if (!group) return undefined;
    // Turned off: the others are redrawn without it too (they drop out as they refresh).
    group.uniform = uniform;
    releaseUniformText(scope, type, view, true);
    return undefined;
  }
  let types = scopes.get(scope);
  if (!types) scopes.set(scope, (types = new Map()));
  let group = types.get(type);
  if (!group) {
    group = { uniform, items: new Map(), applied: new Map(), refresh: new Map(), busy: false };
    types.set(type, group);
  }
  group.uniform = uniform;
  group.items.set(view, items);
  group.refresh.set(view, refresh);
  group.applied.set(view, sizeOf(group));
  settle(group);
  const size = sizeOf(group);
  group.applied.set(view, size);
  return size;
}

/**
 * Remove a view from its type's negotiation (its text was removed, `uniformtext` turned off, or it
 * is disposed). With `settle`, the remaining views are refreshed if the type's size changed; pass
 * `false` from `dispose`, when the other views may be going away too.
 */
export function releaseUniformText(
  scope: object,
  type: string,
  view: object,
  settleOthers = true,
): void {
  const types = scopes.get(scope);
  const group = types?.get(type);
  if (!types || !group) return;
  group.items.delete(view);
  group.applied.delete(view);
  group.refresh.delete(view);
  if (group.items.size === 0) {
    types.delete(type);
    if (types.size === 0) scopes.delete(scope);
    return;
  }
  if (settleOthers) settle(group);
}

/** The type's current uniform size (tests and debugging). */
export function currentUniformTextSize(scope: object, type: string): number | undefined {
  const group = groupOf(scope, type);
  return group ? sizeOf(group) : undefined;
}
