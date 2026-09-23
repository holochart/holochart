/**
 * Incremental scatter line paths for streaming (plan E7.2).
 *
 * {@link LinePathStream} holds the vertex path `buildLinePath` would produce for a window of
 * points, plus which vertices each point *owns*, so that when points stream in or out at either
 * end only the vertices of the points whose shape changed are rebuilt:
 *
 * - a point owns the vertices drawn for the segment that ends at it (step corners, spline
 *   samples) and the point itself; a run's first point owns only itself, plus the NaN separator
 *   before it when an earlier run exists; a gap owns nothing;
 * - `linear` and step shapes depend on the previous point only; splines also on the next one
 *   (Catmull-Rom tangents), so appending re-tessellates the old last segment and trimming the
 *   first; min/max decimation (`line.simplify`) works per px column, and columns are anchored at
 *   linear 0 (see `decimateRun`), so only the columns at the ends are re-emitted.
 *
 * The result is exactly `buildLinePath` of the whole window (property-tested); an edit reports
 * which old vertices it kept (`LineRetain`) so `LinePrimitive.splice` re-uploads only the rest.
 * Decimated splines, and edits that change whether a run is decimated, rebuild the whole path.
 */
import type { LineRetain } from '@mk7s/holochart-render';
import {
  bucketOf,
  buildLinePath,
  cubic,
  denseEnough,
  quadratic,
  sanitizeScale,
  splineTangent,
  VertexStream,
  type LinePathOptions,
} from './line-path.ts';

/** How a window of points changed, in points (see `TraceAppend` in the runtime). */
export interface WindowChange {
  readonly frontRemoved: number;
  readonly frontAdded: number;
  readonly endRemoved: number;
  readonly endAdded: number;
}

interface RunInfo {
  /** First and last finite point (window indices, inclusive). */
  readonly a: number;
  readonly b: number;
  readonly decimated: boolean;
}

/** Growth policy of the streaming arrays: room for as much again, plus a little. */
function slack(n: number): number {
  return 2 * n + 64;
}

/**
 * The line path of a scatter trace, kept up to date incrementally as points are appended,
 * prepended and trimmed (E7.2). {@link x} / {@link y} are views of the live path.
 */
export class LinePathStream {
  #opts: LinePathOptions | undefined;
  #sx = 1;
  #sy = 1;
  #smooth = false;
  #decimate = false;
  /** Path vertices, live in `[#v0, #v1)`. */
  #vx: Float64Array = new Float64Array(0);
  #vy: Float64Array = new Float64Array(0);
  #v0 = 0;
  #v1 = 0;
  /**
   * Per window point `i` (slot `#p0 + i`): the absolute vertex index after the vertices it owns,
   * and whether its run is decimated.
   */
  #pend = new Int32Array(0);
  #dec = new Uint8Array(0);
  #p0 = 0;
  #n = 0;
  #decimatedPoints = 0;
  /** False for decimated splines: every change rebuilds with `buildLinePath`. */
  #incremental = false;
  #decimatedFallback = false;
  // Scratch (reused between edits).
  #head = new VertexStream(64);
  #tail = new VertexStream(64);
  #pendTmp = new Int32Array(64);
  #decTmp = new Uint8Array(64);
  #tan = new Float64Array(8);
  /** Runs found during the current rebuild / edit (the window is fixed while it lasts). */
  #runs: RunInfo[] = [];

  /** The live path (views; valid until the next edit). */
  get x(): Float64Array {
    return this.#vx.subarray(this.#v0, this.#v1);
  }

  get y(): Float64Array {
    return this.#vy.subarray(this.#v0, this.#v1);
  }

  /** Whether any run is decimated (the path is then only valid for its x scale). */
  get decimated(): boolean {
    return this.#incremental ? this.#decimatedPoints > 0 : this.#decimatedFallback;
  }

  /** The options (and scales) the path was built for. */
  get options(): LinePathOptions | undefined {
    return this.#opts;
  }

  /**
   * Build the path of the whole window. `streaming` leaves room in the arrays for edits (toward
   * the end for `bias` ≥ 0, toward the start for prepends).
   */
  rebuild(
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    opts: LinePathOptions,
    streaming = false,
    bias = 1,
  ): void {
    this.#opts = { ...opts };
    this.#sx = sanitizeScale(opts.scaleX);
    this.#sy = sanitizeScale(opts.scaleY);
    this.#smooth = opts.shape === 'spline' && opts.smoothing > 0;
    this.#decimate = opts.simplify && (opts.shape === 'linear' || opts.shape === 'spline');
    this.#runs.length = 0;
    const n = Math.min(x.length, y.length);
    const out = this.#head;
    out.reset();
    this.#ensureTmp(n);
    if (!this.#emit(x, y, n, 0, n, false, out)) {
      const path = buildLinePath(x, y, opts);
      this.#incremental = false;
      this.#decimatedFallback = path.decimated;
      this.#vx = path.x;
      this.#vy = path.y;
      this.#v0 = 0;
      this.#v1 = path.x.length;
      this.#n = n;
      return;
    }
    this.#incremental = true;
    const len = out.length;
    const vcap = streaming ? slack(len) : len;
    const pcap = streaming ? slack(n) : n;
    const v0 = streaming && bias < 0 ? vcap - len : 0;
    const p0 = streaming && bias < 0 ? pcap - n : 0;
    if (this.#vx.length !== vcap) {
      this.#vx = new Float64Array(vcap);
      this.#vy = new Float64Array(vcap);
    }
    this.#vx.set(out.x.subarray(0, len), v0);
    this.#vy.set(out.y.subarray(0, len), v0);
    if (this.#pend.length !== pcap) {
      this.#pend = new Int32Array(pcap);
      this.#dec = new Uint8Array(pcap);
    }
    let decimated = 0;
    for (let i = 0; i < n; i++) {
      this.#pend[p0 + i] = v0 + this.#pendTmp[i]!;
      decimated += this.#dec[p0 + i] = this.#decTmp[i]!;
    }
    this.#decimatedPoints = decimated;
    this.#v0 = v0;
    this.#v1 = v0 + len;
    this.#p0 = p0;
    this.#n = n;
  }

  /**
   * Update the path for a changed window (the options stay those of the last rebuild). Returns
   * which old path vertices are kept, for `LinePrimitive.splice`, or `undefined` when the whole
   * path was rebuilt.
   */
  edit(x: ArrayLike<number>, y: ArrayLike<number>, change: WindowChange): LineRetain | undefined {
    const opts = this.#opts;
    const n = Math.min(x.length, y.length);
    const { frontRemoved, frontAdded, endRemoved, endAdded } = change;
    const bias = frontAdded > 0 ? -1 : 1;
    const shift = frontAdded - frontRemoved;
    if (!opts) throw new Error('LinePathStream.edit before rebuild');
    this.#runs.length = 0;
    if (!this.#incremental || n !== this.#n + shift + endAdded - endRemoved) {
      this.rebuild(x, y, opts, true, bias);
      return undefined;
    }
    const retainedEnd = n - endAdded; // first index past the retained points

    // Points whose owned vertices may change: through the second finite point after a changed
    // front, from the last finite point before a changed end (whole px columns if decimated).
    let qh = 0;
    let pt = n;
    if (frontRemoved > 0 || frontAdded > 0) {
      const f = this.#nextFinite(x, y, frontAdded, retainedEnd);
      if (f < 0) return this.#rebuildEdit(x, y, opts, bias);
      const s = this.#nextFinite(x, y, f + 1, retainedEnd);
      const last = s < 0 ? f : s;
      const run = this.#runAt(x, y, n, f);
      if (run.decimated !== (this.#dec[this.#p0 + f - shift] === 1)) {
        return this.#rebuildEdit(x, y, opts, bias);
      }
      const lastRun = last === f ? run : this.#runAt(x, y, n, last);
      qh = (lastRun.decimated ? this.#bucketEnd(x, y, lastRun, last) : last) + 1;
    }
    if (endRemoved > 0 || endAdded > 0) {
      const l = this.#prevFinite(x, y, retainedEnd - 1, frontAdded);
      if (l < 0) return this.#rebuildEdit(x, y, opts, bias);
      const run = this.#runAt(x, y, n, l);
      if (run.decimated !== (this.#dec[this.#p0 + l - shift] === 1)) {
        return this.#rebuildEdit(x, y, opts, bias);
      }
      pt = run.decimated ? this.#bucketStart(x, y, run, l) : l;
    }
    if (qh >= pt) return this.#rebuildEdit(x, y, opts, bias);

    // Old vertices owned by the retained points [qh, pt) (old indices [oq, ot)).
    const oq = qh - shift;
    const ot = pt - shift;
    const rs = oq > 0 ? this.#pend[this.#p0 + oq - 1]! : this.#v0;
    const re = ot > 0 ? this.#pend[this.#p0 + ot - 1]! : this.#v0;
    if (re <= rs) return this.#rebuildEdit(x, y, opts, bias);

    // New vertices before and after them.
    this.#ensureTmp(Math.max(qh, n - pt));
    const head = this.#head;
    head.reset();
    if (!this.#emit(x, y, n, 0, qh, false, head)) return this.#rebuildEdit(x, y, opts, bias);
    const headPend = this.#pendTmp.slice(0, qh);
    const headDec = this.#decTmp.slice(0, qh);
    const tail = this.#tail;
    tail.reset();
    if (!this.#emit(x, y, n, pt, n, true, tail)) return this.#rebuildEdit(x, y, opts, bias);
    const H = head.length;
    const T = tail.length;

    // Decimated-point count: drop the old points whose vertices are rewritten (read before the
    // slots are reused or relocated).
    let decimated = this.#decimatedPoints;
    for (let i = 0; i < oq; i++) decimated -= this.#dec[this.#p0 + i]!;
    for (let i = ot; i < this.#n; i++) decimated -= this.#dec[this.#p0 + i]!;

    // Room: relocate (with slack) when either end would run out of the arrays.
    let vr = rs; // where the retained vertices are (after a possible relocation)
    let p0 = this.#p0 + oq - qh; // slot of new point 0
    if (rs - H < 0 || re + T > this.#vx.length || p0 < 0 || p0 + n > this.#pend.length) {
      const moved = this.#relocate(rs, re, H, T, oq, ot, qh, n, bias);
      vr = moved.vr;
      p0 = moved.p0;
    }
    const vre = vr + (re - rs);

    // Write the head before the retained vertices and the tail after them.
    const vStart = vr - H;
    this.#vx.set(head.x.subarray(0, H), vStart);
    this.#vy.set(head.y.subarray(0, H), vStart);
    this.#vx.set(tail.x.subarray(0, T), vre);
    this.#vy.set(tail.y.subarray(0, T), vre);
    for (let i = 0; i < qh; i++) {
      this.#pend[p0 + i] = vStart + headPend[i]!;
      decimated += this.#dec[p0 + i] = headDec[i]!;
    }
    for (let i = pt; i < n; i++) {
      this.#pend[p0 + i] = vre + this.#pendTmp[i - pt]!;
      decimated += this.#dec[p0 + i] = this.#decTmp[i - pt]!;
    }
    this.#decimatedPoints = decimated;

    const retain: LineRetain = { from: rs - this.#v0, to: re - this.#v0, at: H };
    this.#v0 = vStart;
    this.#v1 = vre + T;
    this.#p0 = p0;
    this.#n = n;
    return retain;
  }

  #rebuildEdit(
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    opts: LinePathOptions,
    bias: number,
  ): undefined {
    this.rebuild(x, y, opts, true, bias);
    return undefined;
  }

  /**
   * Move the retained vertices `[rs, re)` and points `[oq, ot)` into new arrays with slack on the
   * growing side, translating their vertex indices. Returns the retained vertices' new start and
   * the slot of new point 0.
   */
  #relocate(
    rs: number,
    re: number,
    H: number,
    T: number,
    oq: number,
    ot: number,
    qh: number,
    n: number,
    bias: number,
  ): { vr: number; p0: number } {
    const kept = re - rs;
    const vcap = slack(H + kept + T);
    const vr = bias < 0 ? vcap - T - kept : H;
    const vx = new Float64Array(vcap);
    const vy = new Float64Array(vcap);
    vx.set(this.#vx.subarray(rs, re), vr);
    vy.set(this.#vy.subarray(rs, re), vr);
    const pcap = slack(n);
    const p0 = bias < 0 ? pcap - n : 0;
    const pend = new Int32Array(pcap);
    const dec = new Uint8Array(pcap);
    const delta = vr - rs;
    for (let i = oq; i < ot; i++) {
      pend[p0 + qh + i - oq] = this.#pend[this.#p0 + i]! + delta;
      dec[p0 + qh + i - oq] = this.#dec[this.#p0 + i]!;
    }
    this.#vx = vx;
    this.#vy = vy;
    this.#pend = pend;
    this.#dec = dec;
    return { vr, p0 };
  }

  #ensureTmp(n: number): void {
    if (this.#pendTmp.length < n) {
      const size = Math.max(n, 2 * this.#pendTmp.length);
      this.#pendTmp = new Int32Array(size);
      this.#decTmp = new Uint8Array(size);
    }
  }

  // ---- window scans -----------------------------------------------------------------------

  #finite(x: ArrayLike<number>, y: ArrayLike<number>, i: number): boolean {
    return Number.isFinite(x[i]) && Number.isFinite(y[i]);
  }

  /** First finite point in `[from, end)`, or -1. */
  #nextFinite(x: ArrayLike<number>, y: ArrayLike<number>, from: number, end: number): number {
    for (let i = from; i < end; i++) if (this.#finite(x, y, i)) return i;
    return -1;
  }

  /** Last finite point in `[stop, from]`, or -1. */
  #prevFinite(x: ArrayLike<number>, y: ArrayLike<number>, from: number, stop: number): number {
    for (let i = from; i >= stop; i--) if (this.#finite(x, y, i)) return i;
    return -1;
  }

  /** The finite point before `i` in its run, or -1 at a run start. */
  #prevInRun(x: ArrayLike<number>, y: ArrayLike<number>, i: number): number {
    for (let k = i - 1; k >= 0; k--) {
      if (this.#finite(x, y, k)) return k;
      if (!this.#opts!.connectgaps) return -1;
    }
    return -1;
  }

  /** The finite point after `i` in its run, or -1 at a run end. */
  #nextInRun(x: ArrayLike<number>, y: ArrayLike<number>, n: number, i: number): number {
    for (let k = i + 1; k < n; k++) {
      if (this.#finite(x, y, k)) return k;
      if (!this.#opts!.connectgaps) return -1;
    }
    return -1;
  }

  /**
   * The run of finite point `j`, and whether `buildLinePath` decimates it. O(run), so runs are
   * remembered for the rest of the current rebuild or edit.
   */
  #runAt(x: ArrayLike<number>, y: ArrayLike<number>, n: number, j: number): RunInfo {
    for (const r of this.#runs) if (j >= r.a && j <= r.b) return r;
    const gaps = this.#opts!.connectgaps;
    // Extend over finite points (and over gaps with `connectgaps`) to the run's first/last point.
    let a = j;
    for (let k = j - 1; k >= 0; k--) {
      if (Number.isFinite(x[k]) && Number.isFinite(y[k])) a = k;
      else if (!gaps) break;
    }
    let b = j;
    for (let k = j + 1; k < n; k++) {
      if (Number.isFinite(x[k]) && Number.isFinite(y[k])) b = k;
      else if (!gaps) break;
    }
    let decimated = false;
    if (this.#decimate) {
      // `decimateRun`'s eligibility: dense enough, and x monotonic over the run's finite points.
      let count = 0;
      const dir = (x[b] as number) >= (x[a] as number) ? 1 : -1;
      let prev = NaN;
      let monotonic = true;
      for (let i = a; i <= b; i++) {
        const xi = x[i] as number;
        if (!(Number.isFinite(xi) && Number.isFinite(y[i]))) continue;
        if (count > 0 && (xi - prev) * dir < 0) monotonic = false;
        prev = xi;
        count++;
      }
      decimated = monotonic && denseEnough(count, x[a] as number, x[b] as number, this.#sx);
    }
    const run = { a, b, decimated };
    this.#runs.push(run);
    return run;
  }

  /** Last finite point of the px column of `j` within its (decimated) run. */
  #bucketEnd(x: ArrayLike<number>, y: ArrayLike<number>, run: RunInfo, j: number): number {
    const bucket = bucketOf(x[j] as number, this.#sx);
    let last = j;
    for (let i = j + 1; i <= run.b; i++) {
      if (!this.#finite(x, y, i)) continue;
      if (bucketOf(x[i] as number, this.#sx) !== bucket) break;
      last = i;
    }
    return last;
  }

  /** First finite point of the px column of `j` within its (decimated) run. */
  #bucketStart(x: ArrayLike<number>, y: ArrayLike<number>, run: RunInfo, j: number): number {
    const bucket = bucketOf(x[j] as number, this.#sx);
    let first = j;
    for (let i = j - 1; i >= run.a; i--) {
      if (!this.#finite(x, y, i)) continue;
      if (bucketOf(x[i] as number, this.#sx) !== bucket) break;
      first = i;
    }
    return first;
  }

  // ---- emission ---------------------------------------------------------------------------

  /**
   * Emit the vertices owned by points `[from, to)` into `out`, recording per point (from index 0
   * of the scratch arrays) the vertex count of `out` after its vertices and its run's decimated
   * flag. `before`: whether path vertices precede `from` (a run start then owns a separator).
   * Decimated runs must be entered and left at px column boundaries. Returns false for a
   * decimated spline (not supported incrementally).
   */
  #emit(
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    n: number,
    from: number,
    to: number,
    before: boolean,
    out: VertexStream,
  ): boolean {
    const opts = this.#opts!;
    const pend = this.#pendTmp;
    const dec = this.#decTmp;
    const sx = this.#sx;
    const sy = this.#sy;
    let any = before;
    // The two previous finite points of the current run (for steps and splines).
    let p1 = from > 0 ? this.#prevInRun(x, y, from) : -1;
    let p2 = p1 >= 0 ? this.#prevInRun(x, y, p1) : -1;
    let run: RunInfo | undefined;
    for (let j = from; j < to; j++) {
      if (!this.#finite(x, y, j)) {
        if (!opts.connectgaps) p1 = p2 = -1;
        pend[j - from] = out.length;
        dec[j - from] = 0;
        continue;
      }
      if (this.#decimate && (!run || j > run.b)) run = this.#runAt(x, y, n, j);
      if (run?.decimated) {
        if (opts.shape === 'spline') return false;
        j = this.#emitDecimated(x, y, run, j, to, any, out, from) - 1;
        any = true;
        p1 = p2 = -1;
        continue;
      }
      const xj = x[j] as number;
      const yj = y[j] as number;
      if (p1 < 0) {
        if (any) out.push(NaN, NaN);
        out.push(xj, yj);
      } else {
        const xp = x[p1] as number;
        const yp = y[p1] as number;
        switch (opts.shape) {
          case 'hv':
            out.push(xj, yp);
            out.push(xj, yj);
            break;
          case 'vh':
            out.push(xp, yj);
            out.push(xj, yj);
            break;
          case 'hvh': {
            const xm = (xp + xj) / 2;
            out.push(xm, yp);
            out.push(xm, yj);
            out.push(xj, yj);
            break;
          }
          case 'vhv': {
            const ym = (yp + yj) / 2;
            out.push(xp, ym);
            out.push(xj, ym);
            out.push(xj, yj);
            break;
          }
          case 'spline':
            if (this.#smooth) {
              this.#splineSegment(x, y, n, p2, p1, j, out, sx, sy);
              break;
            }
            out.push(xj, yj);
            break;
          default:
            out.push(xj, yj);
        }
      }
      any = true;
      p2 = p1;
      p1 = j;
      pend[j - from] = out.length;
      dec[j - from] = 0;
    }
    return true;
  }

  /**
   * The segment of a smooth spline ending at `j` (previous points `p1`, `p2`), as `splineRun`
   * draws it: quadratic after the run's first point and before its last, cubic in between, and
   * straight for runs of fewer than 3 points.
   */
  #splineSegment(
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    n: number,
    p2: number,
    p1: number,
    j: number,
    out: VertexStream,
    sx: number,
    sy: number,
  ): void {
    const n1 = this.#nextInRun(x, y, n, j);
    const n2 = n1 >= 0 ? this.#nextInRun(x, y, n, n1) : -1;
    // Run members within two steps of j: ≥ 3 exactly when the run has ≥ 3 points.
    const members = 2 + (p2 >= 0 ? 1 : 0) + (n1 >= 0 ? 1 : 0) + (n2 >= 0 ? 1 : 0);
    const smoothing = this.#opts!.smoothing;
    const tan = this.#tan;
    if (members < 3) {
      out.push(x[j] as number, y[j] as number);
    } else if (p2 < 0) {
      // Second point of the run: incoming control of j.
      splineTangent(x, y, p1, j, n1, smoothing, sx, sy, tan, 4);
      quadratic(x, y, p1, j, tan[4]!, tan[5]!, sx, sy, out);
    } else if (n1 < 0) {
      // Last point of the run: outgoing control of p1.
      splineTangent(x, y, p2, p1, j, smoothing, sx, sy, tan, 0);
      quadratic(x, y, p1, j, tan[2]!, tan[3]!, sx, sy, out);
    } else {
      splineTangent(x, y, p2, p1, j, smoothing, sx, sy, tan, 0);
      splineTangent(x, y, p1, j, n1, smoothing, sx, sy, tan, 4);
      cubic(x, y, p1, j, tan[2]!, tan[3]!, tan[4]!, tan[5]!, sx, sy, out);
    }
  }

  /**
   * `decimateRun` + `linearRun` for the px columns of a decimated run from `j` (a column start)
   * until the run ends or `to` is reached. Returns the next point to process.
   */
  #emitDecimated(
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    run: RunInfo,
    j: number,
    to: number,
    any: boolean,
    out: VertexStream,
    from: number,
  ): number {
    const pend = this.#pendTmp;
    const dec = this.#decTmp;
    const sx = this.#sx;
    if (j === run.a && any) out.push(NaN, NaN);
    let k = j;
    while (k <= run.b && k < to) {
      const bucket = bucketOf(x[k] as number, sx);
      const first = k;
      let last = k;
      let lo = k;
      let hi = k;
      let i = k + 1;
      for (; i <= run.b; i++) {
        if (!this.#finite(x, y, i)) continue;
        if (bucketOf(x[i] as number, sx) !== bucket) break;
        last = i;
        const yi = y[i] as number;
        if (yi < (y[lo] as number)) lo = i;
        if (yi > (y[hi] as number)) hi = i;
      }
      // Same order and de-duplication as `decimateRun`'s flush.
      const p = Math.min(lo, hi);
      const q = Math.max(lo, hi);
      const base = out.length;
      out.push(x[first] as number, y[first] as number);
      if (p !== first) out.push(x[p] as number, y[p] as number);
      if (q !== p) out.push(x[q] as number, y[q] as number);
      if (last !== q) out.push(x[last] as number, y[last] as number);
      // Ownership: a point owns the kept vertices up to itself.
      for (let m = first; m < i; m++) {
        pend[m - from] = base + kept(m, first, p, q, last);
        dec[m - from] = 1;
      }
      k = i;
    }
    return k;
  }
}

/** Number of flushed vertices of a column with index ≤ `m` (`first ≤ p ≤ q ≤ last`). */
function kept(m: number, first: number, p: number, q: number, last: number): number {
  let c = 1; // first
  if (p !== first && p <= m) c++;
  if (q !== p && q <= m) c++;
  if (last !== q && last <= m) c++;
  return c;
}
