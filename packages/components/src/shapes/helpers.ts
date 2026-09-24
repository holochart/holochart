/**
 * Shape helpers (plan E5.5), like plotly.py's `add_hline` / `add_vline` / `add_hrect` /
 * `add_vrect`: lines and bands spanning a subplot's whole width or height, appended to
 * `layout.shapes` with one `relayout`.
 *
 * The spanning dimension uses the axis' `domain` reference (0–1 across the subplot), so the shape
 * follows the other axis when zooming and never extends past the plot area.
 */
import type { Chart } from '@mk7s/holochart-runtime';

/** Shape attributes accepted by the helpers (anything `layout.shapes[i]` takes). */
export type ShapeOptions = Readonly<Record<string, unknown>>;

/** The axis ids a helper spans and places on (`xref` / `yref` in `options`, default `x` / `y`). */
function refs(options: ShapeOptions): { x: string; y: string } {
  const x = typeof options['xref'] === 'string' ? options['xref'] : 'x';
  const y = typeof options['yref'] === 'string' ? options['yref'] : 'y';
  return { x: x.replace(/ domain$/, ''), y: y.replace(/ domain$/, '') };
}

/** Append `shape` to `layout.shapes` (one `relayout`). */
export function addShape(chart: Chart, shape: ShapeOptions): Promise<Chart> {
  const list = chart.layout['shapes'];
  const n = Array.isArray(list) ? list.length : 0;
  return chart.relayout({ [`shapes[${n}]`]: { ...shape } });
}

/**
 * Add a horizontal line at `y` across the subplot (plotly.py `add_hline`).
 *
 * @example
 * ```ts
 * await addHline(chart, 50, { line: { dash: 'dash', color: 'red' }, label: { text: 'target' } });
 * ```
 */
export function addHline(chart: Chart, y: unknown, options: ShapeOptions = {}): Promise<Chart> {
  const r = refs(options);
  return addShape(chart, {
    type: 'line',
    ...options,
    xref: `${r.x} domain`,
    x0: 0,
    x1: 1,
    yref: r.y,
    y0: y,
    y1: y,
  });
}

/** Add a vertical line at `x` across the subplot (plotly.py `add_vline`). */
export function addVline(chart: Chart, x: unknown, options: ShapeOptions = {}): Promise<Chart> {
  const r = refs(options);
  return addShape(chart, {
    type: 'line',
    ...options,
    xref: r.x,
    x0: x,
    x1: x,
    yref: `${r.y} domain`,
    y0: 0,
    y1: 1,
  });
}

/** Add a horizontal band from `y0` to `y1` across the subplot (plotly.py `add_hrect`). */
export function addHrect(
  chart: Chart,
  y0: unknown,
  y1: unknown,
  options: ShapeOptions = {},
): Promise<Chart> {
  const r = refs(options);
  return addShape(chart, {
    type: 'rect',
    ...options,
    xref: `${r.x} domain`,
    x0: 0,
    x1: 1,
    yref: r.y,
    y0,
    y1,
  });
}

/** Add a vertical band from `x0` to `x1` across the subplot (plotly.py `add_vrect`). */
export function addVrect(
  chart: Chart,
  x0: unknown,
  x1: unknown,
  options: ShapeOptions = {},
): Promise<Chart> {
  const r = refs(options);
  return addShape(chart, {
    type: 'rect',
    ...options,
    xref: r.x,
    x0,
    x1,
    yref: `${r.y} domain`,
    y0: 0,
    y1: 1,
  });
}
