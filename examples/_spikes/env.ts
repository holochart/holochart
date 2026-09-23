import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Shared harness for the E0.7 technical spikes (docs/spikes/). Every `.ts` file under `examples/`
 * is an example, so this helper module is one too: on its own it shows the machine/GPU details
 * that every spike write-up records next to its numbers.
 *
 * Spike pages run their benchmark automatically, print progress and results into a DOM readout,
 * and publish machine-readable results on `window.__spikeResults[<spike id>]`. Canvas size is
 * fixed (default 1024×640 CSS px, override with `&w=…&h=…`) so numbers are comparable; the device
 * pixel ratio comes from the sandbox's `&dpr=1|2` toggle.
 */
export const meta: ExampleMeta = {
  title: 'Spike environment',
  description: 'Machine, browser, and GPU details recorded alongside every E0.7 spike result.',
  tags: ['spike', 'no-visual-test'],
};

export interface SpikeRecord {
  status: 'running' | 'done' | 'error';
  env?: EnvInfo;
  results: Record<string, unknown>;
  error?: string;
}

declare global {
  interface Window {
    __spikeResults?: Record<string, SpikeRecord>;
  }
}

export interface EnvInfo {
  userAgent: string;
  platform: string;
  glVendor: string;
  glRenderer: string;
  glVersion: string;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  screen: string;
  canvasCss: string;
  canvasDevice: string;
  timerQuery: boolean;
  maxTextureSize: number;
  refreshHz: number;
  /** Workload scale the spike ran at (`&scale=`, 1 = full workload). */
  scale: number;
}

/** Summary statistics for repeated timings. */
export interface Stats {
  n: number;
  median: number;
  min: number;
  max: number;
  mean: number;
  p95: number;
}

/**
 * Workload scale from `&scale=` (default 1, clamped to 0.01–1). Spikes are run small first and
 * scaled up only after a clean run, so a heavy workload can't take down the browser on first try.
 */
export function spikeScale(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('scale'));
  return Number.isFinite(raw) && raw > 0 ? Math.min(1, Math.max(0.01, raw)) : 1;
}

/** `n` scaled by {@link spikeScale}, rounded, at least `min`. */
export function scaled(n: number, min = 1): number {
  return Math.max(min, Math.round(n * spikeScale()));
}

export function summarize(samples: readonly number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return { n: 0, median: NaN, min: NaN, max: NaN, mean: NaN, p95: NaN };
  const q = (p: number): number => {
    const i = (n - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
  };
  return {
    n,
    median: round(q(0.5)),
    min: round(s[0]!),
    max: round(s[n - 1]!),
    mean: round(s.reduce((a, b) => a + b, 0) / n),
    p95: round(q(0.95)),
  };
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** `median (min–max, n=…)` for readouts. */
export function fmt(s: Stats, unit = 'ms'): string {
  return `${s.median} ${unit} (${s.min}–${s.max}, n=${s.n})`;
}

/**
 * Yield to the event loop via MessageChannel. The in-app browser pane may be hidden while the
 * benchmark runs, and hidden pages get `requestAnimationFrame` paused and chained timers
 * throttled to ~1/min, so the harness never waits on rAF or setTimeout.
 */
const channel = new MessageChannel();
const waiting: (() => void)[] = [];
channel.port1.onmessage = () => waiting.shift()?.();
export function yieldTask(): Promise<number> {
  return new Promise((resolve) => {
    waiting.push(() => resolve(performance.now()));
    channel.port2.postMessage(0);
  });
}

/** Timer-free sleep (repeated event-loop yields). */
export async function sleep(ms: number): Promise<void> {
  const end = performance.now() + ms;
  while (performance.now() < end) await yieldTask();
}

/** Block until the GPU has finished all submitted work (1-pixel readback). */
export function syncGL(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
}

/**
 * Median rAF interval over `frames` frames → display refresh rate estimate, or 0 when rAF does not
 * fire (hidden page).
 */
export async function estimateRefreshHz(frames = 30): Promise<number> {
  const t: number[] = [];
  let done = false;
  const tick = (now: number): void => {
    t.push(now);
    if (t.length < frames && !done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const deadline = performance.now() + 1000;
  while (t.length < frames && performance.now() < deadline) await yieldTask();
  done = true;
  if (t.length < frames) return 0;
  const d: number[] = [];
  for (let i = 1; i < t.length; i++) d.push(t[i]! - t[i - 1]!);
  return round(1000 / summarize(d).median, 0);
}

/** `performance.memory.usedJSHeapSize` in MB (Chromium only), or null. */
export function heapMB(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? round(memory.usedJSHeapSize / 2 ** 20, 1) : null;
}

/** Best-effort GC (only exposed with --js-flags=--expose-gc), then let the heap settle. */
export async function settleHeap(): Promise<void> {
  (globalThis as { gc?: () => void }).gc?.();
  await sleep(300);
}

export function gpuInfo(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): Pick<EnvInfo, 'glVendor' | 'glRenderer' | 'glVersion' | 'timerQuery' | 'maxTextureSize'> {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    glVendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    glRenderer: String(
      ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    ),
    glVersion: String(gl.getParameter(gl.VERSION)),
    timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
  };
}

export async function collectEnv(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
): Promise<EnvInfo> {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    ...gpuInfo(gl),
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    screen: `${screen.width}×${screen.height}`,
    canvasCss: `${canvas.clientWidth}×${canvas.clientHeight}`,
    canvasDevice: `${canvas.width}×${canvas.height}`,
    refreshHz: await estimateRefreshHz(),
    scale: spikeScale(),
  };
}

/** Fixed benchmark canvas size (CSS px), overridable with `&w=…&h=…`. */
export function canvasSize(defaults = { width: 1024, height: 640 }): {
  width: number;
  height: number;
} {
  const q = new URLSearchParams(window.location.search);
  const w = Number(q.get('w'));
  const h = Number(q.get('h'));
  return {
    width: w > 0 ? w : defaults.width,
    height: h > 0 ? h : defaults.height,
  };
}

/** Page scaffold: a fixed-size host for the canvas(es) and a text readout below it. */
export interface SpikePage {
  readonly host: HTMLDivElement;
  readonly record: SpikeRecord;
  log(line: string): void;
  /** Store a result (published on `window.__spikeResults`). */
  set(key: string, value: unknown): void;
  done(): void;
  fail(error: unknown): void;
  dispose(): void;
}

export function createSpikePage(
  el: HTMLElement,
  id: string,
  size: { width: number; height: number } | null = canvasSize(),
): SpikePage {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px;overflow:auto';
  const host = document.createElement('div');
  host.style.cssText = size
    ? `position:relative;flex:none;width:${size.width}px;height:${size.height}px;background:#fff`
    : 'position:relative;flex:none';
  const readout = document.createElement('pre');
  readout.id = 'spike-readout';
  readout.style.cssText =
    'margin:0;font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:1024px';
  wrapper.append(host, readout);
  el.appendChild(wrapper);

  const record: SpikeRecord = { status: 'running', results: {} };
  window.__spikeResults ??= {};
  window.__spikeResults[id] = record;

  return {
    host,
    record,
    log(line) {
      readout.textContent += `${line}\n`;
    },
    set(key, value) {
      record.results[key] = value;
    },
    done() {
      record.status = 'done';
      readout.textContent += 'DONE\n';
    },
    fail(error) {
      record.status = 'error';
      record.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
      readout.textContent += `ERROR: ${record.error}\n`;
    },
    dispose() {
      wrapper.remove();
    },
  };
}

/**
 * GPU timer (EXT_disjoint_timer_query_webgl2). `wrap(fn)` times the GL work `fn` submits;
 * `collect()` waits for the queries and returns milliseconds (disjoint samples are dropped).
 */
export interface GpuTimer {
  wrap(fn: () => void): void;
  collect(): Promise<number[]>;
}

export function createGpuTimer(gl: WebGL2RenderingContext): GpuTimer | null {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  if (!ext) return null;
  let queries: WebGLQuery[] = [];
  return {
    wrap(fn) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      try {
        fn();
      } finally {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        queries.push(q);
      }
    },
    async collect() {
      const pending = queries;
      queries = [];
      const out: number[] = [];
      for (let tries = 0; tries < 120; tries++) {
        const last = pending[pending.length - 1];
        if (!last || gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE)) break;
        await sleep(5);
      }
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      for (const q of pending) {
        if (!disjoint && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
          out.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
        }
        gl.deleteQuery(q);
      }
      return out;
    },
  };
}

export interface FrameRun {
  frames: number;
  /**
   * Sustained frames per second when frames are rendered back to back, each followed by a GPU sync
   * (`sync`), i.e. throughput not capped by vsync. With vsync the delivered rate is
   * `min(refresh, fps)`. The sync adds a pipeline stall, so this is a conservative lower bound.
   */
  fps: number;
  /** Full iteration time: step + render + GPU sync. */
  frame: Stats;
  /** JS time in `step` + `render` (CPU submit cost, excludes waiting for the GPU). */
  cpu: Stats;
  /** GPU execution time per frame (EXT_disjoint_timer_query_webgl2), when `gl` is given. */
  gpu: Stats | null;
}

/**
 * Continuous rendering for `durationMs`: each iteration calls `step(elapsedMs, i)`, `render()`,
 * then `sync()` (GPU sync, or a forced style/layout for DOM), and yields to the event loop.
 */
export async function runFrames(
  durationMs: number,
  step: (elapsedMs: number, i: number) => void,
  render: () => void,
  options: { gl?: WebGL2RenderingContext; sync?: () => void } = {},
): Promise<FrameRun> {
  const timer = options.gl ? createGpuTimer(options.gl) : null;
  const sync = options.sync ?? (options.gl ? () => syncGL(options.gl!) : () => {});
  const frame: number[] = [];
  const cpu: number[] = [];
  await yieldTask();
  const t0 = performance.now();
  let i = 0;
  let now = t0;
  while (now - t0 < durationMs) {
    const f0 = performance.now();
    step(f0 - t0, i++);
    if (timer) timer.wrap(render);
    else render();
    const f1 = performance.now();
    sync();
    now = performance.now();
    cpu.push(f1 - f0);
    frame.push(now - f0);
    await yieldTask();
  }
  const elapsed = performance.now() - t0;
  const gpu = timer ? await timer.collect() : null;
  return {
    frames: frame.length,
    fps: round((frame.length * 1000) / elapsed, 1),
    frame: summarize(frame),
    cpu: summarize(cpu),
    gpu: gpu && gpu.length ? summarize(gpu) : null,
  };
}

/** Encode the current drawing buffer as PNG right after rendering (same task). */
export function capturePNG(canvas: HTMLCanvasElement, render: () => void): string {
  render();
  return canvas.toDataURL('image/png');
}

export function run(el: HTMLElement): ExampleHandle {
  const page = createSpikePage(el, 'env', { width: 16, height: 16 });
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    page.fail('WebGL2 unavailable');
  } else {
    void collectEnv(gl, canvas).then((env) => {
      page.record.env = env;
      for (const [k, v] of Object.entries(env)) page.log(`${k}: ${String(v)}`);
      page.log(`jsHeapMB: ${String(heapMB())}`);
      page.done();
    });
  }
  return {
    ready: Promise.resolve(),
    dispose() {
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      page.dispose();
    },
  };
}
