/**
 * Pointer interaction for 2D charts (plan E6.1–E6.4, E6.6): hover, click and double-click, box
 * zoom, pan, axis drags, scroll and pinch zoom, and box / lasso selection, all emitting the chart
 * events of plan §7.5.
 *
 * ## Dispatch order
 *
 * Every pointer event is first offered to component views (`ComponentView.handlePointer`, topmost
 * first). If one handles it — a legend item, say — the chart's own handling is skipped for that
 * event (and, for a handled `down`, for the whole gesture). Otherwise:
 *
 * - **move** (no button): hover. Moves only record the position; the work runs once per animation
 *   frame at the latest position, so a slow frame never builds a backlog and the last position
 *   always resolves (E2.17). Unchanged results emit nothing and touch no DOM.
 * - **down → move → up** in a subplot: the gesture `dragmode` asks for (zoom box, pan, select,
 *   lasso); on the axis strips beside a subplot, axis-end drags scale one end and axis-middle drags
 *   pan that axis. Range changes during a drag are previews (transform-only updates, `relayouting`
 *   once per frame); the gesture's end commits them with one `relayout`.
 * - **down → up** without moving: `click` (and `doubleclick` within `config.doubleClickDelay`).
 * - **wheel** with `config.scrollZoom`: zoom at the cursor, committed after the wheel rests.
 * - **two touch pointers**: pinch zoom and pan.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type { FrameScheduler } from '@mk7s/holochart-render';
import type { AxisInfo, ComponentPointerEvent, SelectionQuery, SubplotInfo } from '../contracts.ts';
import type { ChartEmitter, ChartPoint } from '../events.ts';
import type { AttributeUpdate } from '../plan.ts';
import {
  CLICK_TOLERANCE,
  dragZoneAt,
  limitRange,
  panBy,
  selectBoxAxes,
  zoomAround,
  zoomBox,
  type DragZone,
  type LinearRange,
} from './geometry.ts';
import {
  anchorOf,
  axisLabel,
  buildPoint,
  HoverFinder,
  labelStyle,
  labelText,
  pointColor,
  type Found,
  type HoverEntry,
  type LabelSpec,
} from './hover.ts';
import type { HoverLayer } from './labels.ts';
import type { FxSettings, Hovermode } from './settings.ts';

/** What the interaction layer needs from its chart. */
export interface InteractionHost {
  /** The element pointer events are read from (the chart's canvas). */
  readonly target: HTMLElement;
  readonly layer: HoverLayer;
  readonly scheduler: FrameScheduler;
  readonly events: ChartEmitter;
  /** Interaction settings; read once per pipeline run (see {@link Interaction.refresh}). */
  settings(): FxSettings;
  size(): { readonly width: number; readonly height: number };
  /** Cartesian subplots in draw order (the same array until the layout changes). */
  subplots(): readonly SubplotInfo[];
  /** Hoverable / selectable traces of a subplot, in trace order. */
  entries(subplot: SubplotInfo): readonly HoverEntry[];
  fullLayout(): FullLayout | undefined;
  /** Number of traces in the figure (names show in labels only with several). */
  traceCount(): number;
  /** `fixedrange` of an axis (core axis schema). */
  isFixed(axis: AxisInfo): boolean;
  /** `minallowed` / `maxallowed` in linear coordinates. */
  limits(axis: AxisInfo): readonly [number | undefined, number | undefined];
  /** Offer a pointer event to component views; returns the view that handled it. */
  dispatch(event: ComponentPointerEvent, only?: unknown): unknown;
  /** Show ranges without a pipeline run (transform-only), keyed by axis id. */
  preview(ranges: ReadonlyMap<string, LinearRange>): void;
  /** Commit ranges with a (GUI) relayout. */
  commit(ranges: ReadonlyMap<string, LinearRange>): void;
  /** `config.doubleClick` on the plot area. */
  resetView(action: FxSettings['doubleClick']): void;
  /** Current selection of a trace (`selectedpoints`), `null` when none. */
  selection(index: number): readonly number[] | null;
  /** Set the selection of the given traces (others unchanged). */
  select(selection: ReadonlyMap<number, readonly number[]>): void;
  /** Clear every selection; returns whether there was one. */
  clearSelection(): boolean;
  /** `config.renderHover(points)`: a custom label element, if configured. */
  renderHover?(points: readonly ChartPoint[]): HTMLElement | null | undefined;
}

type Action = 'none' | 'zoom' | 'pan' | 'select' | 'lasso' | 'axis-pan' | 'axis-end';

interface Drag {
  action: Action;
  subplot: SubplotInfo | undefined;
  zone: DragZone | undefined;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  moved: boolean;
  shift: boolean;
  /** Linear ranges of the subplot's axes at the start. */
  rx: LinearRange;
  ry: LinearRange;
  /** Lasso outline, flat container px. */
  lasso: number[];
  /** Ranges last previewed (pan / axis drags). */
  last: Map<string, LinearRange>;
  /** The component view that owns this gesture. */
  component: unknown;
}

interface Pinch {
  subplot: SubplotInfo;
  d0: number;
  mx0: number;
  my0: number;
  rx: LinearRange;
  ry: LinearRange;
  last: Map<string, LinearRange>;
}

const WHEEL_COMMIT_MS = 300;

function range(axis: AxisInfo): LinearRange {
  const r = axis.scale.range;
  return [r[0], r[1]];
}

/** px per linear unit along an axis for a range. */
function pxPerUnit(axis: AxisInfo, r: readonly [number, number]): number {
  const span = r[1] - r[0];
  return span === 0 ? 1 : axis.scale.length / span;
}

/**
 * The interaction controller of one chart. Created by the chart when it is interactive
 * (`config.staticPlot` false) and destroyed with it.
 */
export class Interaction {
  readonly #host: InteractionHost;
  readonly #finder = new HoverFinder();
  readonly #clickFinder = new HoverFinder();
  readonly #cev: ComponentPointerEvent = {
    type: 'move',
    x: 0,
    y: 0,
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    native: undefined,
    cursor: undefined,
  };
  // Latest pointer position (container px) and the event behind it.
  #px = 0;
  #py = 0;
  #pointerInside = false;
  #lastEvent: Event | undefined;
  #frame = 0;
  #hoverPending = false;
  #hoverForce = false;
  #dragPending = false;
  #programmatic = false;
  #drag: Drag | null = null;
  #pinch: Pinch | null = null;
  readonly #touches = new Map<number, { x: number; y: number }>();
  #lastClick = { time: -Infinity, x: 0, y: 0 };
  #wheel: Map<string, LinearRange> | null = null;
  #wheelTimer: ReturnType<typeof setTimeout> | undefined;
  #cursor = '';
  #destroyed = false;
  #settings: FxSettings;
  // Result of #zoneAt (fields, not an object: it runs on every pointer move).
  #hitSubplot: SubplotInfo | undefined;
  #hitZone: DragZone | undefined;
  readonly #entriesFor = (sp: SubplotInfo): readonly HoverEntry[] => this.#host.entries(sp);

  constructor(host: InteractionHost) {
    this.#host = host;
    this.#settings = host.settings();
    const t = host.target;
    t.addEventListener('pointerdown', this.#onDown);
    t.addEventListener('pointermove', this.#onMove);
    t.addEventListener('pointerup', this.#onUp);
    t.addEventListener('pointercancel', this.#onCancel);
    t.addEventListener('pointerleave', this.#onLeave);
    t.addEventListener('wheel', this.#onWheel, { passive: false });
    this.refresh();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const t = this.#host.target;
    t.removeEventListener('pointerdown', this.#onDown);
    t.removeEventListener('pointermove', this.#onMove);
    t.removeEventListener('pointerup', this.#onUp);
    t.removeEventListener('pointercancel', this.#onCancel);
    t.removeEventListener('pointerleave', this.#onLeave);
    t.removeEventListener('wheel', this.#onWheel);
    if (this.#frame) this.#host.scheduler.cancel(this.#frame);
    if (this.#wheelTimer !== undefined) clearTimeout(this.#wheelTimer);
  }

  /**
   * After a pipeline run: settings may have changed and hovered points may have moved. Labels
   * are redrawn at the latest pointer position; programmatic hover is dropped.
   */
  refresh(): void {
    const s = (this.#settings = this.#host.settings());
    // Page scrolling on touch keeps working when dragging does nothing (E6.6).
    this.#host.target.style.touchAction = s.dragmode === false ? 'auto' : 'none';
    if (this.#programmatic) {
      this.#programmatic = false;
      this.#finder.reset();
      this.#host.layer.hideLabels();
    }
    if (this.#pointerInside && !this.#drag) {
      this.#hoverForce = true;
      this.#request('hover');
    }
  }

  // ---- coordinates & scheduling -----------------------------------------------------------------

  #local(e: MouseEvent): void {
    const r = this.#host.target.getBoundingClientRect();
    this.#px = e.clientX - r.left;
    this.#py = e.clientY - r.top;
  }

  #request(kind: 'hover' | 'drag'): void {
    if (kind === 'hover') this.#hoverPending = true;
    else this.#dragPending = true;
    if (!this.#frame) this.#frame = this.#host.scheduler.request(this.#onFrame);
  }

  readonly #onFrame = (): void => {
    this.#frame = 0;
    if (this.#destroyed) return;
    if (this.#dragPending) {
      this.#dragPending = false;
      this.#dragFrame();
    }
    if (this.#hoverPending) {
      this.#hoverPending = false;
      const force = this.#hoverForce;
      this.#hoverForce = false;
      if (this.#pointerInside && !this.#drag && !this.#pinch)
        this.#hoverAt(this.#px, this.#py, force);
    }
  };

  #component(
    type: ComponentPointerEvent['type'],
    e: MouseEvent | undefined,
    only?: unknown,
  ): unknown {
    const ev = this.#cev;
    ev.type = type;
    ev.x = this.#px;
    ev.y = this.#py;
    ev.button = e?.button ?? 0;
    ev.shiftKey = e?.shiftKey ?? false;
    ev.altKey = e?.altKey ?? false;
    ev.ctrlKey = e?.ctrlKey ?? false;
    ev.metaKey = e?.metaKey ?? false;
    ev.native = type === 'click' || type === 'dblclick' ? undefined : e;
    ev.cursor = undefined;
    return this.#host.dispatch(ev, only);
  }

  #setCursor(cursor: string): void {
    if (cursor === this.#cursor) return;
    this.#cursor = cursor;
    this.#host.target.style.cursor = cursor;
  }

  /**
   * The subplot and drag zone under a container position (plot areas win over axis strips), into
   * `#hitSubplot` / `#hitZone` (fields, not a result object: this runs on every pointer move).
   * Returns whether anything was hit.
   */
  #zoneAt(x: number, y: number): boolean {
    this.#hitSubplot = undefined;
    this.#hitZone = undefined;
    const subplots = this.#host.subplots();
    for (let i = 0; i < subplots.length; i++) {
      const sp = subplots[i] as SubplotInfo;
      const zone = dragZoneAt(sp.rect, x, y);
      if (zone === 'plot') {
        this.#hitSubplot = sp;
        this.#hitZone = zone;
        return true;
      }
      if (zone && !this.#hitZone) {
        this.#hitSubplot = sp;
        this.#hitZone = zone;
      }
    }
    return this.#hitZone !== undefined;
  }

  #cursorFor(zone: DragZone | undefined, s: FxSettings): string {
    if (!zone || s.dragmode === false) return '';
    if (zone === 'plot') {
      if (s.dragmode === 'pan') return 'move';
      return s.dragmode === 'zoom' || s.dragmode === 'select' || s.dragmode === 'lasso'
        ? 'crosshair'
        : '';
    }
    if (zone.endsWith('middle')) return 'move';
    return zone.startsWith('x') ? 'ew-resize' : 'ns-resize';
  }

  // ---- pointer handlers ----------------------------------------------------------------------------

  readonly #onDown = (e: PointerEvent): void => {
    this.#local(e);
    this.#pointerInside = true;
    const pointerId = e.pointerId ?? 1;
    if (e.pointerType === 'touch') {
      this.#touches.set(pointerId, { x: this.#px, y: this.#py });
      if (this.#touches.size === 2) {
        this.#startPinch();
        return;
      }
    }
    if (this.#drag || (e.button ?? 0) !== 0) return;
    const drag: Drag = {
      action: 'none',
      subplot: undefined,
      zone: undefined,
      pointerId,
      x0: this.#px,
      y0: this.#py,
      x: this.#px,
      y: this.#py,
      moved: false,
      shift: e.shiftKey,
      rx: [0, 1],
      ry: [0, 1],
      lasso: [],
      last: new Map(),
      component: undefined,
    };
    const handled = this.#component('down', e);
    if (handled) {
      drag.component = handled;
      this.#drag = drag;
      // Capture here too, or a component drag released outside the chart never gets its `up`.
      this.#capture(pointerId);
      return;
    }
    const s = this.#settings;
    if (this.#zoneAt(this.#px, this.#py)) {
      const sp = this.#hitSubplot as SubplotInfo;
      const zone = this.#hitZone as DragZone;
      drag.subplot = sp;
      drag.zone = zone;
      drag.rx = range(sp.xaxis);
      drag.ry = range(sp.yaxis);
      drag.action = this.#actionFor(zone, sp, s);
      if (drag.action === 'lasso') drag.lasso.push(this.#px, this.#py);
    }
    this.#drag = drag;
    this.#capture(pointerId);
  };

  #capture(pointerId: number): void {
    try {
      this.#host.target.setPointerCapture?.(pointerId);
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
  }

  #actionFor(zone: DragZone, sp: SubplotInfo, s: FxSettings): Action {
    if (s.dragmode === false || s.dragmode === 'orbit' || s.dragmode === 'turntable') return 'none';
    if (zone === 'plot') {
      if (s.dragmode === 'pan') {
        return this.#host.isFixed(sp.xaxis) && this.#host.isFixed(sp.yaxis) ? 'none' : 'pan';
      }
      return s.dragmode;
    }
    const axis = zone.startsWith('x') ? sp.xaxis : sp.yaxis;
    if (this.#host.isFixed(axis)) return 'none';
    return zone.endsWith('middle') ? 'axis-pan' : 'axis-end';
  }

  readonly #onMove = (e: PointerEvent): void => {
    this.#local(e);
    this.#pointerInside = true;
    this.#lastEvent = e;
    const pointerId = e.pointerId ?? 1;
    if (e.pointerType === 'touch' && this.#touches.has(pointerId)) {
      const t = this.#touches.get(pointerId) as { x: number; y: number };
      t.x = this.#px;
      t.y = this.#py;
      if (this.#pinch) {
        this.#request('drag');
        return;
      }
    }
    const drag = this.#drag;
    if (drag) {
      if (drag.pointerId !== pointerId) return;
      drag.x = this.#px;
      drag.y = this.#py;
      if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > CLICK_TOLERANCE) {
        drag.moved = true;
        if (!drag.component) this.#unhover(e);
      }
      if (drag.component) {
        this.#component('move', e, drag.component);
        return;
      }
      if (drag.action === 'lasso' && drag.moved) {
        const n = drag.lasso.length;
        const lx = drag.lasso[n - 2] as number;
        const ly = drag.lasso[n - 1] as number;
        if (Math.abs(lx - drag.x) + Math.abs(ly - drag.y) >= 2) drag.lasso.push(drag.x, drag.y);
      }
      if (drag.moved) this.#request('drag');
      return;
    }
    // Plain move: components first, then hover.
    if (this.#component('move', e)) {
      this.#setCursor(this.#cev.cursor ?? '');
      if (this.#finder.count > 0) this.#unhover(e);
      return;
    }
    this.#zoneAt(this.#px, this.#py);
    this.#setCursor(this.#cursorFor(this.#hitZone, this.#settings));
    this.#request('hover');
  };

  readonly #onUp = (e: PointerEvent): void => {
    this.#local(e);
    const pointerId = e.pointerId ?? 1;
    if (e.pointerType === 'touch') {
      this.#touches.delete(pointerId);
      if (this.#pinch) {
        this.#endPinch();
        return;
      }
    }
    const drag = this.#drag;
    if (!drag || drag.pointerId !== pointerId) return;
    if (drag.moved) {
      drag.x = this.#px;
      drag.y = this.#py;
    }
    try {
      if (this.#host.target.hasPointerCapture?.(pointerId)) {
        this.#host.target.releasePointerCapture(pointerId);
      }
    } catch {
      // See #capture.
    }
    if (drag.component) {
      this.#drag = null;
      this.#component('up', e, drag.component);
      if (!drag.moved) this.#componentClick(e, drag.component);
      return;
    }
    if (!drag.moved) {
      this.#drag = null;
      this.#click(e, drag);
      return;
    }
    this.#dragPending = false;
    try {
      this.#finishDrag(drag, e);
    } finally {
      this.#drag = null;
      this.#host.layer.hideOverlay();
    }
    this.#request('hover');
  };

  readonly #onCancel = (e: PointerEvent): void => {
    this.#touches.delete(e.pointerId ?? 1);
    this.#pinch = null;
    const drag = this.#drag;
    this.#drag = null;
    if (!drag) return;
    if (drag.component) {
      // The gesture's view must hear that it ended (`leave`: no `up` or click follows).
      this.#component('leave', e, drag.component);
      return;
    }
    this.#host.layer.hideOverlay();
    // Undo previews: back to the ranges the gesture started from.
    if (drag.last.size > 0 && drag.subplot) {
      const back = new Map<string, LinearRange>([
        [drag.subplot.xaxis.id, drag.rx],
        [drag.subplot.yaxis.id, drag.ry],
      ]);
      this.#host.preview(back);
    }
  };

  readonly #onLeave = (e: PointerEvent): void => {
    if (this.#drag) return;
    this.#pointerInside = false;
    this.#hoverPending = false;
    this.#component('leave', e);
    this.#setCursor('');
    this.#unhover(e);
  };

  #componentClick(e: MouseEvent, view: unknown): void {
    const now = e.timeStamp || performance.now();
    const s = this.#settings;
    const last = this.#lastClick;
    const double =
      now - last.time < s.doubleClickDelay &&
      Math.abs(this.#px - last.x) <= CLICK_TOLERANCE &&
      Math.abs(this.#py - last.y) <= CLICK_TOLERANCE;
    this.#component('click', e, view);
    if (double) {
      this.#component('dblclick', e, view);
      last.time = -Infinity;
    } else {
      last.time = now;
      last.x = this.#px;
      last.y = this.#py;
    }
  }

  // ---- hover -------------------------------------------------------------------------------------

  #hovermode(): Exclude<Hovermode, false> | undefined {
    const m = this.#settings.hovermode;
    return m === false ? undefined : m;
  }

  #hoverAt(x: number, y: number, force: boolean): void {
    const mode = this.#hovermode();
    const host = this.#host;
    if (!mode) {
      if (this.#finder.count > 0) this.#unhover(this.#lastEvent);
      return;
    }
    const s = this.#settings;
    const changed = this.#finder.find(
      host.subplots(),
      this.#entriesFor,
      x,
      y,
      mode,
      s.hoverdistance,
    );
    this.#programmatic = false;
    if (!changed && !force) return;
    this.#afterFind(changed, mode, this.#lastEvent, x, y);
  }

  /** Emit hover / unhover for a new result and draw its labels. */
  #afterFind(
    changed: boolean,
    mode: Exclude<Hovermode, false>,
    event: Event | undefined,
    x: number,
    y: number,
  ): void {
    const finder = this.#finder;
    const host = this.#host;
    if (finder.count === 0) {
      host.layer.hideLabels();
      if (changed) host.events.emit('unhover', { points: [], ...(event ? { event } : {}) });
      return;
    }
    const points: ChartPoint[] = [];
    for (let i = 0; i < finder.count; i++) {
      const f = finder.found[i] as Found;
      points.push(buildPoint(f.entry, f.point, true));
    }
    this.#drawLabels(points, mode, x, y);
    if (!changed) return;
    const sp = finder.subplot;
    const r = sp?.rect;
    const xvals = sp && r ? [sp.xaxis.scale.p2d(x - r.x)] : [];
    const yvals = sp && r ? [sp.yaxis.scale.p2d(r.y + r.height - y)] : [];
    host.events.emit('hover', { points, ...(event ? { event } : {}), xvals, yvals });
  }

  #drawLabels(
    points: readonly ChartPoint[],
    mode: Exclude<Hovermode, false>,
    x: number,
    y: number,
  ): void {
    const host = this.#host;
    const finder = this.#finder;
    const fullLayout = host.fullLayout();
    if (!fullLayout) return;
    const size = host.size();
    const custom = host.renderHover?.(points);
    const first = finder.found[0] as Found;
    if (custom) {
      const a = anchorOf(first.entry, first.point);
      host.layer.showCustom(custom, a.x, a.y, size.width);
      return;
    }
    const unified = mode === 'x unified' || mode === 'y unified';
    const showName = host.traceCount() > 1;
    const specs: LabelSpec[] = [];
    for (let i = 0; i < finder.count; i++) {
      const f = finder.found[i] as Found;
      const color = pointColor(f.entry, f.point, fullLayout);
      const { text, extra } = labelText(f.entry, f.point, mode, showName, fullLayout);
      const a = anchorOf(f.entry, f.point);
      specs.push({
        text,
        extra,
        color,
        style: labelStyle(f.entry, f.point.pointIndex, color, fullLayout, unified),
        ax: a.x,
        ay: a.y,
        traceIndex: f.entry.index,
      });
    }
    const winner = this.#winner();
    const sp = winner.entry.subplot;
    const letter = mode.startsWith('y') ? 'y' : 'x';
    const axis = letter === 'x' ? sp.xaxis : sp.yaxis;
    const value = letter === 'x' ? points[winner.k]?.x : points[winner.k]?.y;
    if (unified) {
      specs.sort((a, b) => a.traceIndex - b.traceIndex);
      host.layer.showUnified(specs, {
        width: size.width,
        height: size.height,
        plot: sp.rect,
        title: axisLabel(axis, value),
        titleStyle: labelStyle(winner.entry, winner.point.pointIndex, '#fff', fullLayout, true),
        x,
        y,
      });
      return;
    }
    const a = anchorOf(winner.entry, winner.point);
    host.layer.showLabels(specs, {
      width: size.width,
      height: size.height,
      plot: sp.rect,
      ...(mode === 'closest'
        ? {}
        : {
            common: { axis: letter, text: axisLabel(axis, value), at: letter === 'x' ? a.x : a.y },
          }),
    });
  }

  /** The closest of the found points (smallest distance; later traces win ties). */
  #winner(): Found & { k: number } {
    const finder = this.#finder;
    let k = 0;
    for (let i = 1; i < finder.count; i++) {
      if ((finder.found[i] as Found).point.distance <= (finder.found[k] as Found).point.distance)
        k = i;
    }
    const f = finder.found[k] as Found;
    return { entry: f.entry, point: f.point, k };
  }

  #unhover(event: Event | undefined): void {
    const had = this.#finder.count > 0;
    this.#finder.reset();
    this.#host.layer.hideLabels();
    if (had) this.#host.events.emit('unhover', { points: [], ...(event ? { event } : {}) });
  }

  /**
   * Programmatic hover (plan E6.1 `Fx.hover`): points by trace and index, or a position in data
   * units on a subplot (default `xy`), resolved with the current `hovermode`.
   */
  hover(
    target:
      | readonly { readonly curveNumber: number; readonly pointNumber: number }[]
      | { readonly xval?: unknown; readonly yval?: unknown; readonly subplot?: string },
  ): void {
    const host = this.#host;
    const mode = this.#hovermode() ?? 'closest';
    if (!Array.isArray(target)) {
      const t = target as { xval?: unknown; yval?: unknown; subplot?: string };
      const all = host.subplots();
      const sp = all.find((p) => p.id === (t.subplot ?? 'xy')) ?? all[0];
      if (!sp) return;
      const r = sp.rect;
      const x = t.xval === undefined ? r.x + r.width / 2 : r.x + sp.xaxis.scale.d2p(t.xval);
      const y =
        t.yval === undefined ? r.y + r.height / 2 : r.y + r.height - sp.yaxis.scale.d2p(t.yval);
      const changed = this.#finder.find(host.subplots(), this.#entriesFor, x, y, mode, Infinity);
      this.#programmatic = true;
      this.#afterFind(changed, mode, undefined, x, y);
      return;
    }
    const found: Found[] = [];
    for (const { curveNumber, pointNumber } of target as readonly {
      curveNumber: number;
      pointNumber: number;
    }[]) {
      const entry = this.#entryFor(curveNumber);
      if (!entry) continue;
      found.push({ entry, point: this.#pointOf(entry, pointNumber) });
    }
    const changed = this.#finder.set(found);
    this.#programmatic = true;
    const first = found[0];
    const a = first ? anchorOf(first.entry, first.point) : { x: 0, y: 0 };
    this.#afterFind(changed, mode, undefined, a.x, a.y);
  }

  /** Hide hover labels and emit `unhover` if something was hovered. */
  unhover(): void {
    this.#unhover(undefined);
  }

  #entryFor(index: number): HoverEntry | undefined {
    for (const sp of this.#host.subplots()) {
      for (const e of this.#host.entries(sp)) if (e.index === index) return e;
    }
    return undefined;
  }

  /** The hover point of data index `i`: asked from the trace at its position, else synthesized. */
  #pointOf(entry: HoverEntry, i: number): Found['point'] {
    const x = (entry.trace['x'] as ArrayLike<unknown> | undefined)?.[i];
    const y = (entry.trace['y'] as ArrayLike<unknown> | undefined)?.[i];
    const sx = entry.ctx.xaxis?.scale;
    const sy = entry.ctx.yaxis?.scale;
    const px = sx ? sx.d2p(x) : 0;
    const py = sy ? sy.d2p(y) : 0;
    const pts = entry.module.hoverPoints?.(
      entry.calc,
      entry.trace,
      { px, py, xl: sx?.d2l(x) ?? 0, yl: sy?.d2l(y) ?? 0, mode: 'closest', distance: 1 },
      entry.ctx,
    );
    const hit = pts?.find((p) => p.pointIndex === i);
    return hit ?? { pointIndex: i, distance: 0, px, py, x, y };
  }

  // ---- click ---------------------------------------------------------------------------------------

  #click(e: PointerEvent, drag: Drag): void {
    const host = this.#host;
    const s = this.#settings;
    const now = e.timeStamp || performance.now();
    const last = this.#lastClick;
    const double =
      now - last.time < s.doubleClickDelay &&
      Math.abs(this.#px - last.x) <= CLICK_TOLERANCE &&
      Math.abs(this.#py - last.y) <= CLICK_TOLERANCE;
    const clickHandled = this.#component('click', e);
    if (!clickHandled) this.#emitClick(e, drag, s);
    if (double) {
      last.time = -Infinity;
      if (this.#component('dblclick', e)) return;
      if (drag.zone === undefined) return;
      if ((s.dragmode === 'select' || s.dragmode === 'lasso') && host.clearSelection()) {
        host.events.emit('deselect', undefined);
      } else if (s.doubleClick !== false) {
        host.resetView(s.doubleClick);
      }
      host.events.emit('doubleclick', undefined);
      return;
    }
    last.time = now;
    last.x = this.#px;
    last.y = this.#py;
    // Tap to hover on touch screens (E6.6).
    if (e.pointerType === 'touch') this.#hoverAt(this.#px, this.#py, true);
  }

  #emitClick(e: PointerEvent, drag: Drag, s: FxSettings): void {
    const host = this.#host;
    const mode = this.#hovermode();
    if (!mode || (!s.clickEvent && !s.clickSelect)) return;
    const finder = this.#clickFinder;
    finder.reset();
    finder.find(host.subplots(), this.#entriesFor, this.#px, this.#py, mode, s.hoverdistance);
    const points: ChartPoint[] = [];
    for (let i = 0; i < finder.count; i++) {
      const f = finder.found[i] as Found;
      points.push(buildPoint(f.entry, f.point, true));
    }
    if (s.clickEvent && points.length > 0) host.events.emit('click', { points, event: e });
    if (!s.clickSelect) return;
    if (points.length === 0) {
      if (drag.zone === 'plot' && host.clearSelection()) host.events.emit('deselect', undefined);
      return;
    }
    // Click-select: the clicked points; shift toggles them in the current selection.
    const next = new Map<number, number[]>();
    const sp = finder.subplot;
    if (sp)
      for (const entry of host.entries(sp))
        if (entry.module.selectPoints) next.set(entry.index, []);
    for (let i = 0; i < finder.count; i++) {
      const f = finder.found[i] as Found;
      const list = next.get(f.entry.index) ?? [];
      list.push(f.point.pointIndex);
      next.set(f.entry.index, list);
    }
    if (drag.shift) {
      for (const [index, list] of next) {
        const prev = host.selection(index) ?? [];
        const set = new Set(prev);
        for (const p of list) {
          if (set.has(p)) set.delete(p);
          else set.add(p);
        }
        next.set(
          index,
          [...set].sort((a, b) => a - b),
        );
      }
    }
    host.select(next);
    host.events.emit('selected', { points: this.#selectionPoints(next), event: e });
  }

  // ---- drag ----------------------------------------------------------------------------------------

  #dragFrame(): void {
    if (this.#pinch) {
      this.#pinchFrame();
      return;
    }
    const drag = this.#drag;
    if (!drag || !drag.moved || !drag.subplot) return;
    const sp = drag.subplot;
    const host = this.#host;
    switch (drag.action) {
      case 'zoom': {
        const box = zoomBox(
          sp.rect,
          drag.x0,
          drag.y0,
          drag.x,
          drag.y,
          host.isFixed(sp.xaxis),
          host.isFixed(sp.yaxis),
        );
        if (box) host.layer.showBox(box.x0, box.y0, box.x1, box.y1);
        else host.layer.hideOverlay();
        return;
      }
      case 'pan':
      case 'axis-pan': {
        const ranges = drag.last;
        ranges.clear();
        const zone = drag.zone as DragZone;
        const doX = drag.action === 'pan' ? !host.isFixed(sp.xaxis) : zone.startsWith('x');
        const doY = drag.action === 'pan' ? !host.isFixed(sp.yaxis) : zone.startsWith('y');
        if (doX) {
          const [lo, hi] = host.limits(sp.xaxis);
          const dl = -(drag.x - drag.x0) / pxPerUnit(sp.xaxis, drag.rx);
          ranges.set(sp.xaxis.id, limitRange(panBy(drag.rx, dl), lo, hi, true));
        }
        if (doY) {
          const [lo, hi] = host.limits(sp.yaxis);
          const dl = (drag.y - drag.y0) / pxPerUnit(sp.yaxis, drag.ry);
          ranges.set(sp.yaxis.id, limitRange(panBy(drag.ry, dl), lo, hi, true));
        }
        this.#preview(ranges);
        return;
      }
      case 'axis-end': {
        const zone = drag.zone as DragZone;
        const isX = zone.startsWith('x');
        const axis = isX ? sp.xaxis : sp.yaxis;
        const r0 = isX ? drag.rx : drag.ry;
        const len = axis.scale.length;
        const r = sp.rect;
        // Pointer position along the axis, px from range[0]'s end.
        const p0 = isX ? drag.x0 - r.x : r.y + r.height - drag.y0;
        const p1 = isX ? drag.x - r.x : r.y + r.height - drag.y;
        const lStart = r0[0] + (p0 / len) * (r0[1] - r0[0]);
        let next: LinearRange;
        if (zone.endsWith('end')) {
          // Keep range[0]; the grabbed value follows the pointer.
          const p = Math.max(p1, 5);
          next = [r0[0], r0[0] + ((lStart - r0[0]) * len) / p];
        } else {
          const p = Math.max(len - p1, 5);
          next = [r0[1] - ((r0[1] - lStart) * len) / p, r0[1]];
        }
        const [lo, hi] = host.limits(axis);
        drag.last.clear();
        drag.last.set(axis.id, limitRange(next, lo, hi, false));
        this.#preview(drag.last);
        return;
      }
      case 'select':
      case 'lasso': {
        const query = this.#selectionQuery(drag);
        if (!query) return;
        const selection = this.#computeSelection(sp, query);
        host.events.emit('selecting', {
          points: this.#selectionPoints(selection),
          ...this.#selectionShape(drag, query),
        });
        return;
      }
      default:
    }
  }

  #preview(ranges: ReadonlyMap<string, LinearRange>): void {
    if (ranges.size === 0) return;
    this.#host.preview(ranges);
    this.#host.events.emit('relayouting', this.#rangeUpdate(ranges));
  }

  /** `relayout`-style edits for ranges: `{ 'xaxis.range[0]': …, 'xaxis.range[1]': … }`. */
  #rangeUpdate(ranges: ReadonlyMap<string, LinearRange>): AttributeUpdate {
    const out: Record<string, unknown> = {};
    for (const [id, r] of ranges) {
      const axis = this.#axis(id);
      if (!axis) continue;
      out[`${axis.name}.range[0]`] = axis.scale.l2r(r[0]);
      out[`${axis.name}.range[1]`] = axis.scale.l2r(r[1]);
    }
    return out;
  }

  #axis(id: string): AxisInfo | undefined {
    for (const sp of this.#host.subplots()) {
      if (sp.xaxis.id === id) return sp.xaxis;
      if (sp.yaxis.id === id) return sp.yaxis;
    }
    return undefined;
  }

  #finishDrag(drag: Drag, e: PointerEvent): void {
    const host = this.#host;
    const sp = drag.subplot;
    if (!sp) return;
    switch (drag.action) {
      case 'zoom': {
        const box = zoomBox(
          sp.rect,
          drag.x0,
          drag.y0,
          drag.x,
          drag.y,
          host.isFixed(sp.xaxis),
          host.isFixed(sp.yaxis),
        );
        if (!box) return;
        const r = sp.rect;
        const ranges = new Map<string, LinearRange>();
        if (box.x) {
          const [lo, hi] = host.limits(sp.xaxis);
          const s = sp.xaxis.scale;
          ranges.set(
            sp.xaxis.id,
            limitRange([s.p2l(box.x0 - r.x), s.p2l(box.x1 - r.x)], lo, hi, false),
          );
        }
        if (box.y) {
          const [lo, hi] = host.limits(sp.yaxis);
          const s = sp.yaxis.scale;
          const bottom = r.y + r.height;
          ranges.set(
            sp.yaxis.id,
            limitRange([s.p2l(bottom - box.y1), s.p2l(bottom - box.y0)], lo, hi, false),
          );
        }
        host.commit(ranges);
        return;
      }
      case 'pan':
      case 'axis-pan':
      case 'axis-end':
        // The last frame's ranges may be older than the final pointer position (`#drag` is still
        // this gesture here).
        this.#dragFrame();
        if (drag.last.size > 0) host.commit(new Map(drag.last));
        return;
      case 'select':
      case 'lasso': {
        const query = this.#selectionQuery(drag);
        if (!query) return;
        const selection = this.#computeSelection(sp, query);
        if (drag.shift) {
          for (const [index, list] of selection) {
            const prev = host.selection(index);
            if (prev && prev.length > 0) {
              selection.set(
                index,
                [...new Set([...prev, ...list])].sort((a, b) => a - b),
              );
            }
          }
        }
        host.select(selection);
        host.events.emit('selected', {
          points: this.#selectionPoints(selection),
          ...this.#selectionShape(drag, query),
          event: e,
        });
        return;
      }
      default:
    }
  }

  // ---- selection -----------------------------------------------------------------------------------

  #selectionQuery(drag: Drag): SelectionQuery | null {
    const sp = drag.subplot as SubplotInfo;
    const r = sp.rect;
    const bottom = r.y + r.height;
    const sx = sp.xaxis.scale;
    const sy = sp.yaxis.scale;
    const clampX = (x: number): number => Math.min(Math.max(x, r.x), r.x + r.width);
    const clampY = (y: number): number => Math.min(Math.max(y, r.y), bottom);
    if (drag.action === 'lasso') {
      if (drag.lasso.length < 6) return null;
      const polygon: [number, number][] = [];
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let i = 0; i + 1 < drag.lasso.length; i += 2) {
        const lx = sx.p2l(clampX(drag.lasso[i] as number) - r.x);
        const ly = sy.p2l(bottom - clampY(drag.lasso[i + 1] as number));
        polygon.push([lx, ly]);
        x0 = Math.min(x0, lx);
        x1 = Math.max(x1, lx);
        y0 = Math.min(y0, ly);
        y1 = Math.max(y1, ly);
      }
      this.#host.layer.showLasso(drag.lasso);
      return { kind: 'lasso', x: [x0, x1], y: [y0, y1], polygon };
    }
    const axes = selectBoxAxes(this.#settings.selectdirection, drag.x - drag.x0, drag.y - drag.y0);
    const px0 = axes.x ? clampX(Math.min(drag.x0, drag.x)) : r.x;
    const px1 = axes.x ? clampX(Math.max(drag.x0, drag.x)) : r.x + r.width;
    const py0 = axes.y ? clampY(Math.min(drag.y0, drag.y)) : r.y;
    const py1 = axes.y ? clampY(Math.max(drag.y0, drag.y)) : bottom;
    this.#host.layer.showBox(px0, py0, px1, py1);
    const xa = sx.p2l(px0 - r.x);
    const xb = sx.p2l(px1 - r.x);
    const ya = sy.p2l(bottom - py1);
    const yb = sy.p2l(bottom - py0);
    return {
      kind: 'rect',
      x: axes.x ? [Math.min(xa, xb), Math.max(xa, xb)] : [-Infinity, Infinity],
      y: axes.y ? [Math.min(ya, yb), Math.max(ya, yb)] : [-Infinity, Infinity],
    };
  }

  /** Selected indices per trace of the subplot (every trace with `selectPoints`). */
  #computeSelection(sp: SubplotInfo, query: SelectionQuery): Map<number, number[]> {
    const out = new Map<number, number[]>();
    for (const entry of this.#host.entries(sp)) {
      if (!entry.module.selectPoints) continue;
      out.set(entry.index, entry.module.selectPoints(entry.calc, entry.trace, query, entry.ctx));
    }
    return out;
  }

  #selectionPoints(selection: ReadonlyMap<number, readonly number[]>): ChartPoint[] {
    const points: ChartPoint[] = [];
    for (const [index, list] of selection) {
      const entry = this.#entryFor(index);
      if (!entry) continue;
      for (const i of list)
        points.push(buildPoint(entry, { pointIndex: i, distance: 0, px: 0, py: 0 }, false));
    }
    return points;
  }

  #selectionShape(
    drag: Drag,
    query: SelectionQuery,
  ): { range?: Record<string, [unknown, unknown]>; lassoPoints?: Record<string, unknown[]> } {
    const sp = drag.subplot as SubplotInfo;
    const xa = sp.xaxis;
    const ya = sp.yaxis;
    if (query.kind === 'lasso' && query.polygon) {
      return {
        lassoPoints: {
          [xa.id]: query.polygon.map((p) => xa.scale.l2r(p[0])),
          [ya.id]: query.polygon.map((p) => ya.scale.l2r(p[1])),
        },
      };
    }
    const r: Record<string, [unknown, unknown]> = {};
    if (Number.isFinite(query.x[0]))
      r[xa.id] = [xa.scale.l2r(query.x[0]), xa.scale.l2r(query.x[1])];
    if (Number.isFinite(query.y[0]))
      r[ya.id] = [ya.scale.l2r(query.y[0]), ya.scale.l2r(query.y[1])];
    return { range: r };
  }

  // ---- wheel & pinch -------------------------------------------------------------------------------

  readonly #onWheel = (e: WheelEvent): void => {
    this.#local(e);
    // Components first (e.g. a scrolling legend), whatever scrollZoom says.
    if (this.#component('wheel', e)) return;
    const s = this.#settings;
    if (!s.scrollZoom || s.dragmode === false) return;
    if (!this.#zoneAt(this.#px, this.#py)) return;
    const hitZone = this.#hitZone as DragZone;
    e.preventDefault();
    const sp = this.#hitSubplot as SubplotInfo;
    const host = this.#host;
    const delta = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
    // Plotly's wheel step: a notch (≈100 px) zooms by e^(±0.1).
    const factor = Math.exp(Math.min(Math.max(delta, -20), 20) / 200);
    const ranges = (this.#wheel ??= new Map());
    const r = sp.rect;
    const zoomAxis = (axis: AxisInfo, p: number): void => {
      if (host.isFixed(axis)) return;
      const current = ranges.get(axis.id) ?? range(axis);
      const anchor = axis.scale.p2l(p);
      const [lo, hi] = host.limits(axis);
      ranges.set(axis.id, limitRange(zoomAround(current, anchor, factor), lo, hi, false));
    };
    if (hitZone === 'plot' || hitZone.startsWith('x')) zoomAxis(sp.xaxis, this.#px - r.x);
    if (hitZone === 'plot' || hitZone.startsWith('y'))
      zoomAxis(sp.yaxis, r.y + r.height - this.#py);
    this.#unhover(e);
    this.#preview(ranges);
    if (this.#wheelTimer !== undefined) clearTimeout(this.#wheelTimer);
    this.#wheelTimer = setTimeout(() => {
      this.#wheelTimer = undefined;
      const done = this.#wheel;
      this.#wheel = null;
      if (done && done.size > 0 && !this.#destroyed) host.commit(done);
    }, WHEEL_COMMIT_MS);
  };

  #startPinch(): void {
    const [a, b] = [...this.#touches.values()] as [
      { x: number; y: number },
      { x: number; y: number },
    ];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const hit = this.#zoneAt(mx, my) ? this.#hitSubplot : undefined;
    this.#drag = null;
    this.#host.layer.hideOverlay();
    if (!hit || this.#hitZone !== 'plot' || this.#settings.dragmode === false) return;
    this.#unhover(undefined);
    this.#pinch = {
      subplot: hit,
      d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mx0: mx,
      my0: my,
      rx: range(hit.xaxis),
      ry: range(hit.yaxis),
      last: new Map(),
    };
  }

  #pinchFrame(): void {
    const pinch = this.#pinch;
    if (!pinch || this.#touches.size < 2) return;
    const [a, b] = [...this.#touches.values()] as [
      { x: number; y: number },
      { x: number; y: number },
    ];
    const host = this.#host;
    const sp = pinch.subplot;
    const r = sp.rect;
    const factor = pinch.d0 / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    pinch.last.clear();
    const axisRange = (axis: AxisInfo, r0: LinearRange, p0: number, dp: number): void => {
      if (host.isFixed(axis)) return;
      const anchor = r0[0] + (p0 / axis.scale.length) * (r0[1] - r0[0]);
      const zoomed = zoomAround(r0, anchor, factor);
      const [lo, hi] = host.limits(axis);
      pinch.last.set(
        axis.id,
        limitRange(panBy(zoomed, -dp / pxPerUnit(axis, zoomed)), lo, hi, false),
      );
    };
    axisRange(sp.xaxis, pinch.rx, pinch.mx0 - r.x, mx - pinch.mx0);
    axisRange(sp.yaxis, pinch.ry, r.y + r.height - pinch.my0, -(my - pinch.my0));
    this.#preview(pinch.last);
  }

  #endPinch(): void {
    const pinch = this.#pinch;
    this.#pinch = null;
    if (pinch && pinch.last.size > 0) this.#host.commit(new Map(pinch.last));
  }
}
