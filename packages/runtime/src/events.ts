/**
 * Chart events (plan §7.5). Listeners may use the Plotly names too: `'plotly_relayout'` is an
 * alias of `'relayout'`, so code ported from Plotly keeps working.
 */
import type { FrameInfo } from '@mk7s/holochart-render';
import type { AttributeUpdate } from './plan.ts';

/** Event payloads by name. More events (hover, click, zoom, …) arrive with interaction (E6). */
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

export type ChartListener<K extends ChartEventKey> = (
  payload: ChartEvents[CanonicalEvent<K> & ChartEventName],
) => void;

type AnyListener = (payload: never) => void;

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

  emit<K extends ChartEventName>(type: K, payload: ChartEvents[K]): void {
    const list = this.#listeners.get(type);
    if (!list) return;
    for (const listener of list) (listener as (p: ChartEvents[K]) => void)(payload);
  }

  clear(): void {
    this.#listeners.clear();
  }
}
