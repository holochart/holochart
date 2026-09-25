/**
 * Multi-subplot traces (M3 wave 2, E10.9 `splom`): helpers the chart pipeline uses for traces
 * whose module lists the subplots they draw on ({@link TraceModule.cells}) instead of naming one
 * `xaxis` / `yaxis` pair. Everything here is pure, so the chart only needs one-line hooks:
 *
 * - axes: category lists from {@link TraceModule.axisData}, a recalc when any cell axis is
 *   rescaled ({@link cellsRescaled}), autorange from `extremes(…).byAxis` ({@link extremesOn});
 * - drawing: `ctx.cells` ({@link traceCells}) and primitives added to cell viewports, remembered
 *   per primitive so the view's disposal removes them from the right viewport
 *   ({@link placePrimitive}, {@link placedViewport});
 * - hover and selection: one entry per cell ({@link entrySubplots}).
 */
import type { AxisExtremes, FullTrace } from '@mk7s/holochart-core';
import type { Primitive, Viewport } from '@mk7s/holochart-render';
import type { TraceExtremes, TraceModule } from './contracts.ts';

/** The runtime module of a defaulted trace (the core module object is the same object). */
function moduleOf(trace: FullTrace): TraceModule | undefined {
  return trace._module as TraceModule | undefined;
}

/** Whether `module` draws on several subplots. */
export function isMultiSubplot(module: TraceModule | undefined): boolean {
  return typeof module?.cells === 'function';
}

/**
 * The subplots of a multi-subplot trace's cells that exist, in the module's order, or `undefined`
 * for other traces.
 */
export function traceCells<S>(
  module: TraceModule | undefined,
  trace: FullTrace,
  subplots: ReadonlyMap<string, S>,
): S[] | undefined {
  if (!module?.cells) return undefined;
  const out: S[] = [];
  for (const ref of module.cells(trace)) {
    const sp = subplots.get(ref.xaxis + ref.yaxis);
    if (sp !== undefined && !out.includes(sp)) out.push(sp);
  }
  return out;
}

/**
 * The subplots a trace is hovered and selected on: its cells (multi-subplot traces), else the one
 * its `xaxis` / `yaxis` name, else none.
 */
export function entrySubplots<S>(
  module: TraceModule | undefined,
  trace: FullTrace,
  subplots: ReadonlyMap<string, S>,
): S[] {
  const cells = traceCells(module, trace, subplots);
  if (cells) return cells;
  const sp = subplots.get(`${String(trace['xaxis'])}${String(trace['yaxis'])}`);
  return sp === undefined ? [] : [sp];
}

/** Axis ids of a multi-subplot trace's cells. */
export function cellAxisIds(module: TraceModule | undefined, trace: FullTrace): Set<string> {
  const ids = new Set<string>();
  if (!module?.cells) return ids;
  for (const ref of module.cells(trace)) {
    ids.add(ref.xaxis);
    ids.add(ref.yaxis);
  }
  return ids;
}

/** Whether a multi-subplot trace has a cell on one of the `rescaled` axes (it must calc again). */
export function cellsRescaled(
  module: TraceModule | undefined,
  trace: FullTrace,
  rescaled: ReadonlySet<string>,
): boolean {
  if (!module?.cells || rescaled.size === 0) return false;
  for (const id of cellAxisIds(module, trace)) if (rescaled.has(id)) return true;
  return false;
}

/**
 * The data a multi-subplot trace puts on axis `id` (for its category list), or `undefined` (also
 * for every other trace, whose `x` / `y` the chart reads itself).
 */
export function axisDataOf(trace: FullTrace, id: string): unknown {
  const module = moduleOf(trace);
  if (!module?.axisData || trace.visible === false) return undefined;
  return module.axisData(trace, id);
}

/**
 * A trace's autorange contribution to `axis` (id and letter): from `byAxis` for multi-subplot
 * traces, else from `x` / `y` when the trace's own axis is `axis`.
 */
export function extremesOn(
  extremes: TraceExtremes | undefined,
  trace: FullTrace,
  axis: { readonly id: string; readonly letter: 'x' | 'y' },
): AxisExtremes | undefined {
  if (!extremes) return undefined;
  if (extremes.byAxis) return extremes.byAxis[axis.id];
  return trace[`${axis.letter}axis`] === axis.id ? extremes[axis.letter] : undefined;
}

/** Where primitives added to a viewport other than their trace's live (cell viewports). */
const placed = new WeakMap<Primitive<unknown>, Viewport>();

/** Remember that `primitive` was added to `viewport` (a cell's, not the trace's own). */
export function placePrimitive(primitive: Primitive<unknown>, viewport: Viewport): void {
  placed.set(primitive, viewport);
}

/** The viewport `primitive` was placed in by {@link placePrimitive}, if any. */
export function placedViewport(primitive: Primitive<unknown>): Viewport | undefined {
  return placed.get(primitive);
}
