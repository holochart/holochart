/**
 * Chart events (plan §7.5). Listeners may use the Plotly names too: `'plotly_relayout'` is an
 * alias of `'relayout'`, so code ported from Plotly keeps working.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { FrameInfo } from '@mk7s/holochart-render';
import type { AxisInfo } from './contracts.ts';
import type { AttributeUpdate } from './plan.ts';

/**
 * One data point in a `hover`, `click` or selection event (plan E6.1), shaped like Plotly's event
 * points so handlers port unchanged.
 */
export interface ChartPoint {
  /** The input trace (as given, after updates). */
  readonly data: unknown;
  /** The trace after defaults. */
  readonly fullData: FullTrace;
  /** Trace index. */
  readonly curveNumber: number;
  /** Index into the trace's data arrays. */
  readonly pointNumber: number;
  /** Same as `pointNumber` (Plotly has both). */
  readonly pointIndex: number;
  /** All data indices behind an aggregated point (histogram bins, stacked segments). */
  readonly pointNumbers?: readonly number[];
  /** Data values (numbers, date strings/ms, category names). */
  readonly x?: unknown;
  readonly y?: unknown;
  readonly z?: unknown;
  readonly customdata?: unknown;
  readonly text?: unknown;
  readonly hovertext?: unknown;
  readonly xaxis?: AxisInfo;
  readonly yaxis?: AxisInfo;
  /** Label anchor box in container CSS px (hover and click only). */
  readonly bbox?: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  };
  /** Anything else the trace reported for templates (`marker.size`, …). */
  readonly [field: string]: unknown;
}

/** Payload of `hover`, `unhover` and `click`. */
export interface PointerEventData {
  readonly points: readonly ChartPoint[];
  /** The DOM event behind it (absent for programmatic hover). */
  readonly event?: Event;
  /** The hovered position along each axis of the hovered subplot, in data units. */
  readonly xvals?: readonly unknown[];
  readonly yvals?: readonly unknown[];
}

/** Payload of `selecting` and `selected` (E6.3). */
export interface SelectionEventData {
  readonly points: readonly ChartPoint[];
  /** Box selections: the box in data (range) units, keyed by axis id (`{ x: [..], y: [..] }`). */
  readonly range?: Readonly<Record<string, readonly [unknown, unknown]>>;
  /** Lasso selections: the polygon in data (range) units, keyed by axis id. */
  readonly lassoPoints?: Readonly<Record<string, readonly unknown[]>>;
  readonly event?: Event;
}

/** Payload of `legendclick` / `legenddoubleclick` (emitted by the legend component, E5.2). */
export interface LegendEventData {
  readonly curveNumber: number;
  readonly data?: unknown;
  readonly fullData?: FullTrace;
  readonly event?: Event;
  readonly [field: string]: unknown;
}

/** Event payloads by name (plan §7.5). */
export interface ChartEvents {
  /** The pipeline finished and the frame is drawn (after every update call). */
  afterplot: undefined;
  /** Around every rendered frame (ADR-007); the payload object is reused between frames. */
  beforerender: FrameInfo;
  afterrender: FrameInfo;
  /** After a restyle: the edits and the trace indices they applied to. */
  restyle: { readonly update: AttributeUpdate; readonly traces: readonly number[] };
  /** After a relayout: the applied layout edits (including implied `autorange: false`). */
  relayout: AttributeUpdate;
  /** The figure size changed (container resize with `config.responsive`, or a relayout). */
  resize: { readonly width: number; readonly height: number };
  /**
   * During a drag or scroll zoom / pan (throttled to animation frames): the axis ranges shown so far,
   * as `relayout` edits (`'xaxis.range[0]'`, …). A `relayout` follows when the gesture ends.
   */
  relayouting: AttributeUpdate;
  /** The pointer is over data points (E6.1); the payload lists them. */
  hover: PointerEventData;
  /** The hovered points are gone (pointer moved away, left the chart, or `chart.unhover()`). */
  unhover: PointerEventData;
  /** A click on data points (E6.4). Not emitted when nothing is under the pointer. */
  click: PointerEventData;
  /** A double-click on the plot area (after `doubleClick` reset/autosize ran). */
  doubleclick: undefined;
  /** Box / lasso selection in progress (E6.3), throttled to animation frames. */
  selecting: SelectionEventData;
  /** Box / lasso selection finished, or a point was click-selected (`clickmode: 'select'`). */
  selected: SelectionEventData;
  /** The selection was cleared (double-click or a click on empty space in select mode). */
  deselect: undefined;
  /** Legend item clicked; a listener returning `false` cancels the default toggle. */
  legendclick: LegendEventData;
  legenddoubleclick: LegendEventData;
  webglcontextlost: undefined;
  webglcontextrestored: undefined;
  /** The chart was destroyed (`chart.destroy()` / `purge(el)`). */
  destroy: undefined;
}

export type ChartEventName = keyof ChartEvents;

/** An event name, or its Plotly alias (`plotly_<name>`). */
export type ChartEventKey = ChartEventName | `plotly_${ChartEventName}`;

/** The canonical name for an event key. */
export type CanonicalEvent<K extends ChartEventKey> = K extends `plotly_${infer N}` ? N : K;

/** A listener. Returning `false` cancels the default action of cancelable events (`legendclick`). */
export type ChartListener<K extends ChartEventKey> = (
  payload: ChartEvents[CanonicalEvent<K> & ChartEventName],
) => unknown;

type AnyListener = (payload: never) => unknown;

function canonical(key: string): string {
  return key.startsWith('plotly_') ? key.slice(7) : key;
}

/** A typed emitter with `on`/`off`/`once`; listeners may unsubscribe during dispatch. */
export class ChartEmitter {
  #listeners = new Map<string, readonly AnyListener[]>();

  on<K extends ChartEventKey>(type: K, listener: ChartListener<K>): () => void {
    const name = canonical(type);
    const list = this.#listeners.get(name) ?? [];
    this.#listeners.set(name, [...list, listener as AnyListener]);
    return () => this.off(type, listener);
  }

  once<K extends ChartEventKey>(type: K, listener: ChartListener<K>): () => void {
    const off = this.on(type, ((payload: never) => {
      off();
      (listener as AnyListener)(payload);
    }) as ChartListener<K>);
    return off;
  }

  off<K extends ChartEventKey>(type: K, listener?: ChartListener<K>): void {
    const name = canonical(type);
    if (!listener) {
      this.#listeners.delete(name);
      return;
    }
    const list = this.#listeners.get(name);
    if (!list) return;
    const i = list.lastIndexOf(listener as AnyListener);
    if (i < 0) return;
    const next = [...list.slice(0, i), ...list.slice(i + 1)];
    if (next.length > 0) this.#listeners.set(name, next);
    else this.#listeners.delete(name);
  }

  has(type: ChartEventName): boolean {
    return this.#listeners.has(type);
  }

  /** Call every listener of `type`; `false` when any of them returned `false` (cancel). */
  emit<K extends ChartEventName>(type: K, payload: ChartEvents[K]): boolean {
    const list = this.#listeners.get(type);
    if (!list) return true;
    let proceed = true;
    for (const listener of list) {
      if ((listener as (p: ChartEvents[K]) => unknown)(payload) === false) proceed = false;
    }
    return proceed;
  }

  clear(): void {
    this.#listeners.clear();
  }
}
