/**
 * What modebar buttons do (plan E5.8). Everything goes through the public chart API
 * (`chart.relayout`), so modebar actions emit the same events and follow the same update path
 * as programmatic edits. The range math and update builders are pure and unit-tested.
 */
import { isPlainObject } from '@mk7s/holochart-core';

/** Zoom factor of the "Zoom in" button (half the span); "Zoom out" doubles it. */
export const MODEBAR_ZOOM_IN_FACTOR = 0.5;
/** Zoom factor of the "Zoom out" button. */
export const MODEBAR_ZOOM_OUT_FACTOR = 2;

/** The parts of a cartesian axis (`AxisInfo`) the modebar actions use. */
export interface ModebarAxisLike {
  /** Layout key: `'xaxis'`, `'yaxis2'`, … */
  readonly name: string;
  /** The defaulted axis (read for `fixedrange` and `showspikes` when the schema has them). */
  readonly full?: unknown;
  readonly scale: {
    /** Range in use, linear coordinates (`range[0] > range[1]` when reversed). */
    readonly range: readonly [number, number];
    /** Linear → range value (numbers; ISO strings on date axes). */
    l2r(l: number): unknown;
  };
}

/** A layout update (attribute string → value), as passed to `chart.relayout`. */
export type ModebarLayoutUpdate = Record<string, unknown>;

/** What {@link recordModebarResetState} remembers of one axis' input. */
export interface ModebarAxisResetEntry {
  readonly range?: readonly unknown[];
  readonly autorange?: unknown;
}

/** The initial axis ranges "Reset axes" returns to, by layout key (`'xaxis2'`). */
export type ModebarResetState = ReadonlyMap<string, ModebarAxisResetEntry>;

const AXIS_KEY = /^[xy]axis([2-9]|[1-9]\d+)?$/;

function fullRecord(axis: ModebarAxisLike): Readonly<Record<string, unknown>> | undefined {
  const full = axis.full;
  return typeof full === 'object' && full !== null ? (full as Record<string, unknown>) : undefined;
}

function fullField(axis: ModebarAxisLike, key: string): unknown {
  return fullRecord(axis)?.[key];
}

/**
 * Whether the axis may not be zoomed. `fixedrange` is read defensively: the axis schema does not
 * define it yet (contract gap), so today this is always `false`.
 */
export function modebarAxisFixed(axis: ModebarAxisLike): boolean {
  return fullField(axis, 'fixedrange') === true;
}

/**
 * Scale a linear range about its center: `factor` 0.5 halves the span (zoom in), 2 doubles it
 * (zoom out). Reversed ranges stay reversed. `undefined` for non-finite input.
 */
export function modebarZoomRange(
  range: readonly [number, number],
  factor: number,
): [number, number] | undefined {
  const [r0, r1] = range;
  if (!Number.isFinite(r0) || !Number.isFinite(r1) || !(factor > 0)) return undefined;
  const center = (r0 + r1) / 2;
  const half = ((r1 - r0) / 2) * factor;
  return [center - half, center + half];
}

/**
 * The relayout update for "Zoom in"/"Zoom out": every non-fixed axis' range scaled about its
 * center in linear space, converted back to range values (`l2r`: exponents on log axes, ISO
 * strings on date axes), as `'<axis>.range': [a, b]`.
 */
export function modebarZoomUpdate(
  axes: Iterable<ModebarAxisLike>,
  factor: number,
): ModebarLayoutUpdate {
  const out: ModebarLayoutUpdate = {};
  for (const axis of axes) {
    if (modebarAxisFixed(axis)) continue;
    const range = modebarZoomRange(axis.scale.range, factor);
    if (!range) continue;
    out[`${axis.name}.range`] = [axis.scale.l2r(range[0]), axis.scale.l2r(range[1])];
  }
  return out;
}

/** The relayout update for "Autoscale": `'<axis>.autorange': true` on every non-fixed axis. */
export function modebarAutoscaleUpdate(axes: Iterable<ModebarAxisLike>): ModebarLayoutUpdate {
  const out: ModebarLayoutUpdate = {};
  for (const axis of axes) if (!modebarAxisFixed(axis)) out[`${axis.name}.autorange`] = true;
  return out;
}

/**
 * Remember the axis ranges of the user's input layout (`chart.layout`), for "Reset axes". Only
 * axes whose input has a `range` array or an `autorange` are recorded; the others reset to
 * autorange. Arrays are copied, so later edits of the input do not leak in.
 */
export function recordModebarResetState(
  layout: Readonly<Record<string, unknown>>,
): ModebarResetState {
  const state = new Map<string, ModebarAxisResetEntry>();
  for (const [key, value] of Object.entries(layout)) {
    if (!AXIS_KEY.test(key) || !isPlainObject(value)) continue;
    const range = Array.isArray(value['range']) ? [...(value['range'] as unknown[])] : undefined;
    const autorange = value['autorange'];
    if (range === undefined && autorange === undefined) continue;
    state.set(key, {
      ...(range !== undefined && { range }),
      ...(autorange !== undefined && { autorange }),
    });
  }
  return state;
}

/**
 * The relayout update for "Reset axes": each non-fixed axis goes back to its recorded input range
 * (with its recorded `autorange`, if any); axes without a recorded range autorange (keeping a
 * recorded non-`false` `autorange` such as `'reversed'`). A range the user's current input holds
 * is cleared (`null`) when autoranging, so the input returns to its original shape.
 *
 * @param layout - The current input layout (`chart.layout`), to know which ranges to clear.
 */
export function modebarResetUpdate(
  axes: Iterable<ModebarAxisLike>,
  state: ModebarResetState,
  layout: Readonly<Record<string, unknown>> = {},
): ModebarLayoutUpdate {
  const out: ModebarLayoutUpdate = {};
  for (const axis of axes) {
    if (modebarAxisFixed(axis)) continue;
    const entry = state.get(axis.name);
    if (entry?.range !== undefined) {
      out[`${axis.name}.range`] = [...entry.range];
      if (entry.autorange !== undefined) out[`${axis.name}.autorange`] = entry.autorange;
      continue;
    }
    const auto = entry?.autorange;
    out[`${axis.name}.autorange`] = auto !== undefined && auto !== false ? auto : true;
    const current = layout[axis.name];
    if (isPlainObject(current) && Array.isArray(current['range'])) {
      out[`${axis.name}.range`] = null;
    }
  }
  return out;
}

/** Whether any axis shows spike lines, and whether the axis schema has `showspikes` at all. */
export function modebarSpikelinesState(axes: Iterable<ModebarAxisLike>): {
  readonly supported: boolean;
  readonly on: boolean;
} {
  let supported = false;
  let on = false;
  for (const axis of axes) {
    const full = fullRecord(axis);
    if (full !== undefined && 'showspikes' in full) supported = true;
    if (fullField(axis, 'showspikes') === true) on = true;
  }
  return { supported, on };
}

/**
 * The relayout update for "Toggle Spike Lines": `'<axis>.showspikes'` on every axis, flipped from
 * the current state. Empty when the axis schema has no `showspikes` (today: always — the button
 * is then a no-op until E6 adds spike lines).
 */
export function modebarSpikelinesUpdate(axes: Iterable<ModebarAxisLike>): ModebarLayoutUpdate {
  const list = [...axes];
  const { supported, on } = modebarSpikelinesState(list);
  const out: ModebarLayoutUpdate = {};
  if (!supported) return out;
  for (const axis of list) out[`${axis.name}.showspikes`] = !on;
  return out;
}

/** The parts of a chart {@link modebarDownloadImage} uses. */
export interface ModebarImageSource {
  readonly element: HTMLElement;
  readonly fullConfig:
    { readonly toImageButtonOptions?: { readonly filename?: unknown } } | undefined;
  readonly three: {
    readonly renderer: { readonly domElement: HTMLCanvasElement };
    readonly root: { renderNow(): void };
  };
}

/**
 * Download the chart as a PNG (`<toImageButtonOptions.filename>.png`, default `newplot.png`).
 *
 * The frame is rendered synchronously right before `toDataURL`, in the same task, which reads a
 * valid drawing buffer even without `preserveDrawingBuffer`. This is the minimal version: the
 * canvas at its current size and pixel ratio, PNG only, WebGL content only (DOM overlays such as
 * the modebar are not captured). Proper export (`scale`, `width`/`height`, formats) is E18.1.
 */
export function modebarDownloadImage(chart: ModebarImageSource): void {
  const filename = chart.fullConfig?.toImageButtonOptions?.filename;
  const name = typeof filename === 'string' && filename !== '' ? filename : 'newplot';
  const three = chart.three;
  three.root.renderNow();
  const url = three.renderer.domElement.toDataURL('image/png');
  const doc = chart.element.ownerDocument;
  const link = doc.createElement('a');
  link.href = url;
  link.download = `${name}.png`;
  link.style.display = 'none';
  (doc.body ?? doc.documentElement).appendChild(link);
  link.click();
  link.remove();
}
