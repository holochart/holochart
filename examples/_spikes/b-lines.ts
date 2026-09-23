import { Color, SRGBColorSpace, type BufferGeometry, type Object3D } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  createRenderRoot,
  LinePrimitive,
  type DataTransform,
  type LineDash,
  type RenderRoot,
  type RGBA,
  type Viewport,
} from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import {
  collectEnv,
  createSpikePage,
  fmt,
  yieldTask,
  round,
  runFrames,
  sleep,
  summarize,
  syncGL,
  type SpikePage,
  scaled,
} from './env.ts';

/**
 * Spike B (E0.7): our `LinePrimitive` (E2.5) vs three's `Line2` / `LineMaterial`.
 *
 * - `?mode=quality` (default): a side-by-side test card — left half ours, right half Line2 — with
 *   translucent wide zigzags (join seams), opaque joins, dashes, and thin lines (AA). Use the
 *   sandbox `&dpr=1|2` toggle; `window.__spikeCapture()` returns the canvas as a PNG data URL.
 * - `?mode=perf`: 10 series × 100k points each: build time (construct + first GPU-synced frame)
 *   and pan cost (GPU-synced throughput fps, CPU and GPU time per frame), solid and dashed.
 */
export const meta: ExampleMeta = {
  title: 'Spike B: lines vs Line2',
  description: 'Visual quality (joins, dashes, AA) and 10×100k pan/build performance vs Line2.',
  tags: ['spike', 'no-visual-test'],
};

declare global {
  interface Window {
    __spikeCapture?: () => string;
  }
}

const INK: RGBA = [0.12, 0.47, 0.71, 1];
const ORANGE: RGBA = [1, 0.5, 0.05, 0.5];

function srgb(c: RGBA): Color {
  return new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace);
}

interface Line2Opts {
  color: RGBA;
  width: number;
  dashed?: { dash: number; gap: number };
}

function makeLine2(xy: ArrayLike<number>, opts: Line2Opts): Line2 {
  const positions = new Float32Array((xy.length / 2) * 3);
  for (let i = 0, j = 0; i < xy.length; i += 2, j += 3) {
    positions[j] = xy[i]!;
    positions[j + 1] = xy[i + 1]!;
  }
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: srgb(opts.color),
    linewidth: opts.width,
    worldUnits: false,
    transparent: opts.color[3] < 1,
    opacity: opts.color[3],
    depthWrite: false,
    dashed: !!opts.dashed,
    dashSize: opts.dashed?.dash ?? 1,
    gapSize: opts.dashed?.gap ?? 1,
  });
  const line = new Line2(geometry, material);
  if (opts.dashed) line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}

function split(xy: readonly number[]): { x: Float64Array; y: Float64Array } {
  const n = xy.length / 2;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = xy[2 * i]!;
    y[i] = xy[2 * i + 1]!;
  }
  return { x, y };
}

/** Zigzag in px: `n` teeth between x0 and x1, amplitude h, starting at y0. */
function zigzag(x0: number, x1: number, y0: number, h: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(x0 + ((x1 - x0) * i) / n, y0 + (i % 2 ? h : 0));
  return out;
}

function wave(x0: number, x1: number, y0: number, amp: number, periods: number, n = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(x0 + (x1 - x0) * t, y0 + amp * Math.sin(t * periods * Math.PI * 2));
  }
  return out;
}

/** Side-by-side quality card (left: ours, right: Line2), in viewport px (origin bottom-left). */
function buildQualityCard(root: RenderRoot, vp: Viewport): void {
  const W = root.size.width;
  const H = root.size.height;
  const half = W / 2;
  const rows: {
    xy: (x0: number, x1: number) => number[];
    color: RGBA;
    width: number;
    dash?: LineDash;
    l2dash?: { dash: number; gap: number };
    join?: 'miter' | 'round' | 'bevel';
  }[] = [
    // Translucent wide zigzag: seams/double-blending at joins show as darker wedges.
    { xy: (a, b) => zigzag(a, b, H - 110, 70, 6), color: ORANGE, width: 16, join: 'miter' },
    { xy: (a, b) => zigzag(a, b, H - 200, 50, 10), color: ORANGE, width: 10, join: 'round' },
    // Opaque joins with sharp angles.
    { xy: (a, b) => zigzag(a, b, H - 270, 45, 16), color: INK, width: 5, join: 'miter' },
    // Dashes on a wave: Plotly 'dash' at 2px = [9, 9] px; Line2 in px world units.
    {
      xy: (a, b) => wave(a, b, H - 320, 18, 3),
      color: INK,
      width: 2,
      dash: 'dash',
      l2dash: { dash: 9, gap: 9 },
    },
    {
      xy: (a, b) => wave(a, b, H - 370, 18, 3),
      color: INK,
      width: 4,
      dash: 'dot',
      l2dash: { dash: 4, gap: 4 },
    },
    // Thin lines: AA quality.
    { xy: (a, b) => wave(a, b, H - 420, 14, 5, 400), color: INK, width: 1 },
    { xy: (a, b) => [a, H - 470, b, H - 452], color: INK, width: 1 },
    { xy: (a, b) => [a, H - 500, b, H - 494], color: INK, width: 0.5 },
  ];
  for (const row of rows) {
    const left = row.xy(20, half - 20);
    const { x, y } = split(left);
    vp.add(
      new LinePrimitive(root.context, {
        x,
        y,
        color: row.color,
        width: row.width,
        join: row.join ?? 'miter',
        cap: 'butt',
        ...(row.dash ? { dash: row.dash } : {}),
      }),
    );
    const right = row.xy(half + 20, W - 20);
    vp.scene.add(
      makeLine2(right, {
        color: row.color,
        width: row.width,
        ...(row.l2dash ? { dashed: row.l2dash } : {}),
      }),
    );
  }
}

/** Bytes of all distinct attribute arrays of a geometry (CPU copy ≈ GPU buffer size). */
function geometryBytes(geometry: BufferGeometry): number {
  const seen = new Set<ArrayBufferLike>();
  let bytes = 0;
  const add = (arr: ArrayBufferView | undefined): void => {
    if (!arr || seen.has(arr.buffer)) return;
    seen.add(arr.buffer);
    bytes += arr.byteLength;
  };
  for (const attribute of Object.values(geometry.attributes)) {
    const a = attribute as { array?: ArrayBufferView; data?: { array: ArrayBufferView } };
    add(a.data ? a.data.array : a.array);
  }
  add(geometry.index?.array as ArrayBufferView | undefined);
  return bytes;
}

const SERIES = 10;
const POINTS = scaled(100_000, 100);

function walks(): { x: Float64Array; ys: Float64Array[]; lo: number; hi: number } {
  const random = rng(5);
  const normal = gaussian(random);
  const x = Float64Array.from({ length: POINTS }, (_, i) => i);
  let lo = Infinity;
  let hi = -Infinity;
  const ys = Array.from({ length: SERIES }, (_, s) => {
    const y = new Float64Array(POINTS);
    let v = s * 40;
    for (let i = 0; i < POINTS; i++) {
      v += normal();
      y[i] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return y;
  });
  return { x, ys, lo, hi };
}

interface Impl {
  name: string;
  build(): Object3D[];
  setTransform(t: DataTransform): void;
  bytes(): number;
  dispose(): void;
}

function panTransform(root: RenderRoot, lo: number, hi: number, phase: number): DataTransform {
  const { width, height } = root.size;
  const zoom = 1.5; // show 2/3 of the x range so panning moves content
  const scaleX = (width * zoom) / POINTS;
  const scaleY = (height - 20) / (hi - lo);
  return {
    scaleX,
    scaleY,
    offsetX: -((Math.sin(phase) + 1) / 2) * (width * (zoom - 1)),
    offsetY: 10 - lo * scaleY,
  };
}

const PALETTE: RGBA[] = [
  [0.12, 0.47, 0.71, 1],
  [1, 0.5, 0.05, 1],
  [0.17, 0.63, 0.17, 1],
  [0.84, 0.15, 0.16, 1],
  [0.58, 0.4, 0.74, 1],
  [0.55, 0.34, 0.29, 1],
  [0.89, 0.47, 0.76, 1],
  [0.5, 0.5, 0.5, 1],
  [0.74, 0.74, 0.13, 1],
  [0.09, 0.75, 0.81, 1],
];

function ours(root: RenderRoot, data: ReturnType<typeof walks>, dash: LineDash): Impl {
  let lines: LinePrimitive[] = [];
  return {
    name: `LinePrimitive (${dash})`,
    build() {
      lines = data.ys.map(
        (y, s) =>
          new LinePrimitive(root.context, {
            x: data.x,
            y,
            color: PALETTE[s]!,
            width: 1.5,
            dash,
          }),
      );
      return lines.map((l) => l.object);
    },
    setTransform(t) {
      for (const l of lines) l.setTransform(t);
    },
    bytes: () => lines.reduce((sum, l) => sum + geometryBytes(l.object.geometry), 0),
    dispose() {
      for (const l of lines) l.dispose();
    },
  };
}

function line2(data: ReturnType<typeof walks>, dashed: boolean): Impl {
  let lines: Line2[] = [];
  return {
    name: `Line2 (${dashed ? 'dashed' : 'solid'})`,
    build() {
      lines = data.ys.map((y, s) => {
        const positions = new Float32Array(POINTS * 3);
        for (let i = 0; i < POINTS; i++) {
          positions[i * 3] = data.x[i]!;
          positions[i * 3 + 1] = y[i]!;
        }
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: srgb(PALETTE[s]!),
          linewidth: 1.5,
          worldUnits: false,
          dashed,
          dashSize: 4.5,
          gapSize: 4.5,
        });
        const line = new Line2(geometry, material);
        if (dashed) line.computeLineDistances();
        line.frustumCulled = false;
        return line;
      });
      return lines;
    },
    setTransform(t) {
      for (const l of lines) {
        l.scale.set(t.scaleX, t.scaleY, 1);
        l.position.set(t.offsetX, t.offsetY, 0);
      }
    },
    bytes: () => lines.reduce((sum, l) => sum + geometryBytes(l.geometry), 0),
    dispose() {
      for (const l of lines) {
        l.geometry.dispose();
        l.material.dispose();
        l.removeFromParent();
      }
    },
  };
}

async function perf(page: SpikePage, reps: number): Promise<void> {
  const data = walks();
  const factories: ((root: RenderRoot) => Impl)[] = [
    (root) => ours(root, data, 'solid'),
    () => line2(data, false),
    (root) => ours(root, data, 'dash'),
    () => line2(data, true),
  ];
  for (const factory of factories) {
    const build: number[] = [];
    const fps: number[] = [];
    const cpu: number[] = [];
    const gpu: number[] = [];
    const p95: number[] = [];
    const synced: number[] = [];
    let bytes = 0;
    let calls = 0;
    let name = '';
    for (let r = 0; r < reps; r++) {
      const div = document.createElement('div');
      div.style.cssText = 'position:absolute;inset:0';
      page.host.appendChild(div);
      const root = createRenderRoot(div, { background: [1, 1, 1, 1], overlay: false });
      const gl = root.renderer.getContext() as WebGL2RenderingContext;
      if (!page.record.env) page.record.env = await collectEnv(gl, root.canvas);
      const vp = root.addViewport({ rect: { x: 0, y: 0, ...root.size } });
      // Warm the shader program so build time measures data work, not compilation.
      const impl = factory(root);
      name = impl.name;
      await yieldTask();
      const t0 = performance.now();
      for (const o of impl.build()) vp.scene.add(o);
      impl.setTransform(panTransform(root, data.lo, data.hi, 0));
      root.renderNow();
      syncGL(gl);
      build.push(performance.now() - t0);
      bytes = impl.bytes();
      calls = root.renderer.info.render.calls;
      await sleep(150);
      const run = await runFrames(
        4000,
        (t) => impl.setTransform(panTransform(root, data.lo, data.hi, t / 1000)),
        () => root.renderNow(),
        { gl },
      );
      fps.push(run.fps);
      cpu.push(run.cpu.median);
      p95.push(run.frame.p95);
      synced.push(run.frame.median);
      if (run.gpu) gpu.push(run.gpu.median);
      impl.dispose();
      root.destroy();
      div.remove();
      await sleep(150);
    }
    const result = {
      build: summarize(build),
      firstBuild: round(build[0]!),
      fps: summarize(fps),
      frameP95: summarize(p95),
      cpuPerFrame: summarize(cpu),
      gpuPerFrame: summarize(gpu),
      syncedFrame: summarize(synced),
      geometryMB: round(bytes / 2 ** 20, 1),
      drawCalls: calls,
    };
    page.set(name, result);
    page.log(
      `${name}: build ${fmt(result.build)} · pan ${fmt(result.fps, 'fps')} · p95 ${fmt(result.frameP95)} · ` +
        `CPU ${fmt(result.cpuPerFrame)} · GPU ${fmt(result.gpuPerFrame)} · synced ${fmt(result.syncedFrame)} · ` +
        `${result.geometryMB} MB geometry · ${calls} draw calls`,
    );
  }
}

async function main(page: SpikePage, disposers: (() => void)[]): Promise<void> {
  const q = new URLSearchParams(window.location.search);
  const mode = q.get('mode') ?? 'quality';
  if (mode === 'perf') {
    await sleep(300);
    await perf(page, Math.max(2, Number(q.get('reps')) || 3));
    return;
  }
  const root = createRenderRoot(page.host, { background: [1, 1, 1, 1], overlay: false });
  disposers.push(() => root.destroy());
  const vp = root.addViewport({ rect: { x: 0, y: 0, ...root.size } });
  buildQualityCard(root, vp);
  root.renderNow();
  window.__spikeCapture = () => {
    root.renderNow();
    return root.canvas.toDataURL('image/png');
  };
  disposers.push(() => delete window.__spikeCapture);
  page.record.env = await collectEnv(root.renderer.getContext(), root.canvas);
  page.log(`Left: LinePrimitive · Right: Line2 · DPR ${root.pixelRatio}`);
}

export function run(el: HTMLElement): ExampleHandle {
  const q = new URLSearchParams(window.location.search);
  const size =
    (q.get('mode') ?? 'quality') === 'quality'
      ? { width: Number(q.get('w')) || 800, height: Number(q.get('h')) || 520 }
      : undefined;
  const page = createSpikePage(el, 'b-lines', size);
  const disposers: (() => void)[] = [];
  let disposed = false;
  main(page, disposers).then(
    () => {
      if (!disposed) page.done();
    },
    (error: unknown) => page.fail(error),
  );
  return {
    ready: Promise.resolve(),
    dispose() {
      disposed = true;
      for (const d of disposers) d();
      page.dispose();
    },
  };
}
