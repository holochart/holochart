/**
 * Layout of the bar-like financial traces (plan E12.4, E12.5): plotly.js lays waterfalls and
 * funnels out with bar's `setGroupPositions`, each type on its own (a waterfall never shares a slot
 * with a bar or a funnel) with its own `<type>mode`, `<type>gap` and `<type>groupgap`. Here that is
 * bar's shared stacking helper (`layoutBars`) run per subplot, orientation and type, and the result
 * stored on the calc the way bar stores it, so bar's renderer, labels, hover and selection read
 * it unchanged.
 *
 * Funnels in `stack` mode are centered on the size axis' zero: each position's stack starts at
 * minus half its total (Plotly's funnel branch of `stackBars`).
 */
import type { AxisType, FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { CrossTraceContext, CrossTraceEntry } from '@mk7s/holochart-runtime';
import {
  layoutBars,
  type BarCalc,
  type StackInput,
  type StackOptions,
  type StackOutput,
} from '@mk7s/holochart-traces-basic';
import { alignmentKey, alignmentKeyOf, positionAxisId } from './defaults.ts';

/** `layout.waterfallmode` / `layout.funnelmode`. */
export type BarLikeMode = 'group' | 'overlay' | 'stack';

/** Calc space → linear on the size axis (log10 on log axes, NaN at or below zero). */
export function toLinear(type: AxisType | undefined, c: number): number {
  if (type !== 'log') return c;
  return c > 0 ? Math.log10(c) : NaN;
}

/** Layout options of `type` for bars on `positionAxis` with `orientation`. */
export function layoutOptions(
  type: 'waterfall' | 'funnel',
  fullLayout: FullLayout,
  positionAxis: string,
  orientation: string,
  sizeType: AxisType | undefined,
): StackOptions & { readonly mode: BarLikeMode } {
  const groups = fullLayout[alignmentKeyOf(type)] as Record<string, string[]> | undefined;
  const num = (v: unknown, dflt: number): number => (typeof v === 'number' ? v : dflt);
  const mode = fullLayout[`${type}mode`];
  return {
    mode:
      mode === 'group' || mode === 'overlay' || mode === 'stack'
        ? mode
        : type === 'funnel'
          ? 'stack'
          : 'group',
    gap: num(fullLayout[`${type}gap`], 0.2),
    groupgap: num(fullLayout[`${type}groupgap`], 0),
    norm: '',
    sizeLog: sizeType === 'log',
    offsetGroups: (alignmentgroup) =>
      groups?.[alignmentKey(positionAxis, orientation, alignmentgroup)],
  };
}

/** The stacking helper's input for one trace; `base` replaces the calc's bases (funnel stacks). */
export function stackInput(
  calc: BarCalc,
  trace: FullTrace,
  index: number,
  base?: { readonly base: Float64Array; readonly hasBase: Uint8Array },
): StackInput {
  return {
    length: calc.length,
    pos: calc.pos,
    size: calc.size,
    base: base?.base ?? calc.base,
    hasBase: base?.hasBase ?? calc.hasBase,
    width: trace['width'],
    offset: trace['offset'],
    offsetgroup: String(trace['offsetgroup'] ?? ''),
    alignmentgroup: String(trace['alignmentgroup'] ?? ''),
    key: String(index),
  };
}

/**
 * Store a layout result on a calc as bar does (without error bars): the bars, their linear start
 * and end on the size axis, and where their ends are.
 */
export function applyBars(calc: BarCalc, bars: StackOutput): void {
  const n = calc.length;
  const s0 = new Float64Array(n);
  const s1 = new Float64Array(n);
  let floor = false;
  for (let i = 0; i < n; i++) {
    const top = toLinear(calc.sizeType, bars.top[i]!);
    let start = toLinear(calc.sizeType, bars.base[i]!);
    // Log axes: a bar from zero (or below) starts below the visible range (Plotly).
    if (calc.sizeType === 'log' && !(bars.base[i]! > 0) && Number.isFinite(top)) {
      start = -Infinity;
      floor = true;
    }
    s0[i] = start;
    s1[i] = top;
  }
  calc.bars = bars;
  calc.s0 = s0;
  calc.s1 = s1;
  calc.floor = floor;
  calc.ends = calc.orientation === 'h' ? { x: s1, y: bars.center } : { x: bars.center, y: s1 };
  calc.errorX = undefined;
  calc.errorY = undefined;
}

/**
 * Center stacked funnels on zero (Plotly's `stackBars` for funnels): after a `stack` layout from
 * zero, shift each stack (per position bin and offset slot, as the stacking helper bins them) down
 * by half its total. Mutates the outputs; sizes must not be negative.
 */
export function centerStacks(inputs: readonly StackInput[], outputs: readonly StackOutput[]): void {
  const explicit = inputs.some((input) => (input.offsetgroup ?? '') !== '');
  const keyOf = (input: StackInput, out: StackOutput, i: number): string => {
    const slot = explicit ? `${input.alignmentgroup ?? ''}\u0001${input.offsetgroup ?? ''}` : '';
    const bin = out.slot > 0 && Number.isFinite(out.slot) ? out.slot / 100 : 1;
    return `${slot}\u0000${Math.round(input.pos[i]! / bin)}`;
  };
  const totals = new Map<string, number>();
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    for (let i = 0; i < input.length; i++) {
      if (!Number.isFinite(out.top[i]!)) continue;
      const key = keyOf(input, out, i);
      totals.set(key, (totals.get(key) ?? 0) + input.size[i]!);
    }
  });
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    const points: number[] = [];
    for (let i = 0; i < input.length; i++) {
      if (!Number.isFinite(out.top[i]!)) continue;
      const shift = -(totals.get(keyOf(input, out, i)) ?? 0) / 2;
      out.base[i] = out.base[i]! + shift;
      out.top[i] = out.top[i]! + shift;
      points.push(out.top[i]!, out.base[i]!);
    }
    out.sizePoints = Float64Array.from(points);
    out.tozero = true;
    out.padded = true;
  });
}

/** How a type lays out one subplot's traces of one orientation (see {@link crossTraceLayout}). */
export interface BarLikeLayout<C extends BarCalc> {
  readonly type: 'waterfall' | 'funnel';
  /** The stacking helper's input of a trace in `mode`. */
  input(calc: C, trace: FullTrace, index: number, mode: BarLikeMode): StackInput;
  /** After the layout: adjust the outputs of every trace of the group (e.g. center stacks). */
  adjust?(inputs: readonly StackInput[], outputs: StackOutput[], mode: BarLikeMode): void;
  /** After storing the bars on a calc: per-type geometry (waterfall starts). */
  finish?(calc: C): void;
}

/** Lay out one trace alone (its `calc`, before or without a cross-trace pass). */
export function layoutAlone<C extends BarCalc>(
  spec: BarLikeLayout<C>,
  calc: C,
  trace: FullTrace,
  index: number,
  fullLayout: FullLayout,
): void {
  const options = layoutOptions(
    spec.type,
    fullLayout,
    positionAxisId(trace),
    calc.orientation,
    calc.sizeType,
  );
  const inputs = [spec.input(calc, trace, index, options.mode)];
  const outputs = layoutBars(inputs, options);
  spec.adjust?.(inputs, outputs, options.mode);
  applyBars(calc, outputs[0]!);
  spec.finish?.(calc);
}

/**
 * Cross-trace calc: lay out every trace of the type on one subplot together, per orientation
 * (each has its own position axis), in trace order.
 */
export function crossTraceLayout<C extends BarCalc>(
  spec: BarLikeLayout<C>,
  entries: readonly CrossTraceEntry<C>[],
  ctx: CrossTraceContext,
): void {
  for (const orientation of ['v', 'h'] as const) {
    const group = entries.filter((e) => e.calc && e.calc.orientation === orientation);
    if (group.length === 0) continue;
    const [pa, sa] = orientation === 'h' ? [ctx.yaxis, ctx.xaxis] : [ctx.xaxis, ctx.yaxis];
    const options = layoutOptions(spec.type, ctx.fullLayout, pa.id, orientation, sa.scale.type);
    const inputs = group.map((e) => spec.input(e.calc, e.trace, e.index, options.mode));
    const outputs = layoutBars(inputs, options);
    spec.adjust?.(inputs, outputs, options.mode);
    group.forEach((e, k) => {
      applyBars(e.calc, outputs[k]!);
      spec.finish?.(e.calc);
    });
  }
}
