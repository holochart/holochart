/**
 * Test doubles for runtime tests (not exported from the package): a WebGL-free renderer, a manual
 * frame scheduler, a ResizeObserver stub, and a trace module that records every pipeline call.
 */
import { attr, type FullTrace } from '@mk7s/holochart-core';
import type { FrameScheduler } from '@mk7s/holochart-render';
import type { WebGLRenderer, WebGLRendererParameters } from 'three';
import { vi, type Mock } from 'vitest';
import type { ChartOptions } from '../chart.ts';
import type {
  ComponentModule,
  TraceModule,
  TracePlotContext,
  TraceUpdatePlan,
} from '../contracts.ts';
import { linearExtremes } from '../axes.ts';
import { selectionContains } from '../fx/geometry.ts';
import { createChartRegistry, type ChartRegistry } from '../registry.ts';

type Fn = Mock<(...args: never[]) => unknown>;

/** The subset of `WebGLRenderer` a render root touches, recording calls. */
export interface FakeRenderer {
  renderer: {
    domElement: HTMLCanvasElement;
    info: { autoReset: boolean; reset: Fn };
    setClearColor: Fn;
    dispose: Fn;
    [key: string]: unknown;
  };
  calls: string[];
  canvas: HTMLCanvasElement;
}

/** Records the renderer calls a render root makes; no WebGL involved. */
export function createFakeRenderer(): FakeRenderer {
  const canvas = document.createElement('canvas');
  const calls: string[] = [];
  const renderer = {
    domElement: canvas,
    autoClear: true,
    info: { autoReset: true, reset: vi.fn() },
    renderLists: { dispose: vi.fn() },
    width: 0,
    height: 0,
    setPixelRatio: vi.fn(),
    setSize(w: number, h: number) {
      this.width = w;
      this.height = h;
      calls.push(`size ${w}x${h}`);
    },
    setRenderTarget: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setViewport: vi.fn(),
    render: () => void calls.push('render'),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
  return { renderer, calls, canvas };
}

/** A `requestAnimationFrame` stand-in that only runs when stepped. */
export function createManualScheduler(): FrameScheduler & { step(): void } {
  let next = 1;
  const queue = new Map<number, (time: number) => void>();
  let time = 0;
  return {
    request(cb) {
      queue.set(next, cb);
      return next++;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    now: () => time,
    step() {
      time += 16;
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(time);
    },
  };
}

/** `ResizeObserver` stub; `fire` delivers a size to every observer. */
export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  disconnected = false;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  fire(width: number, height: number): void {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

export interface DotsCalc {
  x: Float64Array;
  y: Float64Array;
}

export interface CallLog {
  calc: number[];
  /** Trace indices of each `crossTraceCalc` call (dots with `stack: true` only). */
  cross: number[][];
  create: number[];
  updates: {
    index: number;
    plan: TraceUpdatePlan;
    transform: TracePlotContext['transform'];
    selected: readonly number[] | null | undefined;
  }[];
  disposed: number[];
}

const dotsSchema = attr.object({
  x: attr.dataArray({ editType: 'calc' }),
  y: attr.dataArray({ editType: 'calc' }),
  color: attr.color({ editType: 'style' }),
  label: attr.string({ dflt: '', editType: 'plot' }),
  size: attr.number({ min: 0, dflt: 10, editType: 'calcIfAutorange' }),
});

/**
 * A minimal cartesian trace type ('dots') that records calc/create/update/dispose calls. Its view
 * tracks the trace index it was created for, so moved traces show up in `updates`.
 */
export function createDotsModule(
  log: CallLog,
  options: { cross?: boolean } = {},
): TraceModule<DotsCalc> {
  const module: TraceModule<DotsCalc> = {
    type: 'dots',
    categories: ['cartesian', 'showLegend'],
    schema: dotsSchema,
    meta: { description: 'Test dots.' },
    supplyDefaults(_in, _out: FullTrace, ctx) {
      ctx.coerce('x');
      ctx.coerce('y');
      ctx.coerce('color', ctx.defaultColor);
      ctx.coerce('label');
      ctx.coerce('size');
    },
    calc(trace, ctx) {
      log.calc.push(ctx.index);
      const x = (ctx.xaxis?.scale ?? null)?.d2lArray((trace['x'] as ArrayLike<unknown>) ?? []);
      const y = (ctx.yaxis?.scale ?? null)?.d2lArray((trace['y'] as ArrayLike<unknown>) ?? []);
      return { x: x ?? new Float64Array(), y: y ?? new Float64Array() };
    },
    extremes(calc, trace) {
      const pad = Number(trace['size']) / 2;
      return { x: linearExtremes(calc.x, pad), y: linearExtremes(calc.y, pad) };
    },
    // Nearest point in px (closest), or along the axis (x / y), within the query distance.
    hoverPoints(calc, _trace, q, ctx) {
      const t = ctx.transform;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < calc.x.length; i++) {
        const px = calc.x[i]! * t.scaleX + t.offsetX;
        const py = calc.y[i]! * t.scaleY + t.offsetY;
        const d =
          q.mode === 'closest'
            ? Math.hypot(px - q.px, py - q.py)
            : q.mode === 'x'
              ? Math.abs(px - q.px)
              : Math.abs(py - q.py);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0 || bestD > q.distance) return [];
      return [
        {
          pointIndex: best,
          distance: bestD,
          px: calc.x[best]! * t.scaleX + t.offsetX,
          py: calc.y[best]! * t.scaleY + t.offsetY,
        },
      ];
    },
    selectPoints(calc, _trace, query) {
      const out: number[] = [];
      for (let i = 0; i < calc.x.length; i++) {
        if (selectionContains(query, calc.x[i]!, calc.y[i]!)) out.push(i);
      }
      return out;
    },
    plot: {
      create(ctx) {
        log.create.push(ctx.index);
        let index = ctx.index;
        return {
          update(c, plan) {
            index = c.index;
            log.updates.push({
              index: c.index,
              plan: { ...plan },
              transform: { ...c.transform },
              selected: c.selectedPoints,
            });
          },
          dispose() {
            log.disposed.push(index);
          },
        };
      },
    },
  };
  if (options.cross) {
    module.crossTraceCalc = (entries) => {
      log.cross.push(entries.map((e) => e.index));
    };
  }
  return module;
}

export function createLog(): CallLog {
  return { calc: [], cross: [], create: [], updates: [], disposed: [] };
}

export interface TestSetup {
  registry: ChartRegistry;
  log: CallLog;
  options: ChartOptions;
  renderers: FakeRenderer[];
  scheduler: ReturnType<typeof createManualScheduler>;
  container: HTMLElement;
  /** Number of frames rendered across all renderers (the root resets `info` once per frame). */
  frames(): number;
}

/** A registry with the dots module, fake renderer/scheduler options and a sized container. */
export function setup(
  options: {
    width?: number;
    height?: number;
    components?: ComponentModule[];
    /** Give the dots module a `crossTraceCalc` (recorded in `log.cross`). */
    cross?: boolean;
  } = {},
): TestSetup {
  const log = createLog();
  const registry = createChartRegistry().register(
    createDotsModule(log, { cross: options.cross === true }),
  );
  if (options.components) registry.register(...options.components);
  const renderers: FakeRenderer[] = [];
  const scheduler = createManualScheduler();
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', {
    value: options.width ?? 0,
    configurable: true,
  });
  Object.defineProperty(container, 'clientHeight', {
    value: options.height ?? 0,
    configurable: true,
  });
  document.body.appendChild(container);
  return {
    registry,
    log,
    renderers,
    scheduler,
    container,
    options: {
      registry,
      renderRoot: {
        scheduler,
        createRenderer: (_params: WebGLRendererParameters) => {
          const fake = createFakeRenderer();
          renderers.push(fake);
          return fake.renderer as unknown as WebGLRenderer;
        },
      },
    },
    frames: () => renderers.reduce((n, r) => n + r.renderer.info.reset.mock.calls.length, 0),
  };
}
