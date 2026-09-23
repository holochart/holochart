/**
 * Bar grouping and stacking (plan E9.9): a port of plotly.js' `bar/cross_trace_calc.js` that works
 * on typed arrays and knows nothing about trace types, so `bar`, `histogram` (E10.1), `funnel`
 * (E12.5) and `waterfall` (E12.4) share it.
 *
 * ## Spaces
 *
 * - Positions (`pos`, and every output on the position axis) are **linear coordinates** of the
 *   position axis (category index, ms for dates, log10 on log axes). Widths and offsets are in the
 *   same units, so date bars are sized in ms and category bars in category slots.
 * - Sizes and bases are in **calc space** of the size axis: numbers, ms for dates, and the raw
 *   data values on log axes (stacking adds values, not their logarithms — Plotly semantics). The
 *   caller converts the outputs to linear coordinates.
 *
 * ## Modes (`layout.barmode`)
 *
 * - `group`: traces at the same position sit side by side. Each alignment group splits the slot
 *   (`(1 - bargap)` of the smallest position spacing) between its offset groups; a trace without
 *   `offsetgroup` is its own group. When no two bars share a position, every bar gets the full
 *   slot (Plotly).
 * - `overlay`: bars are centered on their position and drawn over each other.
 * - `stack`: bars at the same position (and offset group) stack in trace order.
 * - `relative`: like `stack`, but negative values stack downwards from zero separately.
 *
 * `barnorm` rescales each position's total to 1 (`fraction`) or 100 (`percent`).
 */

/** `layout.barmode`. */
export type BarMode = 'group' | 'stack' | 'relative' | 'overlay';

/** `layout.barnorm`. */
export type BarNorm = '' | 'fraction' | 'percent';

/** Layout options for {@link layoutBars}. */
export interface StackOptions {
  readonly mode: BarMode;
  /** `bargap`: fraction of the position slot left empty between neighboring positions. */
  readonly gap: number;
  /** `bargroupgap`: fraction of each offset group's share left empty between grouped bars. */
  readonly groupgap: number;
  readonly norm: BarNorm;
  /**
   * The size axis is logarithmic: normalized values at or below zero need padding (Plotly's
   * `needsPadding` compares linearized values).
   */
  readonly sizeLog?: boolean;
  /**
   * Ordered `offsetgroup` names of an alignment group across every trace on this position axis
   * (all subplots), so grouped bars line up across subplots (Plotly's `_alignmentOpts`). Defaults
   * to the groups of the given inputs, in order.
   */
  readonly offsetGroups?: (alignmentgroup: string) => readonly string[] | undefined;
}

/** One trace's bars, as the stacking helper reads them. Arrays are index-aligned. */
export interface StackInput {
  readonly length: number;
  /** Position of each bar (linear coordinates). Non-finite: the bar is skipped. */
  readonly pos: ArrayLike<number>;
  /** Size of each bar (calc space). Non-finite: the bar is skipped. */
  readonly size: ArrayLike<number>;
  /** User `base` per bar (calc space); 0 where unset. */
  readonly base: ArrayLike<number>;
  /** Non-zero where the user set a base for that bar. */
  readonly hasBase: ArrayLike<number>;
  /** User `width`: one value or one per bar (position units). Non-numeric entries are ignored. */
  readonly width?: unknown;
  /** User `offset`: one value or one per bar (position units). Non-numeric entries are ignored. */
  readonly offset?: unknown;
  readonly offsetgroup?: string;
  readonly alignmentgroup?: string;
  /** Unique key of this input (e.g. the trace index), naming its own offset slot. */
  readonly key: string;
  /**
   * A minimum position spacing this input knows about, such as a histogram's bin width (Plotly's
   * `width1`); it wins when all bars share one position.
   */
  readonly minSpacing?: number;
}

/** What {@link layoutBars} computes for one input. Arrays are index-aligned with the input. */
export interface StackOutput {
  /** Bar center on the position axis (linear). NaN for skipped bars. */
  readonly center: Float64Array;
  /** Bar width (position units). */
  readonly width: Float64Array;
  /** Stacked base (calc space). */
  readonly base: Float64Array;
  /** Stacked top (calc space); the bar spans `base` → `top`. NaN for skipped bars. */
  readonly top: Float64Array;
  /** The bar's own value for labels and hover: its size, normalized with `barnorm`. */
  readonly value: Float64Array;
  /**
   * 1 for the outermost bar of a stack (or every bar when not stacking). Only outermost bars may
   * show `outside` text or rounded corners.
   */
  readonly outmost: Uint8Array;
  /** Position-axis extent for autorange: the full slot around every position, unpadded. */
  posMin: number;
  posMax: number;
  /** Size-axis autorange points (calc space) with Plotly's `tozero` / `padded` options. */
  sizePoints: Float64Array;
  tozero: boolean;
  padded: boolean;
  /** Smallest distance between distinct positions (Plotly's `bardelta`). */
  slot: number;
  /** Width shared by a group of bars at one position (`slot * (1 - bargap)`). */
  groupWidth: number;
}

/** Plotly's `distinctVals`: sorted distinct values (within a tolerance) and their smallest gap. */
export function distinctValues(values: ArrayLike<number>): { values: number[]; minDiff: number } {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return { values: [], minDiff: 1 };
  const last = sorted.length - 1;
  let minDiff = sorted[last]! - sorted[0]! || 1;
  const errDiff = minDiff / (last || 1) / 10000;
  const out = [sorted[0]!];
  let prev = sorted[0]!;
  for (let i = 1; i <= last; i++) {
    const v = sorted[i]!;
    const diff = v - prev;
    if (diff > errDiff) {
      minDiff = Math.min(minDiff, diff);
      out.push(v);
      prev = v;
    }
  }
  return { values: out, minDiff };
}

/**
 * Running sums per position bin (Plotly's `Sieve`). `put` adds a value and returns the previous
 * sum, which is where a stacked bar starts.
 */
class Sieve {
  readonly #sums = new Map<string, number>();
  readonly #binWidth: number;
  readonly #sepNegVal: boolean;

  constructor(binWidth: number, sepNegVal: boolean) {
    this.#binWidth = binWidth > 0 && Number.isFinite(binWidth) ? binWidth : 1;
    this.#sepNegVal = sepNegVal;
  }

  #label(group: string, pos: number, value: number): string {
    const sign = this.#sepNegVal ? (value < 0 ? 'v' : '^') : '';
    return `${group}\u0000${Math.round(pos / this.#binWidth)}${sign}`;
  }

  put(group: string, pos: number, value: number): number {
    const label = this.#label(group, pos, value);
    const old = this.#sums.get(label) ?? 0;
    this.#sums.set(label, old + value);
    return old;
  }

  get(group: string, pos: number, value: number): number {
    return this.#sums.get(this.#label(group, pos, value)) ?? 0;
  }
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isArrayLike(v: unknown): v is ArrayLike<unknown> {
  return (
    v !== null && typeof v === 'object' && typeof (v as { length?: unknown }).length === 'number'
  );
}

/** Per-bar value of a scalar-or-array attribute, `fallback` where missing or not numeric. */
function perBar(value: unknown, i: number, fallback: number): number {
  if (isArrayLike(value)) {
    const v = value[i];
    return isNumber(v) ? v : fallback;
  }
  return isNumber(value) ? value : fallback;
}

function hasValue(value: unknown): boolean {
  return isArrayLike(value) || isNumber(value);
}

function allocate(n: number): StackOutput {
  return {
    center: new Float64Array(n).fill(NaN),
    width: new Float64Array(n),
    base: new Float64Array(n),
    top: new Float64Array(n).fill(NaN),
    value: new Float64Array(n).fill(NaN),
    outmost: new Uint8Array(n),
    posMin: Infinity,
    posMax: -Infinity,
    sizePoints: new Float64Array(0),
    tozero: false,
    padded: false,
    slot: 1,
    groupWidth: 1,
  };
}

function valid(input: StackInput, i: number): boolean {
  return Number.isFinite(input.pos[i]!) && Number.isFinite(input.size[i]!);
}

/** Offset slot (index, count) of each input, or `undefined` for a centered, ungrouped bar. */
function offsetSlots(
  inputs: readonly StackInput[],
  options: StackOptions,
  overlap: boolean,
): ({ index: number; count: number } | undefined)[] {
  const { mode } = options;
  if (mode === 'overlay') return inputs.map(() => undefined);
  const explicit = inputs.some((input) => (input.offsetgroup ?? '') !== '');
  if (!explicit) {
    // Without offset groups, stacks are centered; groups split the slot only if bars would overlap.
    if (mode !== 'group' || !overlap) return inputs.map(() => undefined);
    return inputs.map((_, index) => ({ index, count: inputs.length }));
  }
  // Keys per alignment group: named offset groups (across subplots when known), then the inputs
  // without one — each its own slot when grouping, one shared slot when stacking.
  const keys = new Map<string, string[]>();
  const keysOf = (alignment: string): string[] => {
    let list = keys.get(alignment);
    if (!list) {
      list = [...(options.offsetGroups?.(alignment) ?? [])];
      keys.set(alignment, list);
    }
    return list;
  };
  const slotKey = (input: StackInput): string =>
    (input.offsetgroup ?? '') !== ''
      ? (input.offsetgroup as string)
      : mode === 'group'
        ? `\u0000${input.key}`
        : '\u0000';
  for (const input of inputs) {
    const list = keysOf(input.alignmentgroup ?? '');
    const key = slotKey(input);
    if (!list.includes(key)) list.push(key);
  }
  return inputs.map((input) => {
    const list = keysOf(input.alignmentgroup ?? '');
    return { index: list.indexOf(slotKey(input)), count: list.length };
  });
}

/**
 * Lay out and stack the bars of several traces that share a position axis and orientation (one
 * subplot, one orientation), following `layout.barmode`. Pure: returns one {@link StackOutput} per
 * input, in input order (which is also the stacking order).
 *
 * @example
 * ```ts
 * const [a, b] = layoutBars([inputA, inputB], { mode: 'stack', gap: 0.2, groupgap: 0, norm: '' });
 * // b.base[i] === a.top[i] where both traces have a bar at the same position
 * ```
 */
export function layoutBars(inputs: readonly StackInput[], options: StackOptions): StackOutput[] {
  const outputs = inputs.map((input) => allocate(input.length));
  const { mode, norm } = options;

  // Positions (Plotly's Sieve constructor).
  const positions: number[] = [];
  let minSpacing = Infinity;
  for (const input of inputs) {
    for (let i = 0; i < input.length; i++) if (valid(input, i)) positions.push(input.pos[i]!);
    if (input.minSpacing !== undefined && input.minSpacing > 0) {
      minSpacing = Math.min(minSpacing, input.minSpacing);
    }
  }
  const distinct = distinctValues(positions);
  const slot =
    distinct.values.length === 1 && Number.isFinite(minSpacing)
      ? minSpacing
      : Math.min(distinct.minDiff, minSpacing);
  const overlap = positions.length !== distinct.values.length;
  const groupWidth = slot * (1 - options.gap);

  // Offsets and widths.
  const slots = offsetSlots(inputs, options, overlap);
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    out.slot = slot;
    out.groupWidth = groupWidth;
    const s = slots[t];
    let barWidth = groupWidth;
    let offset = -groupWidth / 2;
    if (s) {
      const plusGap = groupWidth / s.count;
      barWidth = plusGap * (1 - options.groupgap);
      offset = ((2 * s.index + 1 - s.count) * plusGap - barWidth) / 2;
    } else if (mode === 'group') {
      // Plotly applies the group gap even to a lone (non-overlapping) group.
      barWidth = groupWidth * (1 - options.groupgap);
      offset = -barWidth / 2;
    }
    const userWidth = hasValue(input.width);
    const userOffset = hasValue(input.offset);
    const vpad = slot / 2;
    for (let i = 0; i < input.length; i++) {
      if (!valid(input, i)) continue;
      const w = perBar(input.width, i, barWidth);
      // Without a user offset, a user width stays centered on the computed slot.
      const off = userOffset ? perBar(input.offset, i, offset) : offset + (barWidth - w) / 2;
      const p = input.pos[i]!;
      out.center[i] = p + off + w / 2;
      out.width[i] = w;
      out.posMin = Math.min(out.posMin, p - vpad);
      out.posMax = Math.max(out.posMax, p + vpad);
      if (userWidth || userOffset) {
        out.posMin = Math.min(out.posMin, p + off, p + off + w);
        out.posMax = Math.max(out.posMax, p + off, p + off + w);
      }
    }
  });

  // Sizes.
  const binWidth = slot / 100;
  if (mode === 'stack' || mode === 'relative') {
    stackBars(inputs, outputs, slots, new Sieve(binWidth, mode === 'relative'), options);
  } else {
    if (mode === 'group') unhideWithinTrace(inputs, outputs, binWidth);
    else for (let t = 0; t < inputs.length; t++) copyBases(inputs[t]!, outputs[t]!);
    if (norm) {
      const sieve = new Sieve(binWidth, false);
      inputs.forEach((input, t) => {
        const out = outputs[t]!;
        for (let i = 0; i < input.length; i++) {
          if (!valid(input, i)) continue;
          out.top[i] = out.base[i]! + input.size[i]!;
          sieve.put('', input.pos[i]!, out.top[i]!);
        }
      });
      normalize(inputs, outputs, () => '', sieve, options);
    } else {
      setBaseAndTop(inputs, outputs);
    }
  }
  return outputs;
}

function copyBases(input: StackInput, out: StackOutput): void {
  for (let i = 0; i < input.length; i++) {
    out.base[i] = input.base[i]!;
    out.outmost[i] = 1;
  }
}

/**
 * Group mode: bars of one trace at the same position would hide each other, so they are stacked
 * (relative) within the trace, unless the trace sets its own base (Plotly's
 * `unhideBarsWithinTrace`).
 */
function unhideWithinTrace(
  inputs: readonly StackInput[],
  outputs: readonly StackOutput[],
  binWidth: number,
): void {
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    copyBases(input, out);
    let anyBase = false;
    for (let i = 0; i < input.length && !anyBase; i++) anyBase = input.hasBase[i] !== 0;
    if (anyBase) return;
    const sieve = new Sieve(binWidth, true);
    for (let i = 0; i < input.length; i++) {
      if (!valid(input, i)) continue;
      const b = sieve.put('', input.pos[i]!, out.base[i]! + input.size[i]!);
      if (b) out.base[i] = b;
    }
  });
}

/** Unstacked bars: top = base + size (Plotly's `setBaseAndTop`). */
function setBaseAndTop(inputs: readonly StackInput[], outputs: readonly StackOutput[]): void {
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    const points: number[] = [];
    let tozero = false;
    for (let i = 0; i < input.length; i++) {
      if (!valid(input, i)) continue;
      const base = out.base[i]!;
      const top = base + input.size[i]!;
      out.top[i] = top;
      out.value[i] = input.size[i]!;
      points.push(top);
      if (input.hasBase[i]) points.push(base);
      if (!input.hasBase[i] || !base) tozero = true;
    }
    out.sizePoints = Float64Array.from(points);
    out.tozero = tozero;
    out.padded = true;
  });
}

/** Stack and relative modes (Plotly's `stackBars` + outermost-bar flags). */
function stackBars(
  inputs: readonly StackInput[],
  outputs: readonly StackOutput[],
  slots: readonly ({ index: number } | undefined)[],
  sieve: Sieve,
  options: StackOptions,
): void {
  // Bars stack per offset group (and alignment group, whose slots are numbered independently).
  const group = (t: number): string => {
    const s = slots[t];
    return s ? `${inputs[t]!.alignmentgroup ?? ''}\u0001${s.index}` : '';
  };
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    const g = group(t);
    for (let i = 0; i < input.length; i++) {
      if (!valid(input, i)) continue;
      // A user base shifts the bar within the stack: its value covers base + size (Plotly).
      const value = input.size[i]! + input.base[i]!;
      const base = sieve.put(g, input.pos[i]!, value);
      out.base[i] = base;
      out.top[i] = base + value;
      out.value[i] = input.size[i]!;
    }
  });
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    const g = group(t);
    for (let i = 0; i < input.length; i++) {
      if (!valid(input, i)) continue;
      const value = out.top[i]! - out.base[i]!;
      out.outmost[i] = out.top[i] === sieve.get(g, input.pos[i]!, value) ? 1 : 0;
    }
  });
  if (options.norm) {
    normalize(inputs, outputs, group, sieve, options);
    return;
  }
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    const points: number[] = [];
    for (let i = 0; i < input.length; i++) {
      if (!valid(input, i)) continue;
      points.push(out.top[i]!);
      if (input.hasBase[i]) points.push(out.base[i]!);
    }
    out.sizePoints = Float64Array.from(points);
    out.tozero = true;
    out.padded = true;
  });
}

/**
 * `barnorm`: scale every bar so each position's total is 1 or 100 (Plotly's `normalizeBars`). The
 * axis is padded only when some value falls outside `[0, total]` (e.g. negative bars).
 */
function normalize(
  inputs: readonly StackInput[],
  outputs: readonly StackOutput[],
  group: (t: number) => string,
  sieve: Sieve,
  options: StackOptions,
): void {
  const total = options.norm === 'fraction' ? 1 : 100;
  const tiny = total / 1e9;
  // Plotly's sMin is 0 in linear space, which does not exist on log axes (then always pad).
  const sMin = options.sizeLog ? NaN : 0;
  const sMax = options.mode === 'stack' ? total : sMin;
  const needsPadding = (v: number): boolean =>
    (options.sizeLog ? v > 0 : Number.isFinite(v)) &&
    (v < sMin - tiny || v > sMax + tiny || !Number.isFinite(sMin));
  inputs.forEach((input, t) => {
    const out = outputs[t]!;
    const g = group(t);
    const points: number[] = [];
    let tozero = false;
    let padded = false;
    for (let i = 0; i < input.length; i++) {
      if (!valid(input, i)) continue;
      const span = out.top[i]! - out.base[i]!;
      const sum = sieve.get(g, input.pos[i]!, Number.isFinite(span) ? span : input.size[i]!);
      const scale = sum ? Math.abs(total / sum) : NaN;
      const base = out.base[i]! * scale;
      const top = base + span * scale;
      out.base[i] = base;
      out.top[i] = top;
      out.value[i] = input.size[i]! * scale;
      points.push(top);
      padded ||= needsPadding(top);
      if (input.hasBase[i]) {
        points.push(base);
        padded ||= needsPadding(base);
      }
      if (!input.hasBase[i] || !base) tozero = true;
    }
    out.sizePoints = Float64Array.from(points);
    out.tozero = tozero;
    out.padded = padded;
  });
}
