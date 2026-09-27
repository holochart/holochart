/**
 * GPU layers of the financial traces (plan §3 principle 6: one primitive per layer, never one
 * object per bar): many two-point segments in one instanced line primitive, with a color and width
 * per segment. Geometry (linear coordinates) is uploaded when the calc changes; a restyle or a
 * selection re-uploads colors and widths only; zoom and pan only set the transform.
 */
import {
  LinePrimitive,
  type DataTransform,
  type LineDash,
  type RGBA,
} from '@mk7s/holochart-render';
import type { TracePlotContext } from '@mk7s/holochart-runtime';
import { putColor } from './style.ts';

/** Two-point segments in linear coordinates, each tagged with its bar and direction. */
export interface Segments {
  /** Two vertices per segment. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Index into `calc.drawn` of each segment's bar. */
  readonly bar: Int32Array;
  /** 1 where the segment's bar is increasing. */
  readonly up: Uint8Array;
  readonly count: number;
}

/** Growable segment buffers. */
export class SegmentBuilder {
  #x: Float64Array;
  #y: Float64Array;
  #bar: Int32Array;
  #up: Uint8Array;
  count = 0;

  constructor(capacity: number) {
    const n = Math.max(capacity, 4);
    this.#x = new Float64Array(2 * n);
    this.#y = new Float64Array(2 * n);
    this.#bar = new Int32Array(n);
    this.#up = new Uint8Array(n);
  }

  /** Add the segment `(x0, y0) – (x1, y1)` unless it is empty or not finite. */
  add(x0: number, y0: number, x1: number, y1: number, bar: number, up: number): void {
    if ((x0 === x1 && y0 === y1) || !Number.isFinite(x0 + y0 + x1 + y1)) return;
    if (this.count === this.#bar.length) this.#grow();
    const k = this.count++;
    this.#x[2 * k] = x0;
    this.#y[2 * k] = y0;
    this.#x[2 * k + 1] = x1;
    this.#y[2 * k + 1] = y1;
    this.#bar[k] = bar;
    this.#up[k] = up;
  }

  #grow(): void {
    const n = this.#bar.length * 2;
    const x = new Float64Array(2 * n);
    const y = new Float64Array(2 * n);
    const bar = new Int32Array(n);
    const up = new Uint8Array(n);
    x.set(this.#x);
    y.set(this.#y);
    bar.set(this.#bar);
    up.set(this.#up);
    [this.#x, this.#y, this.#bar, this.#up] = [x, y, bar, up];
  }

  build(): Segments {
    const n = this.count;
    return {
      x: this.#x.slice(0, 2 * n),
      y: this.#y.slice(0, 2 * n),
      bar: this.#bar.slice(0, n),
      up: this.#up.slice(0, n),
      count: n,
    };
  }
}

/** Per-vertex colors and widths of segments from each direction's style and the bar alphas. */
export function segmentStyle(
  segments: Segments,
  styles: {
    readonly up: { color: RGBA; width: number };
    readonly down: { color: RGBA; width: number };
  },
  alpha: Float32Array | undefined,
): { color: Float32Array; width: Float32Array } {
  const n = segments.count;
  const color = new Float32Array(8 * n);
  const width = new Float32Array(2 * n);
  for (let k = 0; k < n; k++) {
    const s = segments.up[k] ? styles.up : styles.down;
    // A zero-width line is not drawn: make it transparent too (no anti-aliasing fringe).
    const a = s.width > 0 ? (alpha ? alpha[segments.bar[k]!]! : 1) : 0;
    putColor(color, 2 * k, s.color, a);
    putColor(color, 2 * k + 1, s.color, a);
    width[2 * k] = width[2 * k + 1] = s.width;
  }
  return { color, width };
}

/** The `starts` of a line primitive drawing segments as two-point polylines. */
function segmentStarts(count: number): Int32Array {
  const starts = new Int32Array(Math.max(0, count - 1));
  for (let k = 1; k < count; k++) starts[k - 1] = 2 * k;
  return starts;
}

/** Style of a {@link LineLayer}: per-vertex (or one) color and width. */
export interface SegmentStyle {
  readonly color: Float32Array | RGBA;
  readonly width: Float32Array | number;
  readonly dash: LineDash;
  readonly opacity: number;
}

/** Segments in one line primitive (one draw call). */
export class LineLayer {
  #line: LinePrimitive | undefined;

  /** Upload new geometry and style (or remove the primitive when there is nothing to draw). */
  sync(
    ctx: TracePlotContext<unknown>,
    segments: Segments | undefined,
    style: SegmentStyle,
    order: number,
  ): void {
    if (!segments || segments.count === 0) {
      this.remove(ctx);
      return;
    }
    const data = {
      x: segments.x,
      y: segments.y,
      starts: segmentStarts(segments.count),
      ...style,
      join: 'miter' as const,
      cap: 'butt' as const,
    };
    if (!this.#line) {
      this.#line = new LinePrimitive(ctx.primitives, data);
      ctx.add(this.#line);
    } else {
      this.#line.update(data);
    }
    this.#line.object.renderOrder = order;
    this.#line.setTransform(ctx.transform);
  }

  /** New colors, widths, dash or opacity for the same geometry. */
  restyle(style: SegmentStyle): void {
    this.#line?.update(style);
  }

  /** The primitive, if any (tests). */
  get primitive(): LinePrimitive | undefined {
    return this.#line;
  }

  setTransform(transform: DataTransform): void {
    this.#line?.setTransform(transform);
  }

  remove(ctx: TracePlotContext<unknown>): void {
    if (this.#line) ctx.remove(this.#line);
    this.#line = undefined;
  }
}
