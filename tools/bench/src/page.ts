/**
 * In-page side of the GPU benchmark (`gpu.ts`). Loaded into the sandbox's test-mode page (served
 * by Vite from `/@fs/…`) after test mode has sized `#example-root`, it installs
 * `window.__holochartBench`. `run(options)` mounts one example, times its first draw, then drives
 * pan and zoom sweeps one step per animation frame and returns frame, CPU and GPU timings.
 *
 * Every `renderer.render` call is wrapped: CPU time around it, draw calls after it, and a
 * `TIME_ELAPSED` query (EXT_disjoint_timer_query_webgl2) around it when the extension exists.
 * Frame times are the intervals between animation frames, which Chromium stretches when either
 * the main thread or the GPU cannot keep up.
 *
 * Modules of the page (the example registry, the chart runtime) are imported by URL at run time,
 * so this file type-checks without pulling the packages into the tooling project.
 */
import type {
  Drive,
  PanSweep,
  RunOptions,
  RunResult,
  Stats,
  SweepResult,
  ZoomSweep,
} from './types.ts';

/** The parts of three's `WebGLRenderer` the probe uses. */
interface Renderer {
  render(scene: unknown, camera: unknown): void;
  getContext(): WebGL2RenderingContext | WebGLRenderingContext;
  readonly info: { readonly render: { readonly calls: number } };
}

/** `ExampleModule` / `ExampleHandle` of `examples/_lib/types.ts`, as far as used here. */
interface ExampleModule {
  run(el: HTMLElement): { ready?: Promise<void>; renderer?: Renderer; dispose(): void };
}

interface ChartLike {
  readonly axes: ReadonlyMap<string, { readonly scale: { readonly range: readonly number[] } }>;
  previewRanges(ranges: Readonly<Record<string, readonly [number, number]>>): void;
}

interface RuntimeModule {
  getChart(el: HTMLElement): ChartLike | undefined;
}

interface RegistryModule {
  loadExample(id: string): Promise<ExampleModule>;
}

/** EXT_disjoint_timer_query_webgl2 (not in lib.dom). */
interface TimerQueryExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

declare global {
  interface Window {
    __holochartBench?: { run(options: RunOptions): Promise<RunResult> };
  }
}

const CONTAINER_ID = 'example-root';

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

function stats(values: readonly number[]): Stats {
  if (values.length === 0) return { mean: NaN, p50: NaN, p95: NaN, max: NaN };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return { mean: sum / sorted.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) as number };
}

/** 0 → 1 → 0 over one period. */
function triangle(phase: number): number {
  const f = phase - Math.floor(phase);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

function rendererName(gl: WebGL2RenderingContext | WebGLRenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

/** One `renderer.render` call, attributed to the animation frame it ran in. */
interface RenderSample {
  frame: number;
  time: number;
  cpu: number;
  calls: number;
  gpu: number | null;
}

/**
 * Wraps `renderer.render` for CPU, draw-call and GPU-timer sampling. Samples of a frame are
 * summed per frame by `frameSamples`.
 */
class RenderProbe {
  readonly samples: RenderSample[] = [];
  frame = 0;
  readonly #renderer: Renderer;
  readonly #original: Renderer['render'];
  readonly #gl: WebGL2RenderingContext;
  readonly #timer: TimerQueryExt | null;
  #pending: { query: WebGLQuery; sample: RenderSample }[] = [];
  #active = false;

  constructor(renderer: Renderer) {
    this.#renderer = renderer;
    this.#gl = renderer.getContext() as WebGL2RenderingContext;
    this.#timer = this.#gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null;
    this.#original = renderer.render;
    renderer.render = (scene, camera) => {
      const gl = this.#gl;
      const timer = this.#timer && !this.#active ? this.#timer : null;
      const query = timer ? gl.createQuery() : null;
      const start = performance.now();
      if (timer && query) {
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        this.#active = true;
      }
      try {
        this.#original.call(renderer, scene, camera);
      } finally {
        if (timer && query) {
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          this.#active = false;
        }
      }
      const now = performance.now();
      const sample: RenderSample = {
        frame: this.frame,
        time: now,
        cpu: now - start,
        calls: renderer.info.render.calls,
        gpu: null,
      };
      this.samples.push(sample);
      if (query) this.#pending.push({ query, sample });
    };
  }

  get hasTimer(): boolean {
    return this.#timer !== null;
  }

  /** Collect finished timer queries (in order); a disjoint event invalidates all pending ones. */
  poll(): void {
    const gl = this.#gl;
    const timer = this.#timer;
    if (!timer) return;
    if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      for (const p of this.#pending) gl.deleteQuery(p.query);
      this.#pending = [];
      return;
    }
    while (this.#pending.length > 0) {
      const head = this.#pending[0] as { query: WebGLQuery; sample: RenderSample };
      if (!gl.getQueryParameter(head.query, gl.QUERY_RESULT_AVAILABLE)) break;
      head.sample.gpu = (gl.getQueryParameter(head.query, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(head.query);
      this.#pending.shift();
    }
  }

  /** Poll for up to `frames` animation frames until every query has a result. */
  async drain(frames = 30): Promise<void> {
    for (let i = 0; i < frames && this.#pending.length > 0; i++) {
      await nextFrame();
      this.poll();
    }
  }

  /** Samples between two `performance.now()` times, summed per animation frame. */
  frameSamples(from: number, to: number): { cpu: number; gpu: number | null; calls: number }[] {
    const byFrame = new Map<number, { cpu: number; gpu: number | null; calls: number }>();
    for (const s of this.samples) {
      if (s.time < from || s.time > to) continue;
      const f = byFrame.get(s.frame) ?? { cpu: 0, gpu: 0, calls: 0 };
      f.cpu += s.cpu;
      f.calls += s.calls;
      f.gpu = f.gpu === null || s.gpu === null ? null : f.gpu + s.gpu;
      byFrame.set(s.frame, f);
    }
    return [...byFrame.values()];
  }

  restore(): void {
    this.#renderer.render = this.#original;
    for (const p of this.#pending) this.#gl.deleteQuery(p.query);
    this.#pending = [];
  }
}

/** Initial (autoranged) linear ranges of the given axes. */
function initialRanges(chart: ChartLike, axes: readonly string[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const id of axes) {
    const range = chart.axes.get(id)?.scale.range;
    if (!range || range.length < 2) throw new Error(`Axis "${id}" not found on the chart.`);
    out.set(id, [range[0] as number, range[1] as number]);
  }
  return out;
}

/** Ranges of a pan sweep at `phase` (0…1 → left edge to right edge and back). */
function panRanges(
  base: ReadonlyMap<string, [number, number]>,
  sweep: PanSweep,
  phase: number,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [id, [r0, r1]] of base) {
    const span = r1 - r0;
    const width = span * sweep.window;
    const left = r0 + (span - width) * triangle(phase);
    out[id] = [left, left + width];
  }
  return out;
}

/** Ranges of a zoom sweep at `phase`: whole span → `min` of it → whole span, around the middle. */
function zoomRanges(
  base: ReadonlyMap<string, [number, number]>,
  sweep: ZoomSweep,
  phase: number,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const f = triangle(phase);
  for (const [id, [r0, r1]] of base) {
    const mid = (r0 + r1) / 2;
    const half = ((r1 - r0) * Math.pow(sweep.min, f)) / 2;
    out[id] = [mid - half, mid + half];
  }
  return out;
}

/**
 * One sweep: `step(phase)` once per animation frame (phase from elapsed time, one full period per
 * measured duration, so dropped frames do not slow the motion), warm-up first.
 */
async function sweep(
  probe: RenderProbe,
  options: RunOptions,
  step: ((phase: number) => void) | null,
): Promise<SweepResult> {
  const { warmupMs, durationMs } = options;
  const intervals: number[] = [];
  const updates: number[] = [];
  let measureStart = NaN;
  let measureEnd = NaN;
  await new Promise<void>((resolve) => {
    let start = -1;
    let last = -1;
    const tick = (now: number): void => {
      if (start < 0) start = now;
      const t = now - start;
      probe.frame++;
      probe.poll();
      if (t >= warmupMs + durationMs) {
        measureEnd = performance.now();
        resolve();
        return;
      }
      const measuring = t >= warmupMs;
      if (measuring && Number.isNaN(measureStart)) measureStart = performance.now();
      else if (measuring && last >= 0) intervals.push(now - last);
      last = now;
      if (step) {
        const before = performance.now();
        step((t - warmupMs) / durationMs);
        if (measuring) updates.push(performance.now() - before);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await probe.drain();
  const frames = probe.frameSamples(measureStart, measureEnd);
  const gpu = frames.map((f) => f.gpu);
  const measured = measureEnd - measureStart;
  const calls = stats(frames.map((f) => f.calls)).p50;
  return {
    frames: intervals.length,
    durationMs: measured,
    fps: intervals.length / (intervals.reduce((a, b) => a + b, 0) / 1000),
    frameMs: stats(intervals),
    rendersPerSecond: (frames.length * 1000) / measured,
    updateCpuMs: step && options.drive.kind === 'ranges' ? stats(updates) : null,
    renderCpuMs: stats(frames.map((f) => f.cpu)),
    gpuMs:
      probe.hasTimer && gpu.length > 0 && gpu.every((g) => g !== null)
        ? stats(gpu as number[])
        : null,
    drawCalls: calls,
  };
}

/** Clicks the example's button labelled `label` (its own continuous-render toggle). */
function clickButton(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!button) throw new Error(`No "${label}" button in the example.`);
  button.click();
}

async function findChart(root: HTMLElement): Promise<ChartLike> {
  const url = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .find((name) => /\/packages\/runtime\/src\/index\.ts(\?|$)/.test(name));
  if (!url) throw new Error('The chart runtime module was not loaded by the example.');
  // The exact URL the example loaded: same module instance, so the same chart registry.
  const runtime = (await import(/* @vite-ignore */ url)) as RuntimeModule;
  for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const chart = runtime.getChart(el);
    if (chart) return chart;
  }
  throw new Error('No chart found in the example container.');
}

async function run(options: RunOptions): Promise<RunResult> {
  const root = document.getElementById(CONTAINER_ID);
  if (!root) throw new Error(`#${CONTAINER_ID} not found: open the example in test mode first.`);
  const registryUrl = new URL('../../../examples/index.ts', import.meta.url).href;
  const registry = (await import(/* @vite-ignore */ registryUrl)) as RegistryModule;
  const mod = await registry.loadExample(options.example);
  await nextFrame();

  const t0 = performance.now();
  const handle = mod.run(root);
  await handle.ready;
  const mountMs = performance.now() - t0;
  const renderer = handle.renderer;
  if (!renderer) throw new Error(`Example "${options.example}" exposes no renderer.`);
  const gl = renderer.getContext();
  const f0 = performance.now();
  gl.finish();
  const finishMs = performance.now() - f0;
  const perf = options.perfGlobal
    ? ((window as unknown as Record<string, unknown>)[options.perfGlobal] as
        { firstDrawMs?: number; generateMs?: number } | undefined)
    : undefined;
  await nextFrame();
  await nextFrame();
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

  const probe = new RenderProbe(renderer);
  let pan: SweepResult | null = null;
  let zoom: SweepResult | null = null;
  try {
    const drive: Drive = options.mountOnly ? { kind: 'none' } : options.drive;
    if (drive.kind === 'ranges') {
      const chart = await findChart(root);
      if (options.pan) {
        const sw = options.pan;
        const base = initialRanges(chart, sw.axes);
        pan = await sweep(probe, options, (phase) =>
          chart.previewRanges(panRanges(base, sw, phase)),
        );
        chart.previewRanges(Object.fromEntries(base));
        await nextFrame();
      }
      if (options.zoom) {
        const sw = options.zoom;
        const base = initialRanges(chart, sw.axes);
        zoom = await sweep(probe, options, (phase) =>
          chart.previewRanges(zoomRanges(base, sw, phase)),
        );
        chart.previewRanges(Object.fromEntries(base));
      }
    } else if (drive.kind === 'button') {
      clickButton(root, drive.label);
      try {
        pan = await sweep(probe, options, null);
      } finally {
        clickButton(root, 'Stop');
      }
    }
  } finally {
    probe.restore();
  }

  const canvas = root.querySelector('canvas');
  const result: RunResult = {
    example: options.example,
    renderer: rendererName(gl),
    canvas: {
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      dpr: window.devicePixelRatio,
    },
    mountMs,
    firstDrawMs: typeof perf?.firstDrawMs === 'number' ? perf.firstDrawMs : null,
    generateMs: typeof perf?.generateMs === 'number' ? perf.generateMs : null,
    finishMs,
    heapMB: memory ? memory.usedJSHeapSize / 1e6 : null,
    pan,
    zoom,
  };
  handle.dispose();
  return result;
}

window.__holochartBench = { run };
