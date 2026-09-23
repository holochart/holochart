import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three';
import {
  createMarkers,
  createRenderRoot,
  PointIndex,
  type Colorscale,
  type DataTransform,
  type MarkerSet,
  type RenderRoot,
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
  settleHeap,
  sleep,
  summarize,
  syncGL,
  type SpikePage,
  scaled,
} from './env.ts';

/**
 * Spike A (E0.7): instanced SDF markers at scale, measured on the real `MarkerSet` (E2.4).
 *
 * 1. 100k first render (plan G5, < 300 ms): new render root + markers + first frame, GPU-synced.
 * 2. 1M pan (plan G5 / M0 exit, ≥ 50 fps): back-to-back GPU-synced pan frames (throughput fps,
 *    not vsync-capped) with CPU and GPU (timer query) time per frame, at marker sizes 3 and 8 px.
 * 3. 1M restyle color (plan E16.3, < 16 ms): colorscale values, explicit RGBA, constant color.
 * 4. CPU hover index on 1M (ADR-010): `PointIndex` build, nearest, x-band, radius queries.
 */
export const meta: ExampleMeta = {
  title: 'Spike A: 1M markers',
  description: 'Pan FPS, 100k first render, 1M restyle, and CPU hover index timings.',
  tags: ['spike', 'no-visual-test'],
};

const COLORSCALE: Colorscale = [
  [0, [0.05, 0.03, 0.53, 1]],
  [0.5, [0.8, 0.28, 0.47, 1]],
  [1, [0.94, 0.98, 0.13, 1]],
];

interface Cloud {
  x: Float64Array;
  y: Float64Array;
  value: Float32Array;
}

/** Gaussian cloud (dense core, heavy overdraw) or `&dist=uniform` (±4σ square, even coverage). */
function cloud(count: number, seed: number): Cloud {
  const random = rng(seed);
  const uniform = new URLSearchParams(window.location.search).get('dist') === 'uniform';
  const normal = uniform ? () => random() * 8 - 4 : gaussian(random);
  const x = new Float64Array(count);
  const y = new Float64Array(count);
  const value = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = normal();
    y[i] = normal();
    value[i] = random();
  }
  return { x, y, value };
}

function panTransform(root: RenderRoot, phase: number): DataTransform {
  const { width, height } = root.size;
  const s = Math.min(width, height) / 8;
  return {
    scaleX: s,
    scaleY: s,
    offsetX: width / 2 + Math.sin(phase) * width * 0.2,
    offsetY: height / 2 + Math.cos(phase * 0.7) * height * 0.1,
  };
}

function glOf(root: RenderRoot): WebGL2RenderingContext {
  return root.renderer.getContext() as WebGL2RenderingContext;
}

function mountRoot(page: SpikePage): { root: RenderRoot; div: HTMLDivElement } {
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;inset:0';
  page.host.appendChild(div);
  const root = createRenderRoot(div, { background: [1, 1, 1, 1], overlay: false });
  return { root, div };
}

async function firstRender100k(page: SpikePage, reps: number): Promise<void> {
  const data = cloud(scaled(100_000), 11);
  const total: number[] = [];
  const createRoot: number[] = [];
  const createMarkersMs: number[] = [];
  const firstFrame: number[] = [];
  const warmTotal: number[] = [];
  for (let r = 0; r < reps; r++) {
    await sleep(100);
    const t0 = performance.now();
    const { root, div } = mountRoot(page);
    const vp = root.addViewport({ rect: { x: 0, y: 0, ...root.size } });
    const t1 = performance.now();
    const markers = createMarkers(root.context, {
      x: data.x,
      y: data.y,
      colorValues: data.value,
      colorscale: COLORSCALE,
      size: 6,
    });
    vp.add(markers);
    markers.setTransform(panTransform(root, 0));
    const t2 = performance.now();
    root.renderNow();
    syncGL(glOf(root));
    const t3 = performance.now();
    createRoot.push(t1 - t0);
    createMarkersMs.push(t2 - t1);
    firstFrame.push(t3 - t2);
    total.push(t3 - t0);

    // Warm: a second 100k set on the same (already compiled) root.
    await yieldTask();
    const w0 = performance.now();
    const again = createMarkers(root.context, {
      x: data.x,
      y: data.y,
      colorValues: data.value,
      colorscale: COLORSCALE,
      size: 6,
    });
    vp.remove(markers);
    vp.add(again);
    again.setTransform(panTransform(root, 0));
    root.renderNow();
    syncGL(glOf(root));
    warmTotal.push(performance.now() - w0);

    root.destroy();
    div.remove();
  }
  const result = {
    coldFirstRep: round(total[0]!),
    total: summarize(total),
    createRoot: summarize(createRoot),
    createMarkers: summarize(createMarkersMs),
    firstFrameSynced: summarize(firstFrame),
    warmRootNewMarkers: summarize(warmTotal),
  };
  page.set('firstRender100k', result);
  page.log(
    `100k first render (new root+context → first synced frame): ${fmt(result.total)}; ` +
      `first rep ${result.coldFirstRep} ms`,
  );
  page.log(
    `  root ${fmt(result.createRoot)} · createMarkers ${fmt(result.createMarkers)} · ` +
      `first frame ${fmt(result.firstFrameSynced)} · warm root ${fmt(result.warmRootNewMarkers)}`,
  );
}

async function pan1M(
  page: SpikePage,
  root: RenderRoot,
  markers: MarkerSet,
  size: number,
  reps: number,
): Promise<void> {
  markers.update({ size });
  root.renderNow();
  await sleep(200);
  const gl = glOf(root);
  const runs = [];
  for (let r = 0; r < reps; r++) {
    runs.push(
      await runFrames(
        4000,
        (t) => markers.setTransform(panTransform(root, t / 1000)),
        () => root.renderNow(),
        { gl },
      ),
    );
    await sleep(200);
  }
  const result = {
    size,
    drawCalls: root.renderer.info.render.calls,
    fps: summarize(runs.map((r) => r.fps)),
    frameMedian: summarize(runs.map((r) => r.frame.median)),
    frameP95: summarize(runs.map((r) => r.frame.p95)),
    cpuPerFrame: summarize(runs.map((r) => r.cpu.median)),
    gpuPerFrame: summarize(runs.flatMap((r) => (r.gpu ? [r.gpu.median] : []))),
  };
  page.set(`pan1M_size${size}`, result);
  page.log(
    `1M pan, size ${size}px: ${fmt(result.fps, 'fps')} · synced frame ${fmt(result.frameMedian)} ` +
      `(p95 ${fmt(result.frameP95)}) · CPU/frame ${fmt(result.cpuPerFrame)} · ` +
      `GPU/frame ${fmt(result.gpuPerFrame)} · ${result.drawCalls} draw call(s)`,
  );
}

/**
 * Control: three.js `Points` (gl_POINTS, trivial fragment shader) with the same 1M positions and
 * the same on-screen quad size as the marker quads (size + 2 px AA margin), to separate hardware
 * fill-rate limits from our shader's cost.
 */
async function baselinePoints(
  page: SpikePage,
  root: RenderRoot,
  markers: MarkerSet,
  data: Cloud,
  size: number,
  reps: number,
): Promise<void> {
  const t = panTransform(root, 0);
  const pos = new Float32Array(data.x.length * 3);
  for (let i = 0; i < data.x.length; i++) {
    pos[i * 3] = data.x[i]! * t.scaleX + t.offsetX;
    pos[i * 3 + 1] = data.y[i]! * t.scaleY + t.offsetY;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  const material = new PointsMaterial({
    size: size + 2,
    sizeAttenuation: false,
    color: 0x3355aa,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const vp = root.viewports[0]!;
  markers.object.visible = false;
  vp.scene.add(points);
  const gl = glOf(root);
  const runs = [];
  for (let r = 0; r < reps; r++) {
    runs.push(
      await runFrames(
        3000,
        (ms) => {
          const p = panTransform(root, ms / 1000);
          points.position.set(p.offsetX - t.offsetX, p.offsetY - t.offsetY, 0);
        },
        () => root.renderNow(),
        { gl },
      ),
    );
  }
  vp.scene.remove(points);
  geometry.dispose();
  material.dispose();
  markers.object.visible = true;
  const result = {
    quadPx: size + 2,
    fps: summarize(runs.map((r) => r.fps)),
    frameMedian: summarize(runs.map((r) => r.frame.median)),
    gpuPerFrame: summarize(runs.flatMap((r) => (r.gpu ? [r.gpu.median] : []))),
  };
  page.set(`baselinePoints_size${size}`, result);
  page.log(
    `control: three Points ${size + 2}px (same quad area as ${size}px markers): ${fmt(result.fps, 'fps')} · ` +
      `GPU/frame ${fmt(result.gpuPerFrame)}`,
  );
}

async function restyle1M(
  page: SpikePage,
  root: RenderRoot,
  markers: MarkerSet,
  data: Cloud,
  reps: number,
): Promise<void> {
  const gl = glOf(root);
  const count = data.x.length;
  const altValues = [data.value, Float32Array.from(data.value, (v) => 1 - v)];
  const rgbaA = new Float32Array(count * 4);
  const rgbaB = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const v = data.value[i]!;
    const k = i * 4;
    rgbaA[k] = v;
    rgbaA[k + 1] = 0.3;
    rgbaA[k + 2] = 1 - v;
    rgbaA[k + 3] = 1;
    rgbaB[k] = 1 - v;
    rgbaB[k + 1] = 0.6;
    rgbaB[k + 2] = v;
    rgbaB[k + 3] = 1;
  }
  const measure = (
    apply: (r: number) => void,
  ): { update: number[]; render: number[]; synced: number[] } => {
    const update: number[] = [];
    const render: number[] = [];
    const synced: number[] = [];
    for (let r = 0; r < reps; r++) {
      const t0 = performance.now();
      apply(r);
      const t1 = performance.now();
      root.renderNow(); // includes the buffer upload (bufferSubData) on the CPU side
      const t2 = performance.now();
      syncGL(gl);
      const t3 = performance.now();
      update.push(t1 - t0);
      render.push(t2 - t1);
      synced.push(t3 - t0);
    }
    // The first two samples warm up JIT and (for mode switches) reallocate: excluded.
    return { update: update.slice(2), render: render.slice(2), synced: synced.slice(2) };
  };
  // Colorscale mode: new per-point values (Plotly restyle of marker.color numeric array).
  markers.update({ colorValues: data.value, colorscale: COLORSCALE, size: 3 });
  root.renderNow();
  await yieldTask();
  await settleHeap();
  // Reference: a frame with no data change, to separate upload cost from draw cost.
  const plain = measure(() => {});
  await settleHeap();
  const values = measure((r) => markers.update({ colorValues: altValues[r % 2]! }));
  await settleHeap();
  // Explicit per-point RGBA (first call switches mode and reallocates; excluded).
  const explicit = measure((r) =>
    markers.update({ colorValues: null, color: r % 2 ? rgbaB : rgbaA }),
  );
  await settleHeap();
  const single = measure((r) =>
    markers.update({ color: r % 2 ? [0.8, 0.1, 0.1, 1] : [0.1, 0.1, 0.8, 1] }),
  );
  const result = {
    renderOnlySynced: summarize(plain.synced),
    renderOnlyCall: summarize(plain.render),
    colorValues: {
      update: summarize(values.update),
      render: summarize(values.render),
      synced: summarize(values.synced),
    },
    explicitRGBA: {
      update: summarize(explicit.update),
      render: summarize(explicit.render),
      synced: summarize(explicit.synced),
    },
    constantColor: {
      update: summarize(single.update),
      render: summarize(single.render),
      synced: summarize(single.synced),
    },
  };
  page.set('restyle1M', result);
  page.log(`1M frame with no change (reference): ${fmt(result.renderOnlySynced)}`);
  page.log(
    `1M restyle colorValues: update ${fmt(result.colorValues.update)} · render call ${fmt(result.colorValues.render)} · +frame ${fmt(result.colorValues.synced)}`,
  );
  page.log(
    `1M restyle RGBA array: update ${fmt(result.explicitRGBA.update)} · render call ${fmt(result.explicitRGBA.render)} · +frame ${fmt(result.explicitRGBA.synced)}`,
  );
  page.log(
    `1M restyle constant color: update ${fmt(result.constantColor.update)} · render call ${fmt(result.constantColor.render)} · +frame ${fmt(result.constantColor.synced)}`,
  );
}

function hoverIndex(page: SpikePage, root: RenderRoot, data: Cloud, reps: number): void {
  const count = data.x.length;
  const t = panTransform(root, 0);
  // Pixel-space coordinates (ADR-010: hover queries run in px).
  const px = new Float64Array(count);
  const py = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    px[i] = data.x[i]! * t.scaleX + t.offsetX;
    py[i] = data.y[i]! * t.scaleY + t.offsetY;
  }
  const build: number[] = [];
  let index: PointIndex | null = null;
  for (let r = 0; r < reps; r++) {
    index = new PointIndex(px, py);
    const t0 = performance.now();
    index.nearest(0, 0);
    build.push(performance.now() - t0);
  }
  const idx = index!;
  const random = rng(99);
  const { width, height } = root.size;
  const Q = 2000;
  const qx = Array.from({ length: Q }, () => random() * width);
  const qy = Array.from({ length: Q }, () => random() * height);
  const time = (fn: (i: number) => unknown): { perQueryUs: number; hits: number } => {
    let hits = 0;
    const t0 = performance.now();
    for (let i = 0; i < Q; i++) {
      const res = fn(i);
      hits += Array.isArray(res) ? res.length : res === -1 ? 0 : 1;
    }
    return {
      perQueryUs: round(((performance.now() - t0) * 1000) / Q, 1),
      hits: round(hits / Q, 1),
    };
  };
  const nearest20 = time((i) => idx.nearest(qx[i]!, qy[i]!, 20));
  const nearestAny = time((i) => idx.nearest(qx[i]!, qy[i]!));
  const radius = time((i) => idx.withinRadius(qx[i]!, qy[i]!, 20));
  const xBand = time((i) => idx.withinRect(qx[i]! - 1, -1e9, qx[i]! + 1, 1e9));
  const result = { build: summarize(build), nearest20, nearestAny, radius, xBand };
  page.set('hoverIndex1M', result);
  page.log(`1M PointIndex build (lazy, first query): ${fmt(result.build)}`);
  page.log(
    `  per query: nearest(r=20) ${nearest20.perQueryUs} µs · nearest(∞) ${nearestAny.perQueryUs} µs · ` +
      `radius 20px ${radius.perQueryUs} µs (avg ${radius.hits} hits) · x-band ±1px ${xBand.perQueryUs} µs (avg ${xBand.hits} hits)`,
  );
}

async function main(page: SpikePage, disposers: (() => void)[]): Promise<void> {
  await sleep(300);
  const q = new URLSearchParams(window.location.search);
  const reps = Math.max(2, Number(q.get('reps')) || 5);
  const only = q.get('only');

  if (!only || only === 'first') await firstRender100k(page, reps + 1);

  const data = cloud(scaled(1_000_000), 7);
  const { root, div } = mountRoot(page);
  disposers.push(() => {
    root.destroy();
    div.remove();
  });
  page.record.env = await collectEnv(glOf(root), root.canvas);
  page.log(
    `GPU: ${page.record.env.glRenderer} · DPR ${root.pixelRatio} · canvas ${page.record.env.canvasCss} CSS / ` +
      `${page.record.env.canvasDevice} device px · refresh ≈ ${page.record.env.refreshHz} Hz · ` +
      `timer query ${page.record.env.timerQuery ? 'yes' : 'no'}`,
  );
  const vp = root.addViewport({ rect: { x: 0, y: 0, ...root.size } });
  // A/B switch: `&generic=1` forces the unspecialized marker shader (same pixels, slower).
  const markers = createMarkers(
    root.context,
    {
      x: data.x,
      y: data.y,
      colorValues: data.value,
      colorscale: COLORSCALE,
      size: 3,
      opacity: 0.6,
    },
    { specialize: q.get('generic') !== '1' },
  );
  vp.add(markers);
  markers.setTransform(panTransform(root, 0));
  root.renderNow();

  if (!only || only === 'pan') {
    await pan1M(page, root, markers, 3, Math.min(reps, 3));
    await pan1M(page, root, markers, 8, Math.min(reps, 3));
  }
  if (!only || only === 'pan' || only === 'baseline') {
    await baselinePoints(page, root, markers, data, 3, Math.min(reps, 3));
    await baselinePoints(page, root, markers, data, 8, Math.min(reps, 3));
  }
  if (!only || only === 'restyle') await restyle1M(page, root, markers, data, reps + 1);
  if (!only || only === 'hover') hoverIndex(page, root, data, Math.min(reps, 3));
}

export function run(el: HTMLElement): ExampleHandle {
  const page = createSpikePage(el, 'a-markers');
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
