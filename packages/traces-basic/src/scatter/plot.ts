/**
 * `scatter` renderer (plan E9.1–E9.3, E9.7, E22.1). A trace draws at most five GPU primitives,
 * whatever its size (plan §3 principle 6): x and y error bars (a line set + a cap marker set each),
 * one polyline set, one instanced marker set and one batched text set. They are updated in place
 * per the runtime's plan: `style` edits touch only style buffers, `selection` restyles markers,
 * and zoom/pan (`transform`) only sets uniforms — except for spline and decimated lines, whose
 * px-space geometry is rebuilt when the zoom changes the axis scales enough to matter.
 */
import { createTickFormatter, isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import {
  createMarkers,
  createTextPrimitive,
  LinePrimitive,
  type DataTransform,
  type MarkerSet,
  type Primitive,
  type RGBA,
  type TextFontWeight,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import {
  formatTemplate,
  type AxisInfo,
  type TemplateContext,
  type TracePlotContext,
  type TraceRenderer,
  type TraceUpdatePlan,
  type TraceView,
} from '@mk7s/holochart-runtime';
import { toRGBA } from '@mk7s/holochart-core';
import { ErrorBarLayer, errorBarStyle } from '../shared/error-bars/index.ts';
import type { ScatterCalc } from './calc.ts';
import { hasLines, hasMarkers, hasText } from './defaults.ts';
import { buildLinePath, needsRebuild, pathDependsOnScale, type LineShape } from './line-path.ts';
import { lineStyle, markerStyle, traceOpacity } from './style.ts';
import { lineCount, plainText, textPlacement, TEXT_LINE_HEIGHT } from './text-position.ts';

export { markerStyle } from './style.ts';

/**
 * Draw order within a trace (added to the trace's render order): error bars under the line, the
 * line under the markers, text on top — Plotly's layer order inside a scatter trace group.
 */
const LAYER = { errorBars: 0.1, line: 0.2, markers: 0.3, text: 0.4 } as const;

/** Render order of a trace: `zorder` first (higher on top), then trace order (plan E2.14). */
export function traceRenderOrder(trace: FullTrace, index: number): number {
  const z = typeof trace['zorder'] === 'number' ? trace['zorder'] : 0;
  // Trace indices stay far below 1e4 in practice; zorder dominates, ties keep trace order.
  return z * 1e4 + index;
}

// ---- Lines ------------------------------------------------------------------------------------

interface FullLineShape {
  shape?: unknown;
  smoothing?: unknown;
  simplify?: unknown;
}

function lineOptions(trace: FullTrace, t: Readonly<DataTransform>) {
  const line = (trace['line'] ?? {}) as FullLineShape;
  return {
    shape: (typeof line.shape === 'string' ? line.shape : 'linear') as LineShape,
    smoothing: typeof line.smoothing === 'number' ? line.smoothing : 1,
    simplify: line.simplify !== false,
    connectgaps: trace['connectgaps'] === true,
    scaleX: Math.abs(t.scaleX),
    scaleY: Math.abs(t.scaleY),
  };
}

// ---- Text -------------------------------------------------------------------------------------

interface FullTextfont {
  family?: unknown;
  size?: unknown;
  color?: unknown;
  weight?: unknown;
  style?: unknown;
}

function valueAt(v: unknown, i: number): unknown {
  if (typeof v === 'string' || !isArrayLike(v)) return v;
  return (v as ArrayLike<unknown>)[i];
}

/** The data value of point `i` along `letter` (given, or implicit `x0 + i·dx`). */
export function dataValue(trace: FullTrace, letter: 'x' | 'y', i: number): unknown {
  const values = trace[letter];
  if (isArrayLike(values)) return (values as ArrayLike<unknown>)[i];
  const start = trace[`${letter}0`];
  const step = Number(trace[`d${letter}`] ?? 1);
  return typeof start === 'number' ? start + i * step : start;
}

/** Lazily created axis hover formatters (Plotly's `xLabel` / `yLabel` for `%{x}` / `%{y}`). */
function axisLabeler(axis: AxisInfo | undefined): ((l: number) => string | undefined) | undefined {
  if (!axis) return undefined;
  let format: ((l: number) => string) | undefined;
  return (l) => {
    if (!Number.isFinite(l)) return undefined;
    if (!format) {
      const formatter = createTickFormatter(axis.scale, axis.full);
      format = (v) => formatter.label(v, true).text;
    }
    return format(l);
  };
}

/**
 * Template context of point `i` for the runtime's shared formatter (the same one hover labels
 * use): `%{x}` / `%{y}` are axis-formatted unless given a format, `%{text}`, `%{customdata[0]}`,
 * `%{pointNumber}`, and any per-point trace attribute (`%{marker.size}`).
 */
export function pointTemplateContext(
  trace: FullTrace,
  calc: ScatterCalc,
  i: number,
  template: string,
  labelers: { x?: ((l: number) => string | undefined) | undefined; y?: typeof labelers.x },
): TemplateContext {
  const labels: Record<string, string | undefined> = {};
  // Formatting axis labels is not free: only when the template uses the bare variable.
  if (labelers.x && /%\{\s*x\s*\}/.test(template)) labels['x'] = labelers.x(calc.x[i]!);
  if (labelers.y && /%\{\s*y\s*\}/.test(template)) labels['y'] = labelers.y(calc.y[i]!);
  return {
    labels,
    values: {
      x: dataValue(trace, 'x', i),
      y: dataValue(trace, 'y', i),
      text: valueAt(trace['text'], i),
      customdata: valueAt(trace['customdata'], i),
      pointNumber: i,
    },
    fullData: trace,
    data: trace._input,
    pointIndex: i,
  };
}

/**
 * Text labels for `mode` `text`, one per point with non-empty text (`texttemplate` over `text`),
 * placed like Plotly's `textPointPosition` around the marker.
 */
export function textLabels(
  trace: FullTrace,
  calc: ScatterCalc,
  axes: { x?: AxisInfo | undefined; y?: AxisInfo | undefined },
  selectedPoints?: readonly number[] | null,
): TextLabel[] {
  const labels: TextLabel[] = [];
  const font = (trace['textfont'] ?? {}) as FullTextfont;
  const text = trace['text'];
  const template = trace['texttemplate'];
  const position = trace['textposition'];
  const opacity = traceOpacity(trace);
  const markers = hasMarkers(trace['mode']);
  const sizes = calc.markerSize;
  const selected = selectedPoints ? new Set(selectedPoints) : undefined;
  const selColor = (trace['selected'] as { textfont?: { color?: unknown } } | undefined)?.textfont
    ?.color;
  const unselColor = (trace['unselected'] as { textfont?: { color?: unknown } } | undefined)
    ?.textfont?.color;
  const labelers = { x: axisLabeler(axes.x), y: axisLabeler(axes.y) };
  let fixedColor: RGBA | undefined;
  for (let i = 0; i < calc.length; i++) {
    const x = calc.x[i]!;
    const y = calc.y[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const tpl = valueAt(template, i);
    let raw: string;
    if (typeof tpl === 'string' && tpl !== '') {
      // texttemplate drops unknown variables (hovertemplate keeps them visible).
      raw = formatTemplate(tpl, pointTemplateContext(trace, calc, i, tpl, labelers), {
        fallback: '',
      });
    } else {
      const t = valueAt(text, i);
      raw = t === undefined || t === null ? '' : String(t);
    }
    if (raw === '') continue;
    const s = plainText(raw);
    const size = Number(valueAt(font.size, i)) || 12;
    const radius = markers ? (typeof sizes === 'number' ? sizes : (sizes[i] ?? 0)) / 2 : 0;
    const pos = valueAt(position, i);
    const placement = textPlacement(
      typeof pos === 'string' ? pos : 'middle center',
      size,
      radius,
      lineCount(s),
    );
    let colorIn = valueAt(font.color, i);
    if (selected) {
      const override = selected.has(i) ? selColor : unselColor;
      if (typeof override === 'string') colorIn = override;
    }
    let color: RGBA;
    if (typeof font.color === 'string' && colorIn === font.color) {
      fixedColor ??= toRGBA(font.color) ?? [0, 0, 0, 1];
      color = fixedColor;
    } else {
      color = (typeof colorIn === 'string' ? toRGBA(colorIn) : null) ?? [0, 0, 0, 1];
    }
    // Plotly dims unselected text like markers when no unselected color is given.
    const dim = selected && !selected.has(i) && typeof unselColor !== 'string' ? 0.2 : 1;
    const family = valueAt(font.family, i);
    labels.push({
      text: s,
      x,
      y,
      ...placement,
      lineHeight: TEXT_LINE_HEIGHT,
      color: [color[0], color[1], color[2], color[3] * opacity * dim],
      font: {
        ...(typeof family === 'string' ? { family } : {}),
        size,
        ...(font.weight !== undefined ? { weight: font.weight as TextFontWeight } : {}),
        ...(font.style === 'italic' ? { style: 'italic' as const } : {}),
      },
    });
  }
  return labels;
}

// ---- Markers ----------------------------------------------------------------------------------

/** Marker positions with Plotly's `maxdisplayed`: an even stride of points, the rest hidden. */
function markerPositions(
  trace: FullTrace,
  calc: ScatterCalc,
): { x: Float64Array; y: Float64Array } {
  const max = (trace['marker'] as { maxdisplayed?: unknown } | undefined)?.maxdisplayed;
  if (typeof max !== 'number' || max <= 0 || calc.length <= max) return { x: calc.x, y: calc.y };
  const stride = Math.ceil(calc.length / max);
  const x = new Float64Array(calc.length).fill(NaN);
  const y = new Float64Array(calc.length).fill(NaN);
  for (let i = 0; i < calc.length; i += stride) {
    x[i] = calc.x[i]!;
    y[i] = calc.y[i]!;
  }
  return { x, y };
}

// ---- View -------------------------------------------------------------------------------------

class ScatterView implements TraceView<ScatterCalc> {
  #errors: { x?: ErrorBarLayer; y?: ErrorBarLayer } = {};
  #line: LinePrimitive | undefined;
  /** Scales the line path was built for, when it depends on them (spline, decimation). */
  #lineScales: { scaleX: number; scaleY: number } | undefined;
  #markers: MarkerSet | undefined;
  #text: TextPrimitive | undefined;

  constructor(ctx: TracePlotContext<ScatterCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<ScatterCalc>, plan: TraceUpdatePlan): void {
    if (plan.calc || plan.plot) {
      this.#sync(ctx);
      return;
    }
    if (plan.style || plan.selection) this.#restyle(ctx);
    if (plan.transform) this.#setTransform(ctx);
  }

  /** Create, remove or fully refresh every primitive to match the trace. */
  #sync(ctx: TracePlotContext<ScatterCalc>): void {
    const { trace, calc } = ctx;
    const order = traceRenderOrder(trace, ctx.index);
    const mode = trace['mode'];

    for (const letter of ['x', 'y'] as const) {
      const bars = letter === 'x' ? calc.errorX : calc.errorY;
      let layer = this.#errors[letter];
      if (!bars || bars.count === 0) {
        if (layer) this.#removeAll(ctx, layer.primitives);
        this.#errors[letter] = undefined;
        continue;
      }
      const data = { x: calc.x, y: calc.y, bars, style: errorBarStyle(trace, letter) };
      if (!layer) {
        layer = new ErrorBarLayer(ctx.primitives, data);
        for (const p of layer.primitives) ctx.add(p);
        this.#errors[letter] = layer;
      } else {
        layer.update(data);
      }
      layer.renderOrder = order + LAYER.errorBars;
    }

    if (hasLines(mode) && calc.length > 0) {
      this.#line ??= this.#add(ctx, new LinePrimitive(ctx.primitives));
      this.#line.update({ ...this.#linePath(ctx), ...lineStyle(trace) });
      this.#line.object.renderOrder = order + LAYER.line;
    } else {
      this.#line = this.#drop(ctx, this.#line);
      this.#lineScales = undefined;
    }

    if (hasMarkers(mode)) {
      const data = {
        ...markerPositions(trace, calc),
        ...markerStyle(trace, {
          calc,
          fullLayout: ctx.fullLayout,
          selectedPoints: ctx.selectedPoints ?? null,
        }),
      };
      if (!this.#markers) {
        this.#markers = this.#add(ctx, createMarkers(ctx.primitives, data));
      } else {
        this.#markers.update(data);
      }
      this.#markers.object.renderOrder = order + LAYER.markers;
    } else {
      this.#markers = this.#drop(ctx, this.#markers);
    }

    if (hasText(mode)) {
      if (!this.#text) {
        const text = createTextPrimitive(ctx.primitives, { mode: 'fixed', sizing: 'screen' });
        this.#text = this.#add(ctx, text);
      }
      this.#text.update({ labels: this.#labels(ctx) });
      this.#text.object.renderOrder = order + LAYER.text;
    } else {
      this.#text = this.#drop(ctx, this.#text);
    }

    this.#setTransform(ctx, true);
  }

  /** Style-only update: colors, widths, opacities, selection. Geometry is untouched. */
  #restyle(ctx: TracePlotContext<ScatterCalc>): void {
    const { trace, calc } = ctx;
    for (const letter of ['x', 'y'] as const) {
      this.#errors[letter]?.update({ style: errorBarStyle(trace, letter) });
    }
    this.#line?.update(lineStyle(trace));
    this.#markers?.update(
      markerStyle(trace, {
        calc,
        fullLayout: ctx.fullLayout,
        selectedPoints: ctx.selectedPoints ?? null,
      }),
    );
    // Labels are matched by layout, so a recolor re-packs colors without re-typesetting.
    this.#text?.update({ labels: this.#labels(ctx) });
  }

  #setTransform(ctx: TracePlotContext<ScatterCalc>, synced = false): void {
    const t = ctx.transform;
    this.#errors.x?.setTransform(t);
    this.#errors.y?.setTransform(t);
    if (this.#line) {
      const scales = { scaleX: Math.abs(t.scaleX), scaleY: Math.abs(t.scaleY) };
      if (!synced && this.#lineScales && needsRebuild(this.#lineScales, scales)) {
        this.#line.update(this.#linePath(ctx));
      }
      this.#line.setTransform(t);
    }
    this.#markers?.setTransform(t);
    this.#text?.setTransform(t);
  }

  #linePath(ctx: TracePlotContext<ScatterCalc>): { x: Float64Array; y: Float64Array } {
    const opts = lineOptions(ctx.trace, ctx.transform);
    const path = buildLinePath(ctx.calc.x, ctx.calc.y, opts);
    this.#lineScales = pathDependsOnScale(opts, path.decimated)
      ? { scaleX: opts.scaleX, scaleY: opts.scaleY }
      : undefined;
    return { x: path.x, y: path.y };
  }

  #labels(ctx: TracePlotContext<ScatterCalc>): TextLabel[] {
    return textLabels(
      ctx.trace,
      ctx.calc,
      { x: ctx.xaxis, y: ctx.yaxis },
      ctx.selectedPoints ?? null,
    );
  }

  #add<P extends Primitive<unknown>>(ctx: TracePlotContext<ScatterCalc>, primitive: P): P {
    ctx.add(primitive);
    return primitive;
  }

  #drop<P extends Primitive<unknown>>(
    ctx: TracePlotContext<ScatterCalc>,
    p: P | undefined,
  ): undefined {
    if (p) ctx.remove(p);
    return undefined;
  }

  #removeAll(ctx: TracePlotContext<ScatterCalc>, primitives: readonly Primitive<unknown>[]): void {
    for (const p of primitives) ctx.remove(p);
  }
}

/** The scatter `plot` part: creates one view per visible trace. */
export const scatterRenderer: TraceRenderer<ScatterCalc> = {
  create: (ctx) => new ScatterView(ctx),
};
