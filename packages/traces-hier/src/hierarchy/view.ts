/**
 * What the views of the hierarchy traces share (plan E13.1): drill-down clicks (Plotly's `onClick`
 * in `fx.js`), the click transition's clock, and styling helpers.
 *
 * ## Drill-down
 *
 * A click on a node emits `<type>click` (with `nextLevel`) and then `click`; unless a listener
 * returned `false`, a click that leads somewhere sets `level` with a GUI `restyle` (kept by
 * `uirevision`, Plotly's `_storeDirectGUIEdit`), which the view animates over 750 ms, linearly
 * (Plotly's `CLICK_TRANSITION_TIME` and easing), when it arrives. Other `level` changes (`restyle`,
 * `react`) snap, and so does everything under `prefers-reduced-motion: reduce`. Clicks during a
 * transition emit their events but don't drill (Plotly).
 */
import { reducedMotion, uniformTextOf, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import { fadeTextRuns, type Primitive, type TextLabel } from '@mk7s/holochart-render';
import {
  getChart,
  type Chart,
  type ChartPoint,
  type ComponentPointerEvent,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { MULTIPLE_ROOTS_ID, type HierNode } from './build.ts';
import { nodeAttr } from './format.ts';
import { LINE_HEIGHT } from './text.ts';

/** Plotly's `CLICK_TRANSITION_TIME` (ms) and linear `CLICK_TRANSITION_EASING`. */
export const CLICK_TRANSITION_TIME = 750;

/** Labels fade in over the last part of a transition (fraction of its duration). */
export const LABEL_FADE = 0.4;

/** The opacity of labels at transition time `t` (0 until they start fading in, 1 at the end). */
export function labelAlpha(t: number): number {
  return Math.max(0, (t - (1 - LABEL_FADE)) / LABEL_FADE);
}

/** Render order in the overlay: primitives of layer `layer` (in [-10, 0)) of trace `index`. */
export const orderOf = (layer: number, index: number): number =>
  layer + Math.min(index, 999) * 1e-3;

/**
 * A view's primitive after drawing `data`: created (and added) on first use, else updated, and
 * placed at render order `order`; removed when `data` is `undefined`.
 */
export function syncPrimitive<T, P extends Primitive<T>>(
  ctx: Pick<TracePlotContext<unknown>, 'add' | 'remove' | 'transform'>,
  primitive: P | undefined,
  data: Partial<T> | undefined,
  create: (data: Partial<T>) => P,
  order: number,
): P | undefined {
  if (data === undefined) {
    if (primitive) ctx.remove(primitive);
    return undefined;
  }
  if (!primitive) ctx.add((primitive = create(data)));
  else primitive.update(data);
  primitive.object.renderOrder = order;
  primitive.setTransform(ctx.transform);
  return primitive;
}

/** `c` with its alpha multiplied by `alpha`. */
export function fadeColor(c: RGBA, alpha: number): RGBA {
  return alpha === 1 ? c : [c[0], c[1], c[2], c[3] * alpha];
}

/** A trace's `opacity` (1 when unset). */
export function traceOpacity(trace: FullTrace): number {
  const o = trace['opacity'];
  return typeof o === 'number' && Number.isFinite(o) ? o : 1;
}

/**
 * A node's `marker.pattern`, array attributes cast to its data index, with the background
 * defaulting to `paper` unless the pattern overlays the fill (as pie). `undefined` without a
 * shape or for generated roots.
 */
export function nodePattern(
  pattern: unknown,
  i: number,
  paper: unknown,
): Record<string, unknown> | undefined {
  if (i < 0 || !pattern || typeof pattern !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pattern)) out[key] = nodeAttr(value, i);
  if (!out['shape']) return undefined;
  if (out['fillmode'] !== 'overlay') out['bgcolor'] ??= paper;
  return out;
}

/** One placed label of a hierarchy chart, in container px (y down). */
export interface NodeLabel {
  /** Plain text (pseudo-HTML simplified). */
  readonly text: string;
  /** Center of the label. */
  readonly x: number;
  readonly y: number;
  /** Font with the fitted size. */
  readonly font: TextLabel['font'];
  /** Styled runs at the fitted size (E2.10), when the label mixes styles. */
  readonly runs?: TextLabel['runs'];
  readonly color: RGBA;
  /** Degrees clockwise (default 0). */
  readonly angle?: number;
  /** How lines of several are aligned (default centered). */
  readonly align?: 'left' | 'center' | 'right';
}

/** Labels for the text primitive, in world px (`height` flips y). `alpha` multiplies opacity. */
export function worldLabels(
  labels: readonly NodeLabel[],
  height: number,
  alpha: number,
): TextLabel[] {
  return labels.map((l) => {
    const label: TextLabel = {
      text: l.text,
      x: l.x,
      y: height - l.y,
      font: l.font,
      color: [l.color[0], l.color[1], l.color[2], l.color[3] * alpha],
      anchorX: 'center',
      anchorY: 'middle',
      align: l.align ?? 'center',
      angle: l.angle ?? 0,
      lineHeight: LINE_HEIGHT,
    };
    if (l.runs) label.runs = fadeTextRuns(l.runs, alpha);
    return label;
  });
}

/** The chart that owns a pointer event's target (the canvas inside the chart's element). */
export function chartOf(event: ComponentPointerEvent): Chart | undefined {
  let node = (event.native?.target ?? null) as Node | null;
  while (node) {
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
      const chart = getChart(node);
      if (chart) return chart;
    }
    node = node.parentNode;
  }
  return undefined;
}

/** The `level` of an entry: its id, `''` for the generated root of several roots. */
export function levelOf(entry: HierNode): string {
  return entry.id === MULTIPLE_ROOTS_ID ? '' : entry.id;
}

/**
 * Emit a node click (`sunburstclick`, `treemapclick` or `icicleclick` with `nextLevel`, then
 * `click` when the chart emits clicks). Whether the click may drill: no listener returned `false`.
 */
export function emitNodeClick(
  chart: Chart,
  type: 'sunburstclick' | 'treemapclick' | 'icicleclick',
  point: ChartPoint,
  nextLevel: string | undefined,
): boolean {
  let proceed = chart.emit(type, {
    points: [point],
    ...(nextLevel !== undefined ? { nextLevel } : {}),
  });
  const fx = chart.interaction;
  if (proceed && fx.hovermode !== false && fx.clickEvent) {
    proceed = chart.emit('click', { points: [point] });
  }
  return proceed;
}

/** Drill to `level`: a GUI restyle of trace `index` (see the module comment). */
export function drillTo(chart: Chart, index: number, level: string): void {
  chart.unhover();
  chart.restyle({ level: [level] }, [index], { gui: true }).catch(() => undefined);
}

/**
 * The clock of a click transition: `render(t)` runs at once with `t = 0`, then on every animation
 * frame with the elapsed fraction of {@link CLICK_TRANSITION_TIME}, last with `t = 1`.
 */
export class Transition {
  #render: ((t: number) => void) | undefined;
  #start = 0;
  #frame = 0;

  /** Whether a transition is running. */
  get running(): boolean {
    return this.#render !== undefined;
  }

  start(render: (t: number) => void): void {
    this.stop();
    this.#render = render;
    this.#start = performance.now();
    this.#step(this.#start);
  }

  stop(): void {
    if (this.#frame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.#frame);
    }
    this.#frame = 0;
    this.#render = undefined;
  }

  readonly #onFrame = (now: number): void => {
    this.#frame = 0;
    this.#step(now);
  };

  #step(now: number): void {
    const render = this.#render;
    if (!render) return;
    const t = Math.min(1, Math.max(0, (now - this.#start) / CLICK_TRANSITION_TIME));
    if (t >= 1) this.#render = undefined;
    render(t);
    if (this.#render) this.#frame = requestAnimationFrame(this.#onFrame);
  }
}

/**
 * Whether a `level` change should animate (a click asked for it, and motion is allowed:
 * `config.a11y.reducedMotion`, else `prefers-reduced-motion`; plan E17.5). Not with
 * `layout.uniformtext` (E4.6), as in Plotly: labels are sized once every trace is laid out.
 */
export function canAnimate(fullLayout: Readonly<Record<string, unknown>>): boolean {
  return (
    typeof requestAnimationFrame === 'function' &&
    !reducedMotion(fullLayout) &&
    !uniformTextOf(fullLayout).mode
  );
}
