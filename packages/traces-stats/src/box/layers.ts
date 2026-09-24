/**
 * The GPU layers box and violin views are made of (plan §3 principle 6: one primitive per layer,
 * never one object per box or point): polygon fills (lazily loaded fill primitive, E21.6), batched
 * polylines, and one marker set for the points. Each layer creates, updates or removes its
 * primitive to match what it is given; transforms (zoom, pan) only set uniforms.
 */
import {
  createLazyFillPrimitive,
  createMarkers,
  LinePrimitive,
  type DataTransform,
  type LazyFillPrimitive,
  type LineDash,
  type MarkerSet,
  type RGBA,
} from '@mk7s/holochart-render';
import type { TracePlotContext } from '@mk7s/holochart-runtime';
import type { Polygons, Polylines } from './geometry.ts';
import type { PointStyle } from './style.ts';

/** Polygons filled with one color. */
export class FillLayer {
  #fill: LazyFillPrimitive | undefined;

  sync(
    ctx: TracePlotContext<unknown>,
    polygons: Polygons | undefined,
    color: RGBA,
    opacity: number,
    order: number,
  ): void {
    if (!polygons || polygons.rings.length === 0 || color[3] === 0) {
      this.remove(ctx);
      return;
    }
    const data = {
      x: polygons.x,
      y: polygons.y,
      rings: polygons.rings,
      color,
      opacity,
    };
    if (!this.#fill) {
      this.#fill = createLazyFillPrimitive(ctx.primitives, data);
      ctx.add(this.#fill);
    } else {
      this.#fill.update(data);
    }
    this.#fill.object.renderOrder = order;
    this.#fill.setTransform(ctx.transform);
  }

  setTransform(transform: DataTransform): void {
    this.#fill?.setTransform(transform);
  }

  remove(ctx: TracePlotContext<unknown>): void {
    if (this.#fill) ctx.remove(this.#fill);
    this.#fill = undefined;
  }
}

/** Line style of a {@link LineLayer}. */
export interface LineStyle {
  readonly color: RGBA;
  readonly width: number;
  readonly dash?: LineDash;
  readonly opacity: number;
}

/** Polylines with one color, width and dash. */
export class LineLayer {
  #line: LinePrimitive | undefined;

  sync(
    ctx: TracePlotContext<unknown>,
    lines: Polylines | undefined,
    style: LineStyle,
    order: number,
  ): void {
    if (!lines || lines.starts.length === 0 || style.width <= 0 || style.color[3] === 0) {
      this.remove(ctx);
      return;
    }
    const data = {
      x: lines.x,
      y: lines.y,
      // The first polyline starts at 0 implicitly.
      starts: lines.starts.subarray(1),
      color: style.color,
      width: style.width,
      dash: style.dash ?? 'solid',
      join: 'miter' as const,
      cap: 'butt' as const,
      opacity: style.opacity,
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

  setTransform(transform: DataTransform): void {
    this.#line?.setTransform(transform);
  }

  remove(ctx: TracePlotContext<unknown>): void {
    if (this.#line) ctx.remove(this.#line);
    this.#line = undefined;
  }
}

/** The sample points. */
export class PointLayer {
  #markers: MarkerSet | undefined;

  sync(
    ctx: TracePlotContext<unknown>,
    style: PointStyle | undefined,
    traceOpacity: number,
    order: number,
  ): void {
    if (!style || style.count === 0) {
      this.remove(ctx);
      return;
    }
    const opacity = new Float32Array(style.count);
    for (let i = 0; i < style.count; i++) opacity[i] = style.opacity[i]! * traceOpacity;
    const data = {
      x: style.x,
      y: style.y,
      size: style.size,
      color: style.color,
      lineColor: style.lineColor,
      lineWidth: style.lineWidth,
      opacity,
      symbol: style.symbol,
      angle: style.angle,
    };
    if (!this.#markers) {
      this.#markers = createMarkers(ctx.primitives, data);
      ctx.add(this.#markers);
    } else {
      this.#markers.update(data);
    }
    this.#markers.object.renderOrder = order;
    this.#markers.setTransform(ctx.transform);
  }

  setTransform(transform: DataTransform): void {
    this.#markers?.setTransform(transform);
  }

  remove(ctx: TracePlotContext<unknown>): void {
    if (this.#markers) ctx.remove(this.#markers);
    this.#markers = undefined;
  }
}
