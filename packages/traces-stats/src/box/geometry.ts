/**
 * Box shapes in linear coordinates (plotly.js `box/plot.js`: `plotBoxAndWhiskers`, `plotBoxMean`),
 * as flat polygon and polyline buffers for the fill and line primitives. Pure: the renderer maps
 * them to px with the subplot's transform, so zooming changes uniforms only.
 */
import type { BoxCalc } from './calc.ts';
import { calcToLinear } from './calc.ts';

/** Polylines: `x`/`y` vertices, each polyline starting at an index in `starts`. */
export interface Polylines {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly starts: Int32Array;
}

/** Polygons: one ring each, starting at an index in `rings`. */
export interface Polygons {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly rings: Int32Array;
}

/** Everything drawn for the boxes of a trace. */
export interface BoxShapes {
  /** Box bodies (filled). */
  readonly bodies: Polygons;
  /** Box outlines, medians, whiskers and caps (solid). */
  readonly outlines: Polylines;
  /** Mean lines and ± sd diamonds (dashed). */
  readonly means: Polylines;
}

/** Geometry options (the trace attributes that shape a box, resolved). */
export interface BoxShapeOptions {
  /** Box center offset from the position (`t.bPos`). */
  readonly bPos: number;
  /** Half-widths on the negative and positive side of the center (one-sided violin boxes). */
  readonly bdPos: readonly [number, number];
  /** Whisker cap half-width (`t.wdPos`), 0 for none. */
  readonly wdPos: number;
  readonly notched: boolean;
  /** `notchwidth` (0–0.5). */
  readonly notchwidth: number;
  /** `sizemode: 'sd'`: the box spans mean ± sd with a line at the mean. */
  readonly sdmode: boolean;
  readonly showWhiskers: boolean;
  /** Whiskers reach the extreme samples instead of the fences (`boxpoints: false`, sd mode). */
  readonly useExtremes: boolean;
  /** Mean line: none, a line, or a line and an sd diamond. */
  readonly mean: false | 'line' | 'sd';
}

/** Growable flat buffers. */
class Builder {
  x: number[] = [];
  y: number[] = [];
  starts: number[] = [];
  readonly horizontal: boolean;
  constructor(horizontal: boolean) {
    this.horizontal = horizontal;
  }
  /** Start a new polyline / ring. */
  begin(): void {
    this.starts.push(this.x.length);
  }
  /** Add a vertex at position `p`, value `v`. */
  at(p: number, v: number): void {
    if (this.horizontal) {
      this.x.push(v);
      this.y.push(p);
    } else {
      this.x.push(p);
      this.y.push(v);
    }
  }
  segment(p0: number, v0: number, p1: number, v1: number): void {
    this.begin();
    this.at(p0, v0);
    this.at(p1, v1);
  }
  lines(): Polylines {
    return {
      x: Float64Array.from(this.x),
      y: Float64Array.from(this.y),
      starts: Int32Array.from(this.starts),
    };
  }
  polygons(): Polygons {
    return {
      x: Float64Array.from(this.x),
      y: Float64Array.from(this.y),
      rings: Int32Array.from(this.starts),
    };
  }
}

/**
 * The box shapes of every box of a calc. Box bodies are rings (for the fill) and closed polylines
 * starting mid-edge on the q1 side (so the outline has no seam at a corner).
 */
export function boxShapes(calc: BoxCalc, options: BoxShapeOptions): BoxShapes {
  const horizontal = calc.orientation === 'h';
  const bodies = new Builder(horizontal);
  const outlines = new Builder(horizontal);
  const means = new Builder(horizontal);
  const { stats } = calc;
  const lin = (c: number) => calcToLinear(calc.valType, c);
  const [bd0, bd1] = options.bdPos;
  const nw = options.notched ? 1 - 2 * options.notchwidth : 1;
  for (let b = 0; b < calc.count; b++) {
    const center = calc.pos[b]! + options.bPos;
    const pos0 = center - bd0;
    const pos1 = center + bd1;
    const posm0 = center - bd0 * nw;
    const posm1 = center + bd1 * nw;
    const mean = stats.mean[b]!;
    const sd = stats.sd[b]!;
    const q1 = lin(options.sdmode ? mean - sd : stats.q1[b]!);
    const q3 = lin(options.sdmode ? mean + sd : stats.q3[b]!);
    const m = lin(options.sdmode ? mean : stats.med[b]!);
    const lf = lin(options.useExtremes ? stats.min[b]! : stats.lf[b]!);
    const uf = lin(options.useExtremes ? stats.max[b]! : stats.uf[b]!);
    const ln = lin(stats.ln[b]!);
    const un = lin(stats.un[b]!);
    if (![center, q1, q3, m].every(Number.isFinite)) continue;

    // Body ring: from the middle of the q1 edge, around through the q3 edge.
    const ring: [number, number][] = [[pos0, q1]];
    if (options.notched) ring.push([pos0, ln], [posm0, m], [pos0, un]);
    ring.push([pos0, q3], [pos1, q3]);
    if (options.notched) ring.push([pos1, un], [posm1, m], [pos1, ln]);
    ring.push([pos1, q1]);
    const mid = (pos0 + pos1) / 2;
    bodies.begin();
    for (const [p, v] of ring) bodies.at(p, v);
    outlines.begin();
    outlines.at(mid, q1);
    for (const [p, v] of ring) outlines.at(p, v);
    outlines.at(mid, q1);

    // Median.
    outlines.segment(posm0, m, posm1, m);

    if (options.showWhiskers) {
      if (Number.isFinite(lf)) outlines.segment(center, q1, center, lf);
      if (Number.isFinite(uf)) outlines.segment(center, q3, center, uf);
      if (options.wdPos > 0) {
        const w0 = center - options.wdPos;
        const w1 = center + options.wdPos;
        if (Number.isFinite(lf)) outlines.segment(w0, lf, w1, lf);
        if (Number.isFinite(uf)) outlines.segment(w0, uf, w1, uf);
      }
    }

    if (options.mean) {
      const ml = lin(mean);
      if (!Number.isFinite(ml)) continue;
      means.segment(pos0, ml, pos1, ml);
      if (options.mean === 'sd') {
        const sl = lin(mean - sd);
        const sh = lin(mean + sd);
        if (Number.isFinite(sl) && Number.isFinite(sh)) {
          // Diamond from the middle of one edge (no seam at a corner).
          means.begin();
          means.at((pos1 + center) / 2, (ml + sl) / 2);
          means.at(center, sl);
          means.at(pos0, ml);
          means.at(center, sh);
          means.at(pos1, ml);
          means.at((pos1 + center) / 2, (ml + sl) / 2);
        }
      }
    }
  }
  return { bodies: bodies.polygons(), outlines: outlines.lines(), means: means.lines() };
}
