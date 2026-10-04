/**
 * Shared between the Node side of the GPU benchmark (`gpu.ts`) and the in-page harness
 * (`page.ts`): plain types only, no DOM or Node code, so both sides can import it.
 */

/** How the harness moves the view during a sweep. */
export type Drive =
  /** `chart.previewRanges` per animation frame, the preview path zoom and pan drags use. */
  | { kind: 'ranges' }
  /** Click the example's own toggle button (render-package examples without a chart). */
  | { kind: 'button'; label: string }
  /** No sweep: first draw only. */
  | { kind: 'none' };

export interface PanSweep {
  /** Axis ids moved together (`['x']`, `['x', 'y']`). */
  axes: readonly string[];
  /** Window width as a fraction of the initial (autoranged) span. */
  window: number;
}

export interface ZoomSweep {
  axes: readonly string[];
  /** Narrowest window as a fraction of the initial span (whole → this → whole, log scale). */
  min: number;
}

/** What the page harness is asked to do for one run of one example. */
export interface RunOptions {
  example: string;
  drive: Drive;
  pan?: PanSweep;
  zoom?: ZoomSweep;
  /**
   * `window` global where the example records its own `firstDrawMs` / `generateMs` (the time
   * from just before `createChart` to `chart.ready`, and the data generation before it).
   */
  perfGlobal?: string;
  /** Unmeasured frames at the start of each sweep (JIT, first uploads). */
  warmupMs: number;
  /** Measured length of each sweep. */
  durationMs: number;
  /** Stop after the first draw (no sweeps): the profiled run of `--profile`. */
  mountOnly?: boolean;
}

export interface Stats {
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export interface SweepResult {
  /** Animation frames in the measured window. */
  frames: number;
  durationMs: number;
  /** Animation frames per second (Chromium throttles them when the GPU or main thread lag). */
  fps: number;
  /** Intervals between consecutive animation frames. */
  frameMs: Stats;
  /** `renderer.render` batches per second (the chart renders on demand, once per changed frame). */
  rendersPerSecond: number;
  /** CPU time of the `previewRanges` call per frame (null when the example drives itself). */
  updateCpuMs: Stats | null;
  /** CPU time of `renderer.render` per frame (WebGL command submission, not GPU execution). */
  renderCpuMs: Stats;
  /** GPU time per frame from `EXT_disjoint_timer_query_webgl2` (null when unavailable). */
  gpuMs: Stats | null;
  /** Draw calls per rendered frame (median). */
  drawCalls: number;
}

export interface RunResult {
  example: string;
  /** `UNMASKED_RENDERER_WEBGL` of the chart's own context. */
  renderer: string;
  canvas: { width: number; height: number; dpr: number };
  /** `run(el)` to `handle.ready`, data generation included. */
  mountMs: number;
  /** From the example's perf global: `createChart` to `chart.ready` (null if not recorded). */
  firstDrawMs: number | null;
  generateMs: number | null;
  /** `gl.finish()` right after ready: GPU work of the first frame still queued at that point. */
  finishMs: number;
  /** `performance.memory.usedJSHeapSize` after the first draw, in MB (null if unavailable). */
  heapMB: number | null;
  pan: SweepResult | null;
  zoom: SweepResult | null;
}
