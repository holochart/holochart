/**
 * Stacked areas (plan E9.4): a port of the stacking half of plotly.js'
 * `scatter/cross_trace_calc.js` (and the gap handling of `scatter/calc.js`) on typed arrays, for
 * scatter traces in one `stackgroup`. It knows nothing about trace types or axes.
 *
 * ## Spaces
 *
 * - Positions are **linear coordinates** of the position axis (x for vertical stacks), so date and
 *   category positions line up by value.
 * - Sizes and the stacked outputs are in **calc space** of the value axis: stacking adds values,
 *   not their logarithms (Plotly semantics). The caller converts the outputs to linear coordinates.
 *
 * ## Semantics (Plotly)
 *
 * - A point with a non-finite position is dropped. A point with a finite position but no valid size
 *   is a *gap*: size 0 (`stackgaps: 'infer zero'`) or interpolated from the trace's neighbors
 *   (`'interpolate'`), and its marker is not drawn.
 * - Every trace of the group ends up with the same sorted positions: the union over the traces,
 *   each position repeated as often as the trace that has it most often. Where a trace lacks a
 *   position it gets a blank *slot*: 0, or (`interpolate`) a value interpolated linearly between
 *   its neighbors and held constant beyond its ends. Where it has a position fewer times than
 *   another trace, its last value there repeats.
 * - Slot `j` of trace `k` stacks to the sum of the sizes of traces `0…k` at slot `j`; `groupnorm`
 *   divides every slot by its total (× 1/100 for `'percent'`), a zero total by 1.
 */

/** `groupnorm` of a stack group. */
export type AreaGroupNorm = '' | 'fraction' | 'percent';

/** `stackgaps` of a stack group. */
export type AreaStackGaps = 'infer zero' | 'interpolate';

/** One trace of a stack group. Arrays are index-aligned per point. */
export interface AreaStackInput {
  /** Position of each point (linear). Non-finite: the point is dropped. */
  readonly pos: ArrayLike<number>;
  /** Size of each point (calc space). Non-finite: a gap. */
  readonly size: ArrayLike<number>;
}

/** Options of a stack group. */
export interface AreaStackOptions {
  readonly groupnorm: AreaGroupNorm;
  readonly stackgaps: AreaStackGaps;
}

/** What {@link stackAreas} computes for one trace. */
export interface AreaStackOutput {
  /** Slot positions, ascending (linear); identical for every trace of the group. */
  readonly pos: Float64Array;
  /** Stacked top of each slot (calc space, normalized with `groupnorm`). */
  readonly top: Float64Array;
  /** This trace's own size in each slot (normalized with `groupnorm`). */
  readonly value: Float64Array;
  /** Point index behind each slot, or -1 for a blank slot (a position the trace lacks). */
  readonly index: Int32Array;
  /** 1 where the slot is a gap (blank, or a point without a valid size). */
  readonly gap: Uint8Array;
  /** Per point: stacked top at the point's own slot; NaN for dropped points and gaps. */
  readonly pointTop: Float64Array;
  /** Per point: the point's own (normalized) size; NaN for dropped points and gaps. */
  readonly pointValue: Float64Array;
}

/** One trace's valid entries, sorted by position (then point index). */
interface Entries {
  pos: Float64Array;
  size: Float64Array;
  index: Int32Array;
  gap: Uint8Array;
}

/** Plotly's `calc` for a stacked trace: drop bad positions, sort, fill gaps. */
function entriesOf(input: AreaStackInput, interpolate: boolean): Entries {
  const n = Math.min(input.pos.length, input.size.length);
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(input.pos[i])) order.push(i);
  order.sort((a, b) => (input.pos[a] as number) - (input.pos[b] as number) || a - b);
  const m = order.length;
  const out: Entries = {
    pos: new Float64Array(m),
    size: new Float64Array(m),
    index: new Int32Array(m),
    gap: new Uint8Array(m),
  };
  let anyGap = false;
  for (let k = 0; k < m; k++) {
    const i = order[k] as number;
    const s = input.size[i] as number;
    out.pos[k] = input.pos[i] as number;
    out.index[k] = i;
    if (Number.isFinite(s)) out.size[k] = s;
    else {
      out.gap[k] = 1;
      out.size[k] = interpolate ? NaN : 0;
      anyGap = true;
    }
  }
  if (interpolate && anyGap) interpolateGaps(out);
  return out;
}

/** Plotly's `interpolateGaps`: constant beyond the ends, linear by position inside. */
function interpolateGaps(e: Entries): void {
  const m = e.pos.length;
  let first = 0;
  while (first < m - 1 && e.gap[first]) first++;
  // No valid size at all: zeros (Plotly).
  const head = e.gap[first] ? 0 : (e.size[first] as number);
  for (let k = 0; k <= first; k++) if (e.gap[k]) e.size[k] = head;
  let last = m - 1;
  while (last > first && e.gap[last]) last--;
  for (let k = last + 1; k < m; k++) e.size[k] = e.size[last] as number;
  for (let k = first + 1; k < last; k++) {
    if (!e.gap[k]) continue;
    let next = k + 1;
    while (e.gap[next]) next++;
    const p0 = e.pos[k - 1] as number;
    const s0 = e.size[k - 1] as number;
    const slope = ((e.size[next] as number) - s0) / ((e.pos[next] as number) - p0);
    for (; k < next; k++) e.size[k] = s0 + ((e.pos[k] as number) - p0) * slope;
  }
}

/** Distinct positions of sorted entries with their multiplicity. */
function runs(pos: Float64Array): { values: number[]; counts: number[] } {
  const values: number[] = [];
  const counts: number[] = [];
  for (let k = 0; k < pos.length; k++) {
    const p = pos[k] as number;
    if (values.length > 0 && values[values.length - 1] === p) counts[counts.length - 1]!++;
    else {
      values.push(p);
      counts.push(1);
    }
  }
  return { values, counts };
}

/**
 * Stack the traces of one group, in order (see the module docs). Returns one output per input.
 * O(N log N) in the total point count.
 */
export function stackAreas(
  inputs: readonly AreaStackInput[],
  options: AreaStackOptions,
): AreaStackOutput[] {
  const interpolate = options.stackgaps === 'interpolate';
  const entries = inputs.map((input) => entriesOf(input, interpolate));
  const perTrace = entries.map((e) => runs(e.pos));

  // Union of positions, each as often as the trace that has it most often.
  const multiplicity = new Map<number, number>();
  for (const r of perTrace) {
    r.values.forEach((p, k) => {
      const c = r.counts[k] as number;
      if ((multiplicity.get(p) ?? 0) < c) multiplicity.set(p, c);
    });
  }
  const distinct = [...multiplicity.keys()].sort((a, b) => a - b);
  let slots = 0;
  for (const p of distinct) slots += multiplicity.get(p) as number;
  const pos = new Float64Array(slots);
  {
    let j = 0;
    for (const p of distinct) for (let c = multiplicity.get(p) as number; c > 0; c--) pos[j++] = p;
  }

  // Each trace's slots: its own entries, repeats of its last value at a position, and blanks.
  const sizes: Float64Array[] = [];
  const outputs = entries.map((e) => {
    const size = new Float64Array(slots);
    const index = new Int32Array(slots);
    const gap = new Uint8Array(slots);
    let k = 0;
    let j = 0;
    for (const p of distinct) {
      const c = multiplicity.get(p) as number;
      const k0 = k;
      while (k < e.pos.length && e.pos[k] === p) k++;
      const own = k - k0;
      for (let r = 0; r < c; r++, j++) {
        if (own > 0) {
          const src = k0 + Math.min(r, own - 1);
          size[j] = e.size[src] as number;
          index[j] = e.index[src] as number;
          gap[j] = e.gap[src] as number;
          continue;
        }
        index[j] = -1;
        gap[j] = 1;
        size[j] = interpolate ? blankValue(e, k, p) : 0;
      }
    }
    sizes.push(size);
    return { pos, top: new Float64Array(slots), value: size.slice(), index, gap };
  });

  // Stack and normalize.
  for (let j = 0; j < slots; j++) {
    let sum = 0;
    for (let t = 0; t < outputs.length; t++) {
      sum += (sizes[t] as Float64Array)[j] as number;
      (outputs[t] as { top: Float64Array }).top[j] = sum;
    }
    if (options.groupnorm !== '') {
      const norm = (options.groupnorm === 'fraction' ? sum : sum / 100) || 1;
      for (const o of outputs) {
        o.top[j] = (o.top[j] as number) / norm;
        o.value[j] = (o.value[j] as number) / norm;
      }
    }
  }

  return outputs.map((o, t) => {
    const n = Math.min(
      (inputs[t] as AreaStackInput).pos.length,
      (inputs[t] as AreaStackInput).size.length,
    );
    const pointTop = new Float64Array(n).fill(NaN);
    const pointValue = new Float64Array(n).fill(NaN);
    for (let j = 0; j < slots; j++) {
      const i = o.index[j] as number;
      // Repeated slots copy their source's index: the point sits at its first slot.
      if (i < 0 || o.gap[j] || !Number.isNaN(pointTop[i])) continue;
      pointTop[i] = o.top[j] as number;
      pointValue[i] = o.value[j] as number;
    }
    return { ...o, pointTop, pointValue };
  });
}

/**
 * Interpolated size of a blank slot at position `p`, where `k` is the first of the trace's entries
 * after `p`: linear between the neighbors, constant beyond the ends (Plotly's `getInterp`).
 */
function blankValue(e: Entries, k: number, p: number): number {
  const m = e.pos.length;
  if (m === 0) return 0;
  if (k <= 0) return e.size[0] as number;
  if (k >= m) return e.size[m - 1] as number;
  const p0 = e.pos[k - 1] as number;
  const s0 = e.size[k - 1] as number;
  const p1 = e.pos[k] as number;
  const s1 = e.size[k] as number;
  return s0 + ((s1 - s0) * (p - p0)) / (p1 - p0);
}
