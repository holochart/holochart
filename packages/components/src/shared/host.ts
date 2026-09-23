/**
 * Glue between component views and their chart, plus coordinate helpers.
 *
 * Components compute geometry in **container px** (top-left origin, like `plotArea` and
 * `AxisInfo.l2c`) and upload it as primitive "data"; a {@link DataTransform} maps it to the world
 * space of the viewport it is drawn in (ADR-008: 1 unit = 1 CSS px, bottom-left origin). A figure
 * resize or a moved subplot is then a transform change, not a re-upload.
 */
import type { Chart, ComponentDrawContext } from '@mk7s/holochart-runtime';
import type { DataTransform, ViewportRect } from '@mk7s/holochart-render';

/** Container px → world px of the overlay viewport (the whole canvas, bottom-left origin). */
export function overlayTransform(height: number): DataTransform {
  return { scaleX: 1, offsetX: 0, scaleY: -1, offsetY: height, scaleZ: 1, offsetZ: 0 };
}

/** Container px → world px of a 2D viewport whose rect is `rect` (container px, top-left). */
export function rectTransform(rect: Readonly<ViewportRect>): DataTransform {
  return {
    scaleX: 1,
    offsetX: -rect.x,
    scaleY: -1,
    offsetY: rect.y + rect.height,
    scaleZ: 1,
    offsetZ: 0,
  };
}

/** Whether two transforms are equal (skip redundant `setTransform` calls). */
export function sameTransform(a: DataTransform | undefined, b: DataTransform): boolean {
  return (
    a !== undefined &&
    a.scaleX === b.scaleX &&
    a.scaleY === b.scaleY &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY
  );
}

/**
 * The chart a component draw context belongs to (`ctx.chart`). Views call this rather than reading
 * the field directly so contexts built by tests or older runtimes without it degrade to "no chart"
 * (no restyle / relayout, no DOM) instead of throwing.
 */
export function findChart(ctx: ComponentDrawContext): Chart | undefined {
  const chart = (ctx as { readonly chart?: Chart }).chart;
  return chart && !chart.destroyed ? chart : undefined;
}

/** Swallow the rejection of a fire-and-forget chart update (errors reach the chart's listeners). */
export function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}
