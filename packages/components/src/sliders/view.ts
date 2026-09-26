/**
 * The sliders DOM view (plan E5.11): a rail with step ticks and labels, a current-value label and a
 * handle, positioned from the pure layout in `layout.ts`.
 *
 * Accessibility (plan E17.4): the handle is the focusable `role="slider"` (one tab stop per
 * slider) with `aria-valuemin`/`max`/`now` counting visible steps and `aria-valuetext` giving the
 * step's label (with the current-value prefix and suffix). Arrow keys step by one (Right/Up
 * forward), PageUp/PageDown by a tenth of the steps, Home/End jump to the ends; each key runs the
 * step's method like a pointer move. The current value and tick labels are `aria-hidden` (the
 * slider announces them). Pointer: press anywhere on the rail or labels, drag, the handle snaps to
 * steps. The handle's glide (`transition`) is off with `prefers-reduced-motion`.
 */
import type { ComponentDrawContext, ComponentUpdatePlan } from '@mk7s/holochart-runtime';
import {
  applyDomFont,
  claimPositionedHost,
  ensureStyle,
  nextFrame,
  shieldEvents,
} from '../shared/dom.ts';
import { fireAndForget } from '../shared/host.ts';
import { oracleMeasure, type MeasureLine } from '../shared/text.ts';
import { CommandObserver, executeCommand, type CommandChart } from '../updatemenus/commands.ts';
import type { SliderChangeEvent, SliderEndEvent, SliderStartEvent } from './events.ts';
import {
  currentValueText,
  layoutSlider,
  pageSize,
  placeSlider,
  stepBy,
  stepPositionAt,
  type SliderLayout,
} from './layout.ts';
import type { FullSlider, FullSliderStep } from './schema.ts';

/** The parts of a `Chart` the sliders use. */
export interface SlidersChartLike extends CommandChart {
  readonly element: HTMLElement;
  relayout(update: Readonly<Record<string, unknown>>, options?: { gui?: boolean }): unknown;
  emit(type: 'sliderchange', payload: SliderChangeEvent): unknown;
  emit(type: 'sliderstart', payload: SliderStartEvent): unknown;
  emit(type: 'sliderend', payload: SliderEndEvent): unknown;
}

export type SlidersViewContext = Pick<
  ComponentDrawContext,
  'fullLayout' | 'fullData' | 'plotArea' | 'width' | 'height'
>;

export interface SlidersViewOptions<Ctx extends SlidersViewContext> {
  readonly locate?: (ctx: Ctx) => SlidersChartLike | undefined;
  readonly warn?: (message: string) => void;
  readonly measure?: MeasureLine;
  /** Schedules a step's method (default: the next animation frame, like Plotly). */
  readonly schedule?: (callback: () => void) => () => void;
}

export interface SlidersView<Ctx extends SlidersViewContext> {
  update(ctx: Ctx, plan?: ComponentUpdatePlan): void;
  dispose(): void;
  readonly root: HTMLElement | undefined;
  /**
   * Hook for animation playback (plan E7.4): the chart emits `animatingframe` with the frame's
   * `name`; sliders whose steps animate to single frames move to that frame's step (no method
   * runs). Called by the view's own `animatingframe` listener; public for tests.
   */
  frame(name: unknown): void;
}

const STYLE_ID = 'hc-sliders-style';

const CSS = `
.hc-sliders{position:absolute;left:0;top:0;width:0;height:0;z-index:1000}
.hc-slider{position:absolute;pointer-events:none}
.hc-slider-value,.hc-slider-label{position:absolute;white-space:pre;user-select:none;-webkit-user-select:none}
.hc-slider-label{transform:translateX(-50%);text-align:center}
.hc-slider-track{position:absolute;pointer-events:auto;cursor:pointer;touch-action:none}
.hc-slider-rail,.hc-slider-tick{position:absolute;box-sizing:border-box}
.hc-slider-rail{border:var(--hc-slider-bw) solid var(--hc-slider-border);background:var(--hc-slider-bg)}
.hc-slider-tick{background:var(--hc-slider-tick)}
.hc-slider-grip{position:absolute;box-sizing:border-box;border:var(--hc-slider-bw) solid var(--hc-slider-border);border-radius:50%;background:var(--hc-slider-bg);pointer-events:auto;cursor:grab;touch-action:none}
.hc-slider-grip:hover,.hc-slider-grip[data-dragging]{background:var(--hc-slider-activebg)}
.hc-slider-grip[data-dragging]{cursor:grabbing}
.hc-slider-grip:focus-visible{outline:2px solid var(--hc-slider-focus);outline-offset:1px}
@media (prefers-reduced-motion:reduce){.hc-slider-grip{transition:none!important}}
`;

/** CSS `cubic-bezier`s for Plotly's easings (`in`, `out`, `in-out`; easings.net values). */
const BEZIER: Record<string, readonly [string, string, string]> = {
  quad: ['0.11,0,0.5,0', '0.5,1,0.89,1', '0.45,0,0.55,1'],
  cubic: ['0.32,0,0.67,0', '0.33,1,0.68,1', '0.65,0,0.35,1'],
  sin: ['0.12,0,0.39,0', '0.61,1,0.88,1', '0.37,0,0.63,1'],
  exp: ['0.7,0,0.84,0', '0.16,1,0.3,1', '0.87,0,0.13,1'],
  circle: ['0.55,0,1,0.45', '0,0.55,0.45,1', '0.85,0,0.15,1'],
  back: ['0.36,0,0.66,-0.56', '0.34,1.56,0.64,1', '0.68,-0.6,0.32,1.6'],
};

/**
 * A Plotly easing name as a CSS timing function, approximating the d3 v3 curves chart transitions
 * use (runtime's lazily loaded `anim/easing.ts`): a bare name means `-in`, and `elastic` and
 * `bounce` (not expressible as one cubic Bézier) use `back` and `cubic` — flipped, since d3 v3's
 * `elastic-in` / `bounce-in` are out-shaped.
 */
export function cssEasing(easing: string): string {
  const [name = 'cubic', ...rest] = easing.split('-');
  if (name === 'linear') return 'linear';
  const mode = rest.join('-');
  const key = name === 'elastic' ? 'back' : name === 'bounce' ? 'cubic' : name;
  const curves = BEZIER[key] ?? BEZIER['cubic'];
  let k = mode === 'out' ? 1 : mode === 'in-out' ? 2 : 0;
  if (key !== name && k < 2) k = 1 - k;
  return `cubic-bezier(${(curves as readonly string[])[k]})`;
}

interface SliderDom {
  readonly position: number;
  readonly el: HTMLDivElement;
  key: string;
  slider: FullSlider;
  layout: SliderLayout;
  value?: HTMLDivElement;
  track: HTMLDivElement;
  grip: HTMLDivElement;
  dragging: boolean;
  pointerId?: number;
  pendingActive?: number;
  /** A step method waiting for the next frame (Plotly's `_nextMethod`), and its cancel. */
  nextStep?: FullSliderStep;
  cancelNext?: () => void;
}

function reducedMotion(doc: Document): boolean {
  try {
    return doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** Create the sliders view (DOM in `chart.element`, above the canvas). */
export function createSlidersView<Ctx extends SlidersViewContext>(
  initialChart: SlidersChartLike | undefined,
  ctx: Ctx,
  options: SlidersViewOptions<Ctx> = {},
): SlidersView<Ctx> {
  let chart = initialChart;
  let root: HTMLDivElement | undefined;
  let releaseHost: (() => void) | undefined;
  let unshield: (() => void) | undefined;
  let unsubscribeFrames: (() => void) | undefined;
  let sliders: SliderDom[] = [];
  let last: Ctx = ctx;
  let disposed = false;
  const observers = new Map<number, CommandObserver>();
  const measure = options.measure ?? oracleMeasure;
  const schedule = options.schedule ?? nextFrame;

  const warned = new Set<string>();
  const warn = (message: string): void => {
    if (warned.has(message)) return;
    warned.add(message);
    (options.warn ?? ((m: string) => console.warn(m)))(message);
  };

  const observerFor = (position: number): CommandObserver => {
    let o = observers.get(position);
    if (!o) {
      o = new CommandObserver();
      observers.set(position, o);
    }
    return o;
  };

  // ---- state ------------------------------------------------------------------------------------

  const storeActive = (slider: FullSlider, index: number): void => {
    if (!chart || slider._index < 0) return;
    const result = chart.relayout({ [`sliders[${slider._index}].active`]: index }, { gui: true });
    if (result instanceof Promise) fireAndForget(result);
  };

  /** Plotly `setActive`: move the handle, store `active`, emit, and (on input) run the step. */
  const setActive = (d: SliderDom, index: number, interaction: boolean, glide: boolean): void => {
    const slider = d.slider;
    const previousActive = slider.active;
    slider.active = index;
    d.pendingActive = index;
    storeActive(slider, index);
    refresh(d, glide);
    const step = slider.steps[index];
    chart?.emit('sliderchange', { slider, step, interaction, previousActive });
    if (!interaction || !step) return;
    d.nextStep = step;
    d.cancelNext ??= schedule(() => {
      const next = d.nextStep;
      d.nextStep = undefined;
      d.cancelNext = undefined;
      if (next?.execute && chart) void executeCommand(chart, next.method, next.args, warn);
    });
  };

  // ---- input ------------------------------------------------------------------------------------

  const sliderOf = (target: EventTarget | null): SliderDom | undefined => {
    if (!(target instanceof Element)) return undefined;
    const el = target.closest('.hc-slider');
    return sliders.find((d) => d.el === el);
  };

  const localX = (d: SliderDom, event: PointerEvent): number =>
    event.clientX - d.el.getBoundingClientRect().left;

  const input = (d: SliderDom, event: PointerEvent, glide: boolean): void => {
    const k = stepPositionAt(d.layout, localX(d, event));
    const index = d.layout.steps[k];
    if (index !== undefined && index !== d.slider.active) setActive(d, index, true, glide);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const d = sliderOf(event.target);
    if (!d) return;
    event.preventDefault();
    d.dragging = true;
    d.pointerId = event.pointerId;
    d.grip.setAttribute('data-dragging', '');
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
    d.grip.focus({ preventScroll: true });
    chart?.emit('sliderstart', { slider: d.slider });
    input(d, event, true);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const d = sliderOf(event.target);
    if (!d?.dragging || event.pointerId !== d.pointerId) return;
    input(d, event, false);
  };

  const onPointerUp = (event: PointerEvent): void => {
    const d = sliderOf(event.target);
    if (!d?.dragging || event.pointerId !== d.pointerId) return;
    d.dragging = false;
    d.pointerId = undefined;
    d.grip.removeAttribute('data-dragging');
    chart?.emit('sliderend', { slider: d.slider, step: d.slider.steps[d.slider.active] });
  };

  const onKeydown = (event: KeyboardEvent): void => {
    const d = sliderOf(event.target);
    if (!d || event.target !== d.grip) return;
    const { layout, slider } = d;
    let index: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        index = stepBy(layout, slider.active, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        index = stepBy(layout, slider.active, -1);
        break;
      case 'PageUp':
        index = stepBy(layout, slider.active, pageSize(layout));
        break;
      case 'PageDown':
        index = stepBy(layout, slider.active, -pageSize(layout));
        break;
      case 'Home':
        index = layout.steps[0];
        break;
      case 'End':
        index = layout.steps[layout.steps.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (index !== undefined && index !== slider.active) setActive(d, index, true, true);
  };

  // ---- DOM --------------------------------------------------------------------------------------

  const mount = (host: HTMLElement, c: SlidersChartLike): HTMLDivElement => {
    ensureStyle(host, STYLE_ID, CSS);
    releaseHost = claimPositionedHost(host);
    const doc = host.ownerDocument;
    const el = doc.createElement('div');
    el.className = 'hc-sliders';
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('keydown', onKeydown);
    unshield = shieldEvents(el);
    host.appendChild(el);
    // Animation playback (E7.4) emits `animatingframe` once charts have frames.
    const on = (c as unknown as { on?: (type: string, cb: (p: unknown) => void) => unknown }).on;
    if (typeof on === 'function') {
      const off = on.call(c, 'animatingframe', (p: unknown) =>
        view.frame((p as { name?: unknown } | undefined)?.name),
      );
      if (typeof off === 'function') unsubscribeFrames = off as () => void;
    }
    return el;
  };

  const unmount = (): void => {
    for (const d of sliders) d.cancelNext?.();
    if (!root) return;
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    root.removeEventListener('keydown', onKeydown);
    unshield?.();
    unshield = undefined;
    unsubscribeFrames?.();
    unsubscribeFrames = undefined;
    root.remove();
    root = undefined;
    sliders = [];
    releaseHost?.();
    releaseHost = undefined;
  };

  const box = (el: HTMLElement, x: number, y: number, w: number, h: number): void => {
    const s = el.style;
    s.left = `${x}px`;
    s.top = `${y}px`;
    s.width = `${w}px`;
    s.height = `${h}px`;
  };

  const sliderName = (d: SliderDom): string => {
    const { slider } = d;
    if (slider.name !== undefined && slider.name !== '') return slider.name;
    const prefix = (slider.currentvalue.prefix ?? '').replace(/[\s:=]+$/, '').trim();
    return prefix !== '' ? prefix : `Slider ${d.position + 1}`;
  };

  const build = (d: SliderDom): void => {
    const doc = d.el.ownerDocument;
    const hadFocus = doc.activeElement === d.grip;
    const { layout, slider } = d;
    d.el.replaceChildren();
    d.value = undefined;
    if (layout.currentValue) {
      const value = doc.createElement('div');
      value.className = 'hc-slider-value';
      value.setAttribute('aria-hidden', 'true');
      applyDomFont(value, slider.currentvalue.font);
      value.style.top = `${layout.currentValue.y}px`;
      const anchor = slider.currentvalue.xanchor;
      value.style.left = `${layout.currentValue.x}px`;
      value.style.transform =
        anchor === 'center' ? 'translateX(-50%)' : anchor === 'right' ? 'translateX(-100%)' : '';
      d.el.appendChild(value);
      d.value = value;
    }
    const track = doc.createElement('div');
    track.className = 'hc-slider-track';
    const trackTop = layout.grip.y;
    box(
      track,
      layout.inputStart,
      trackTop,
      layout.inputLength,
      layout.labelTop + layout.labelHeight - trackTop,
    );
    const rail = doc.createElement('div');
    rail.className = 'hc-slider-rail';
    box(
      rail,
      layout.rail.x - layout.inputStart,
      layout.rail.y - trackTop,
      layout.rail.width,
      layout.rail.height,
    );
    rail.style.borderRadius = `${layout.rail.height / 2}px`;
    track.appendChild(rail);
    const labels = doc.createElement('div');
    labels.setAttribute('aria-hidden', 'true');
    for (const tick of layout.ticks) {
      const t = doc.createElement('div');
      t.className = 'hc-slider-tick';
      box(
        t,
        tick.x - layout.inputStart - slider.tickwidth / 2,
        layout.tickTop - trackTop,
        slider.tickwidth,
        tick.length,
      );
      track.appendChild(t);
      if (tick.label !== undefined) {
        const label = doc.createElement('div');
        label.className = 'hc-slider-label';
        label.textContent = tick.label;
        label.style.left = `${tick.x - layout.inputStart}px`;
        label.style.top = `${layout.labelTop - trackTop}px`;
        labels.appendChild(label);
      }
    }
    track.appendChild(labels);
    const grip = doc.createElement('div');
    grip.className = 'hc-slider-grip';
    grip.tabIndex = 0;
    grip.setAttribute('role', 'slider');
    grip.setAttribute('aria-orientation', 'horizontal');
    grip.setAttribute('aria-valuemin', '0');
    grip.setAttribute('aria-valuemax', String(Math.max(0, layout.steps.length - 1)));
    grip.setAttribute('aria-label', sliderName(d));
    grip.style.top = `${layout.grip.y - trackTop}px`;
    grip.style.width = `${layout.grip.width}px`;
    grip.style.height = `${layout.grip.height}px`;
    track.appendChild(grip);
    d.el.appendChild(track);
    d.track = track;
    d.grip = grip;
    if (hadFocus) grip.focus({ preventScroll: true });
  };

  /** Handle position, current value and ARIA values for the active step. */
  const refresh = (d: SliderDom, glide: boolean): void => {
    const { layout, slider, grip } = d;
    const k = Math.max(0, layout.steps.indexOf(slider.active));
    const x =
      (layout.positions[k] ?? layout.inputStart) - layout.inputStart - layout.grip.width / 2;
    const duration = slider.transition.duration;
    const animate = glide && duration > 0 && !reducedMotion(grip.ownerDocument);
    grip.style.transition = animate
      ? `left ${duration}ms ${cssEasing(slider.transition.easing)}`
      : 'none';
    grip.style.left = `${x}px`;
    const step = slider.steps[slider.active];
    const text = currentValueText(slider, step);
    if (d.value && d.value.textContent !== text) d.value.textContent = text;
    grip.setAttribute('aria-valuenow', String(k));
    grip.setAttribute('aria-valuetext', step ? text : '');
  };

  const style = (d: SliderDom): void => {
    const { slider } = d;
    const s = d.el.style;
    applyDomFont(d.el, slider.font);
    s.setProperty('--hc-slider-bg', slider.bgcolor);
    s.setProperty('--hc-slider-activebg', slider.activebgcolor);
    s.setProperty('--hc-slider-border', slider.bordercolor);
    s.setProperty('--hc-slider-bw', `${slider.borderwidth}px`);
    s.setProperty('--hc-slider-tick', slider.tickcolor);
    s.setProperty('--hc-slider-focus', slider.font.color);
  };

  const sliderKey = (d: SliderDom): string =>
    JSON.stringify([
      d.layout,
      d.slider.name ?? '',
      d.slider.currentvalue.prefix ?? '',
      d.slider.currentvalue.xanchor,
      d.slider.currentvalue.font,
      d.slider.tickwidth,
    ]);

  const sync = (c: Ctx): void => {
    if (disposed) return;
    last = c;
    chart ??= options.locate?.(c);
    if (!chart) return;
    const all = c.fullLayout['sliders'];
    const list = Array.isArray(all) ? (all as FullSlider[]) : [];
    const shown = list
      .map((slider, position) => ({ slider, position }))
      .filter(({ slider }) => slider.visible && slider.steps.filter((s) => s.visible).length >= 2);
    if (shown.length === 0) {
      unmount();
      trackBindings(list, c, new Map());
      return;
    }
    root ??= mount(chart.element, chart);
    const doc = root.ownerDocument;
    const next: SliderDom[] = [];
    for (const { slider, position } of shown) {
      const layout = layoutSlider(slider, measure, c.plotArea.width);
      let d = sliders.find((x) => x.position === position);
      if (!d) {
        const el = doc.createElement('div');
        el.className = 'hc-slider';
        d = {
          position,
          el,
          key: '',
          slider,
          layout,
          track: doc.createElement('div'),
          grip: doc.createElement('div'),
          dragging: false,
        };
      }
      if (d.pendingActive !== undefined) {
        if (slider._index < 0) slider.active = d.pendingActive;
        else d.pendingActive = undefined;
      }
      d.slider = slider;
      d.layout = layout;
      if (d.el.parentNode !== root) root.appendChild(d.el);
      next.push(d);
    }
    for (const d of sliders) {
      if (!next.includes(d)) {
        d.cancelNext?.();
        d.el.remove();
      }
    }
    sliders = next;
    for (const d of sliders) {
      style(d);
      const key = sliderKey(d);
      if (key !== d.key) {
        build(d);
        d.key = key;
      }
      const pos = placeSlider(d.slider, d.layout, { width: c.width, height: c.height }, c.plotArea);
      d.el.style.left = `${pos.left}px`;
      d.el.style.top = `${pos.top}px`;
      d.el.style.width = `${d.layout.width}px`;
      d.el.style.height = `${d.layout.height}px`;
      refresh(d, false);
    }
    trackBindings(list, c, new Map(sliders.map((d) => [d.position, d])));
  };

  /** Plotly's command observer: follow the figure when the steps share one simple binding. */
  const trackBindings = (
    list: readonly FullSlider[],
    c: Ctx,
    shown: ReadonlyMap<number, SliderDom>,
    frameName?: { value: unknown },
  ): void => {
    list.forEach((slider, position) => {
      const observer = observerFor(position);
      observer.setCommands(
        slider.steps.map((s) => (s.visible ? s : undefined)),
        c.fullData.length,
      );
      if (frameName && observer.binding?.binding.prop !== '_currentFrame') return;
      const index = observer.check(c.fullData, c.fullLayout, frameName);
      if (index === undefined || index === slider.active) return;
      const d = shown.get(position);
      if (d?.dragging) return;
      if (d) setActive(d, index, false, true);
      else {
        slider.active = index;
        storeActive(slider, index);
      }
    });
    for (const key of [...observers.keys()]) if (key >= list.length) observers.delete(key);
  };

  const view: SlidersView<Ctx> = {
    update: (c) => sync(c),
    dispose() {
      unmount();
      disposed = true;
    },
    get root() {
      return root;
    },
    frame(name) {
      if (disposed || name === undefined || name === null) return;
      const all = last.fullLayout['sliders'];
      const list = Array.isArray(all) ? (all as FullSlider[]) : [];
      trackBindings(list, last, new Map(sliders.map((d) => [d.position, d])), {
        value: String(name),
      });
    },
  };

  sync(ctx);
  return view;
}
