/**
 * `scatter` renderer (plan E9.1–E9.4, E9.7, E22.1). A trace draws at most six GPU primitives,
 * whatever its size (plan §3 principle 6): one batched fill, x and y error bars (a line set + a
 * cap marker set each), one polyline set, one instanced marker set and one batched text set. They
 * are updated in place per the runtime's plan: `style` edits touch only style buffers, `selection`
 * restyles markers, and zoom/pan (`transform`) only sets uniforms — except for spline and
 * decimated lines (and spline fills), whose geometry is rebuilt when the zoom changes the axis
 * scales enough to matter.
 */
import {
  createTickFormatter,
  isArrayLike,
  mayContainRichText,
  type FullTrace,
} from '@mk7s/holochart-core';
import {
  createLazyFillPrimitive,
  createMarkers,
  createTextPrimitive,
  LinePrimitive,
  type LazyFillPrimitive,
  type DataTransform,
  type MarkerData,
  type MarkerPatch,
  type MarkerSet,
  type Primitive,
  type RGBA,
  TEXT_DEFAULT_FONT,
  type TextFont,
  type TextFontWeight,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import {
  formatTemplate,
  type AxisInfo,
  type ComponentPointerEvent,
  type TemplateContext,
  type TraceAppend,
  type TracePlotContext,
  type TraceRenderer,
  type TraceUpdatePlan,
  type TraceView,
} from '@mk7s/holochart-runtime';
import { toRGBA } from '@mk7s/holochart-core';
import { ErrorBarLayer, errorBarStyle } from '../shared/error-bars/index.ts';
import { traceRenderOrder } from '../shared/render-order.ts';
import {
  cartesianLinkAt,
  fadeRuns,
  handleLinkPointer,
  hasLink,
  richLabel,
  type RichLabel,
} from '../shared/rich-text.ts';
import { drawnSeries, type ScatterCalc } from './calc.ts';
import { windowChange } from './calc-stream.ts';
import { fillStyle, traceFill, type TraceFill } from './fill-trace.ts';
import { hasLines, hasMarkers, hasText } from './defaults.ts';
import { needsRebuild, pathDependsOnScale, type LineShape } from './line-path.ts';
import { LinePathStream } from './line-stream.ts';
import { lineStyle, markerStyle, traceOpacity } from './style.ts';
import { lineCount, plainText, textPlacement, TEXT_LINE_HEIGHT } from './text-position.ts';

export { markerStyle } from './style.ts';

/**
 * Draw order within a trace (added to the trace's render order): fills under the error bars,
 * error bars under the line, the line under the markers, text on top — Plotly's layer order inside
 * a scatter trace group. A `tonext*` fill draws in the previous trace's group, above that trace's
 * own fill (`nextFill`), so the previous trace's line stays on top of it, as in Plotly.
 */
const LAYER = {
  fill: 0.05,
  nextFill: 0.06,
  errorBars: 0.1,
  line: 0.2,
  markers: 0.3,
  text: 0.4,
} as const;

export { traceRenderOrder };

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
 * placed like Plotly's `textPointPosition` around the marker. Pseudo-HTML (E2.10) becomes styled
 * runs; as in Plotly's SVG text, raw newlines are spaces and only `<br>` breaks lines.
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
    const size = Number(valueAt(font.size, i)) || 12;
    const family = valueAt(font.family, i);
    const labelFont: Partial<TextFont> = {
      ...(typeof family === 'string' ? { family } : {}),
      size,
      ...(font.weight !== undefined ? { weight: font.weight as TextFontWeight } : {}),
      ...(font.style === 'italic' ? { style: 'italic' as const } : {}),
    };
    // Plain strings keep the plain-text path (and label objects) exactly as before rich text.
    let rich: RichLabel | undefined;
    let richFont: TextFont | undefined;
    if (mayContainRichText(raw)) {
      const base: TextFont = { ...TEXT_DEFAULT_FONT, ...labelFont };
      rich = richLabel(raw, base, 'space');
      if (rich && !rich.runs && rich.font !== base) richFont = rich.font;
    }
    const s = rich ? rich.text : plainText(raw);
    const radius = markers ? (typeof sizes === 'number' ? sizes : (sizes[i] ?? 0)) / 2 : 0;
    const pos = valueAt(position, i);
    const placement = textPlacement(
      typeof pos === 'string' ? pos : 'middle center',
      size,
      radius,
      rich ? rich.lineCount : lineCount(s),
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
    labels.push({
      text: s,
      x,
      y,
      ...placement,
      lineHeight: TEXT_LINE_HEIGHT,
      color: [color[0], color[1], color[2], color[3] * opacity * dim],
      // A label-wide style (`<b>…</b>`) is merged into the font; mixed styles become runs.
      font: richFont ?? labelFont,
      ...(rich?.runs ? { runs: fadeRuns(rich.runs, opacity * dim) } : {}),
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

/** Whether `v` holds one value per point (as opposed to one value for all). */
function perPoint(v: unknown): v is ArrayLike<unknown> {
  return (
    typeof v === 'object' && v !== null && typeof (v as { length?: unknown }).length === 'number'
  );
}

function sliceOf<T>(v: T, a: number, b: number): T {
  if (!perPoint(v)) return v;
  if (ArrayBuffer.isView(v)) return (v as unknown as Float32Array).subarray(a, b) as T;
  return Array.prototype.slice.call(v, a, b) as T;
}

/**
 * Per-point colors are `Float32Array`s (4 per point); a single color is an RGBA tuple, which is an
 * array too but applies to every point.
 */
function sliceColor<T>(v: T, a: number, b: number): T {
  return v instanceof Float32Array ? (v.subarray(4 * a, 4 * b) as T) : v;
}

/** Marker data of points `[a, b)` for `MarkerSet.patch` (per-point fields sliced). */
function markerSlice(
  calc: ScatterCalc,
  style: Partial<MarkerData>,
  a: number,
  b: number,
): MarkerPatch {
  return {
    x: calc.x.subarray(a, b),
    y: calc.y.subarray(a, b),
    ...(style.size !== undefined ? { size: sliceOf(style.size, a, b) } : {}),
    ...(style.color !== undefined ? { color: sliceColor(style.color, a, b) } : {}),
    ...(style.colorValues ? { colorValues: sliceOf(style.colorValues, a, b) } : {}),
    ...(style.lineColor !== undefined ? { lineColor: sliceColor(style.lineColor, a, b) } : {}),
    ...(style.lineWidth !== undefined ? { lineWidth: sliceOf(style.lineWidth, a, b) } : {}),
    ...(style.symbol !== undefined ? { symbol: sliceOf(style.symbol, a, b) } : {}),
    ...(style.opacity !== undefined ? { opacity: sliceOf(style.opacity, a, b) } : {}),
    ...(style.angle !== undefined ? { angle: sliceOf(style.angle, a, b) } : {}),
  };
}

/** Hidden markers (NaN positions) for `n` instances. */
function hidden(n: number): MarkerPatch {
  const nan = new Float64Array(n).fill(NaN);
  return { x: nan, y: nan };
}

/**
 * `data` with `front` hidden instances before every point (room for prepends, E7.2): per-point
 * fields get neutral values there.
 */
function padFront(data: Partial<MarkerData>, front: number): Partial<MarkerData> {
  if (front === 0) return data;
  const out: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    const color = key === 'color' || key === 'lineColor';
    if (!perPoint(value) || key === 'nanColor' || key === 'colorscale' || key === 'origin')
      continue;
    // A single color (RGBA tuple) applies to every point: nothing to pad.
    if (color && !(value instanceof Float32Array)) continue;
    const stride = color ? 4 : 1;
    const src = value as ArrayLike<unknown>;
    if (ArrayBuffer.isView(src)) {
      const ctor = (src as unknown as Float64Array).constructor as Float64ArrayConstructor;
      const padded = new ctor(front * stride + src.length);
      if (key === 'x' || key === 'y' || key === 'colorValues') padded.fill(NaN, 0, front * stride);
      padded.set(src as unknown as Float64Array, front * stride);
      out[key] = padded;
    } else {
      const fill = key === 'x' || key === 'y' || key === 'colorValues' ? NaN : 0;
      out[key] = [...new Array<unknown>(front * stride).fill(fill), ...Array.from(src)];
    }
  }
  return out as Partial<MarkerData>;
}

// ---- View -------------------------------------------------------------------------------------

class ScatterView implements TraceView<ScatterCalc> {
  #fill: LazyFillPrimitive | undefined;
  /** The fill geometry the primitive holds (the memo returns the same object when unchanged). */
  #fillBuilt: TraceFill | undefined;
  /** The calc last drawn: a streamed calc (`appendOf`) of it can take the streaming path. */
  #drawn: ScatterCalc | undefined;
  #errors: { x?: ErrorBarLayer; y?: ErrorBarLayer } = {};
  #line: LinePrimitive | undefined;
  /** The line's vertex path, kept incrementally while streaming (E7.2). */
  #path = new LinePathStream();
  /** Scales the line path was built for, when it depends on them (spline, decimation). */
  #lineScales: { scaleX: number; scaleY: number; spline: boolean } | undefined;
  #markers: MarkerSet | undefined;
  /**
   * Marker instances of points `[0, n)` are `[#markerHead, #markerHead + n)`; instances outside
   * are hidden. Streaming (E7.2) slides this window instead of rewriting every instance.
   */
  #markerHead = 0;
  #text: TextPrimitive | undefined;
  /** The context text was last drawn with, and its labels with links (E2.10), for pointers. */
  #textCtx: TracePlotContext<ScatterCalc> | undefined;
  #links: TextLabel[] = [];

  constructor(ctx: TracePlotContext<ScatterCalc>) {
    this.#sync(ctx);
  }

  /** Clicks on label links (`<a href>`) open them; hovering one shows a pointer cursor. */
  handlePointer(event: ComponentPointerEvent): boolean {
    const ctx = this.#textCtx;
    if (!this.#text || this.#links.length === 0 || !ctx) return false;
    const link = cartesianLinkAt(this.#links, ctx.transform, ctx.subplot, event.x, event.y);
    return handleLinkPointer(event, link);
  }

  update(ctx: TracePlotContext<ScatterCalc>, plan: TraceUpdatePlan): void {
    const previous = this.#drawn;
    this.#drawn = ctx.calc;
    // `crossTraceCalc` makes the runtime drop `plan.append` (the calc may have been rewritten);
    // a calc that is exactly a streamed edit of the one drawn last can still stream.
    const streamed = ctx.calc.appendOf;
    const append =
      plan.append ??
      (streamed && previous !== undefined && streamed.previous === previous
        ? streamed.append
        : undefined);
    if (append && this.#append(ctx, append)) {
      if (plan.transform) this.#setTransform(ctx);
      return;
    }
    if (plan.calc || plan.plot) {
      this.#sync(ctx);
      return;
    }
    if (plan.style || plan.selection) this.#restyle(ctx);
    if (plan.transform) this.#setTransform(ctx);
  }

  /** Create, remove or refresh the fill (geometry only when it changed, see `traceFill`). */
  #syncFill(ctx: TracePlotContext<ScatterCalc>): void {
    const { trace, calc } = ctx;
    const t = ctx.transform;
    const axes = { x: ctx.xaxis, y: ctx.yaxis };
    const fill = traceFill(calc, trace, axes, {
      scaleX: Math.abs(t.scaleX),
      scaleY: Math.abs(t.scaleY),
    });
    const geometry = fill.geometry;
    if (!geometry) {
      this.#fill = this.#drop(ctx, this.#fill);
      this.#fillBuilt = undefined;
      return;
    }
    const style = fillStyle(trace, axes);
    if (!this.#fill) {
      this.#fill = this.#add(
        ctx,
        createLazyFillPrimitive(ctx.primitives, { ...geometry, ...style }),
      );
    } else if (this.#fillBuilt !== fill) {
      this.#fill.update({ ...geometry, ...style });
    } else {
      this.#fill.update(style);
    }
    this.#fillBuilt = fill;
    const link = calc.link?.previous;
    this.#fill.object.renderOrder = link
      ? traceRenderOrder(link.trace, link.index) + LAYER.nextFill
      : traceRenderOrder(trace, ctx.index) + LAYER.fill;
  }

  /** Create, remove or refresh the error bar layers. */
  #syncErrorBars(ctx: TracePlotContext<ScatterCalc>, order: number): void {
    const { trace, calc } = ctx;
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
  }

  /**
   * Streaming update (E7.2): upload only what the added and removed points change — marker
   * instances at the ends of a sliding window, the line's vertex stream around the retained part
   * — instead of redrawing the trace. Error bars and text labels are refreshed whole (they are
   * rarely streamed). Returns false when the change needs a full sync (primitives to create or
   * remove, `maxdisplayed`, an active selection).
   */
  #append(ctx: TracePlotContext<ScatterCalc>, append: TraceAppend): boolean {
    const { trace, calc } = ctx;
    const mode = trace['mode'];
    if (calc.length === 0 || (ctx.selectedPoints ?? null) !== null) return false;
    if (hasLines(mode) !== (this.#line !== undefined)) return false;
    if (hasMarkers(mode) !== (this.#markers !== undefined)) return false;
    if (hasText(mode) !== (this.#text !== undefined)) return false;
    const maxdisplayed = (trace['marker'] as { maxdisplayed?: unknown } | undefined)?.maxdisplayed;
    if (typeof maxdisplayed === 'number' && maxdisplayed > 0) return false;
    const change = windowChange(append);
    const order = traceRenderOrder(trace, ctx.index);

    // Fills are rebuilt whole on a streaming edit (their rings join every point).
    this.#syncFill(ctx);
    this.#syncErrorBars(ctx, order);

    const line = this.#line;
    if (line) {
      const opts = lineOptions(trace, ctx.transform);
      const built = this.#lineScales;
      const stale =
        built !== undefined &&
        needsRebuild(built, { scaleX: opts.scaleX, scaleY: opts.scaleY }, { spline: built.spline });
      const retain = stale ? undefined : this.#path.edit(calc.x, calc.y, change);
      if (retain) line.splice(this.#path.x, this.#path.y, retain);
      else line.update(stale ? this.#linePath(ctx) : { x: this.#path.x, y: this.#path.y });
      this.#noteLineScales();
    }

    const markers = this.#markers;
    if (markers) {
      const style = markerStyle(trace, { calc, fullLayout: ctx.fullLayout, selectedPoints: null });
      const colorscale = style.colorValues != null && style.colorscale != null;
      const n = calc.length;
      let head = this.#markerHead;
      let end = head + append.previous;
      if (colorscale !== markers.colorscaleMode || change.frontAdded > head) {
        // Room for prepends is made by a full rewrite with hidden instances in front.
        this.#markersFull(ctx, style, change.frontAdded > 0 ? n : 0);
      } else {
        if (change.frontRemoved > 0) {
          markers.patch(head, change.frontRemoved, hidden(change.frontRemoved));
          head += change.frontRemoved;
        }
        if (change.endRemoved > 0) {
          markers.patch(end - change.endRemoved, change.endRemoved, hidden(change.endRemoved));
          end -= change.endRemoved;
        }
        if (change.frontAdded > 0) {
          head -= change.frontAdded;
          markers.patch(head, change.frontAdded, markerSlice(calc, style, 0, change.frontAdded));
        }
        if (change.endAdded > 0) {
          markers.patch(end, change.endAdded, markerSlice(calc, style, n - change.endAdded, n));
        }
        this.#markerHead = head;
        if (colorscale) {
          markers.update({
            cmin: style.cmin!,
            cmax: style.cmax!,
            cmid: null,
            reversescale: style.reversescale ?? false,
          });
        }
        // Once the hidden instances outnumber the points, rewrite compactly (amortized O(1)).
        if (markers.count - n > n + 64) this.#markersFull(ctx, style, 0);
      }
    }

    this.#text?.update({ labels: this.#labels(ctx) });
    return true;
  }

  /** Rewrite every marker instance, with `front` hidden instances first (room for prepends). */
  #markersFull(
    ctx: TracePlotContext<ScatterCalc>,
    style: Partial<MarkerData>,
    front: number,
  ): void {
    const data = { ...markerPositions(ctx.trace, ctx.calc), ...style };
    this.#markers!.update(padFront(data, front));
    this.#markerHead = front;
  }

  /** Create, remove or fully refresh every primitive to match the trace. */
  #sync(ctx: TracePlotContext<ScatterCalc>): void {
    const { trace, calc } = ctx;
    const order = traceRenderOrder(trace, ctx.index);
    const mode = trace['mode'];

    this.#syncFill(ctx);
    this.#syncErrorBars(ctx, order);

    if (hasLines(mode) && calc.length > 0) {
      this.#line ??= this.#add(ctx, new LinePrimitive(ctx.primitives));
      this.#line.update({ ...this.#linePath(ctx), ...lineStyle(trace) });
      this.#line.object.renderOrder = order + LAYER.line;
    } else {
      this.#line = this.#drop(ctx, this.#line);
      this.#lineScales = undefined;
    }

    if (hasMarkers(mode)) {
      const style = markerStyle(trace, {
        calc,
        fullLayout: ctx.fullLayout,
        selectedPoints: ctx.selectedPoints ?? null,
      });
      if (!this.#markers) {
        const data = { ...markerPositions(trace, calc), ...style };
        this.#markers = this.#add(ctx, createMarkers(ctx.primitives, data));
        this.#markerHead = 0;
      } else {
        this.#markersFull(ctx, style, 0);
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
    this.#fill?.update(fillStyle(trace, { x: ctx.xaxis, y: ctx.yaxis }));
    for (const letter of ['x', 'y'] as const) {
      this.#errors[letter]?.update({ style: errorBarStyle(trace, letter) });
    }
    this.#line?.update(lineStyle(trace));
    if (this.#markers) {
      const style = markerStyle(trace, {
        calc,
        fullLayout: ctx.fullLayout,
        selectedPoints: ctx.selectedPoints ?? null,
      });
      // Per-point styles are indexed by point: a streamed (slid) window is rewritten aligned.
      if (this.#markerHead !== 0 || this.#markers.count !== calc.length) {
        this.#markersFull(ctx, style, 0);
      } else {
        this.#markers.update(style);
      }
    }
    // Labels are matched by layout, so a recolor re-packs colors without re-typesetting.
    this.#text?.update({ labels: this.#labels(ctx) });
  }

  #setTransform(ctx: TracePlotContext<ScatterCalc>, synced = false): void {
    const t = ctx.transform;
    // Spline fills follow the zoom like spline lines; `traceFill` decides when to rebuild.
    if (!synced && this.#fillBuilt?.dependsOnScale) this.#syncFill(ctx);
    this.#fill?.setTransform(t);
    this.#errors.x?.setTransform(t);
    this.#errors.y?.setTransform(t);
    if (this.#line) {
      const scales = { scaleX: Math.abs(t.scaleX), scaleY: Math.abs(t.scaleY) };
      const built = this.#lineScales;
      if (!synced && built && needsRebuild(built, scales, { spline: built.spline })) {
        this.#line.update(this.#linePath(ctx));
      }
      this.#line.setTransform(t);
    }
    this.#markers?.setTransform(t);
    this.#text?.setTransform(t);
    this.#textCtx = ctx;
  }

  #linePath(ctx: TracePlotContext<ScatterCalc>): { x: Float64Array; y: Float64Array } {
    const series = drawnSeries(ctx.calc);
    this.#path.rebuild(series.x, series.y, lineOptions(ctx.trace, ctx.transform));
    this.#noteLineScales();
    return { x: this.#path.x, y: this.#path.y };
  }

  /** Remember the scales the path was built for when its shape depends on them. */
  #noteLineScales(): void {
    const opts = this.#path.options;
    this.#lineScales =
      opts && pathDependsOnScale(opts, this.#path.decimated)
        ? {
            scaleX: opts.scaleX,
            scaleY: opts.scaleY,
            spline: opts.shape === 'spline' && opts.smoothing > 0,
          }
        : undefined;
  }

  #labels(ctx: TracePlotContext<ScatterCalc>): TextLabel[] {
    const labels = textLabels(
      ctx.trace,
      ctx.calc,
      { x: ctx.xaxis, y: ctx.yaxis },
      ctx.selectedPoints ?? null,
    );
    this.#textCtx = ctx;
    this.#links = labels.some(hasLink) ? labels.filter(hasLink) : [];
    return labels;
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
