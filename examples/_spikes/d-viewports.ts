import {
  createMarkers,
  createRenderRoot,
  LinePrimitive,
  type DataTransform,
  type MarkerSet,
  type RenderRoot,
  type RGBA,
  type Viewport,
} from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import {
  canvasSize,
  collectEnv,
  createSpikePage,
  fmt,
  heapMB,
  runFrames,
  settleHeap,
  sleep,
  summarize,
  syncGL,
  yieldTask,
  type SpikePage,
  scaled,
} from './env.ts';

/**
 * Spike D (E0.7, ADR-004): 9 subplots (3×3), each 50k markers + a 5k-point line.
 *
 * - `single`: one render root (one canvas, one WebGL2 context), 9 scissored viewports.
 * - `multi`: 9 canvases, one render root (context) each.
 *
 * Measures build + first frame, frame cost when all 9 panels pan and when only one panel changes
 * (hover-like), programs/geometries/textures, JS heap. Then probes the browser's context limit:
 * creates 1…24 render roots and records which contexts the browser loses.
 */
export const meta: ExampleMeta = {
  title: 'Spike D: 9 viewports vs 9 canvases',
  description:
    'Scissored viewports in one context vs one context per subplot; context-limit probe.',
  tags: ['spike', 'no-visual-test'],
};

const PANELS = 9;
const MARKERS = scaled(50_000, 100);
const LINE_POINTS = scaled(5000, 10);
const GAP = 8;
const PALETTE: RGBA[] = [
  [0.12, 0.47, 0.71, 0.7],
  [1, 0.5, 0.05, 0.7],
  [0.17, 0.63, 0.17, 0.7],
  [0.84, 0.15, 0.16, 0.7],
  [0.58, 0.4, 0.74, 0.7],
  [0.55, 0.34, 0.29, 0.7],
  [0.89, 0.47, 0.76, 0.7],
  [0.5, 0.5, 0.5, 0.7],
  [0.74, 0.74, 0.13, 0.7],
];

interface PanelData {
  x: Float64Array;
  y: Float64Array;
  lx: Float64Array;
  ly: Float64Array;
}

function panelData(seed: number): PanelData {
  const random = rng(seed);
  const normal = gaussian(random);
  const x = Float64Array.from({ length: MARKERS }, normal);
  const y = Float64Array.from({ length: MARKERS }, normal);
  const lx = Float64Array.from({ length: LINE_POINTS }, (_, i) => -4 + (8 * i) / LINE_POINTS);
  let v = 0;
  const ly = Float64Array.from({ length: LINE_POINTS }, () => (v += normal() * 0.05));
  return { x, y, lx, ly };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function gridRects(width: number, height: number): Rect[] {
  const w = (width - GAP * 4) / 3;
  const h = (height - GAP * 4) / 3;
  return Array.from({ length: PANELS }, (_, i) => ({
    x: GAP + (i % 3) * (w + GAP),
    y: GAP + Math.floor(i / 3) * (h + GAP),
    width: w,
    height: h,
  }));
}

function panelTransform(rect: Rect, phase: number): DataTransform {
  const s = Math.min(rect.width, rect.height) / 7;
  return {
    scaleX: s,
    scaleY: s,
    offsetX: rect.width / 2 + Math.sin(phase) * rect.width * 0.15,
    offsetY: rect.height / 2 + Math.cos(phase * 0.7) * rect.height * 0.1,
  };
}

interface Panel {
  root: RenderRoot;
  viewport: Viewport;
  markers: MarkerSet;
  line: LinePrimitive;
  rect: Rect;
}

interface Setup {
  roots: RenderRoot[];
  panels: Panel[];
  dispose(): void;
}

function addPanel(
  root: RenderRoot,
  rect: Rect,
  localRect: Rect,
  data: PanelData,
  i: number,
): Panel {
  const viewport = root.addViewport({ rect: localRect, background: [0.98, 0.98, 0.99, 1] });
  const markers = createMarkers(root.context, {
    x: data.x,
    y: data.y,
    size: 4,
    color: PALETTE[i]!,
  });
  const line = new LinePrimitive(root.context, {
    x: data.lx,
    y: data.ly,
    width: 1.5,
    color: [0.1, 0.1, 0.1, 1],
  });
  viewport.add(markers);
  viewport.add(line);
  return { root, viewport, markers, line, rect };
}

function buildSingle(host: HTMLElement, data: PanelData[]): Setup {
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;inset:0';
  host.appendChild(div);
  const root = createRenderRoot(div, { background: [0.93, 0.94, 0.96, 1], overlay: false });
  const rects = gridRects(root.size.width, root.size.height);
  const panels = rects.map((rect, i) => addPanel(root, rect, rect, data[i]!, i));
  return {
    roots: [root],
    panels,
    dispose() {
      root.destroy();
      div.remove();
    },
  };
}

function buildMulti(host: HTMLElement, data: PanelData[]): Setup {
  const rects = gridRects(host.clientWidth, host.clientHeight);
  const divs: HTMLDivElement[] = [];
  const panels = rects.map((rect, i) => {
    const div = document.createElement('div');
    div.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px`;
    host.appendChild(div);
    divs.push(div);
    const root = createRenderRoot(div, { background: [0.98, 0.98, 0.99, 1], overlay: false });
    return addPanel(
      root,
      rect,
      { x: 0, y: 0, width: root.size.width, height: root.size.height },
      data[i]!,
      i,
    );
  });
  const roots = panels.map((p) => p.root);
  return {
    roots,
    panels,
    dispose() {
      for (const r of roots) r.destroy();
      for (const d of divs) d.remove();
    },
  };
}

function gl(root: RenderRoot): WebGL2RenderingContext {
  return root.renderer.getContext() as WebGL2RenderingContext;
}

function applyAll(setup: Setup, phase: number): void {
  for (const p of setup.panels) {
    const t = panelTransform(p.rect, phase);
    p.markers.setTransform(t);
    p.line.setTransform(t);
  }
}

async function compare(page: SpikePage, data: PanelData[], reps: number): Promise<void> {
  const modes = [
    { name: 'single', build: buildSingle },
    { name: 'multi', build: buildMulti },
  ] as const;
  for (const mode of modes) {
    const build: number[] = [];
    const allFps: number[] = [];
    const allFrame: number[] = [];
    const allCpu: number[] = [];
    const oneFrame: number[] = [];
    const oneCpu: number[] = [];
    const heap: number[] = [];
    let programs = 0;
    let geometries = 0;
    let textures = 0;
    for (let r = 0; r < reps; r++) {
      await settleHeap();
      const h0 = heapMB();
      const t0 = performance.now();
      const setup = mode.build(page.host, data);
      applyAll(setup, 0);
      for (const root of setup.roots) root.renderNow();
      for (const root of setup.roots) syncGL(gl(root));
      build.push(performance.now() - t0);
      programs = setup.roots.reduce((n, root) => n + root.renderer.info.programs!.length, 0);
      geometries = setup.roots.reduce((n, root) => n + root.renderer.info.memory.geometries, 0);
      textures = setup.roots.reduce((n, root) => n + root.renderer.info.memory.textures, 0);
      await settleHeap();
      const h1 = heapMB();
      if (h0 !== null && h1 !== null) heap.push(h1 - h0);
      const syncAll = (): void => {
        for (const root of setup.roots) syncGL(gl(root));
      };

      // All 9 panels pan (linked axes / global relayout).
      const all = await runFrames(
        3000,
        (t) => applyAll(setup, t / 1000),
        () => {
          for (const root of setup.roots) root.renderNow();
        },
        { sync: syncAll },
      );
      allFps.push(all.fps);
      allFrame.push(all.frame.median);
      allCpu.push(all.cpu.median);

      // Only panel 0 changes (hover highlight / single-subplot zoom). With one context the whole
      // canvas is redrawn; with 9 contexts only one canvas is.
      const p0 = setup.panels[0]!;
      const one = await runFrames(
        3000,
        (t) => {
          const tr = panelTransform(p0.rect, t / 1000);
          p0.markers.setTransform(tr);
          p0.line.setTransform(tr);
        },
        () => p0.root.renderNow(),
        { sync: () => syncGL(gl(p0.root)) },
      );
      oneFrame.push(one.frame.median);
      oneCpu.push(one.cpu.median);
      setup.dispose();
      await sleep(200);
    }
    const result = {
      build: summarize(build),
      allPanPanels: {
        fps: summarize(allFps),
        frame: summarize(allFrame),
        cpu: summarize(allCpu),
      },
      onePanelChanges: { frame: summarize(oneFrame), cpu: summarize(oneCpu) },
      heapDeltaMB: summarize(heap),
      programs,
      geometries,
      textures,
    };
    page.set(mode.name, result);
    page.log(
      `${mode.name}: build+first frame ${fmt(result.build)} · all-pan ${fmt(result.allPanPanels.fps, 'fps')}, ` +
        `frame ${fmt(result.allPanPanels.frame)}, CPU ${fmt(result.allPanPanels.cpu)} · one-panel frame ` +
        `${fmt(result.onePanelChanges.frame)}, CPU ${fmt(result.onePanelChanges.cpu)} · heap Δ ${fmt(result.heapDeltaMB, 'MB')} · ` +
        `${programs} programs, ${geometries} geometries, ${textures} textures`,
    );
  }
}

/** Create render roots one by one and record which contexts the browser loses. */
async function contextLimit(page: SpikePage, max: number): Promise<void> {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden';
  page.host.appendChild(holder);
  const roots: RenderRoot[] = [];
  const lostAt: { root: number; whenCreating: number }[] = [];
  let firstLossAt: number | null = null;
  for (let i = 0; i < max; i++) {
    const div = document.createElement('div');
    div.style.cssText = 'width:64px;height:64px';
    holder.appendChild(div);
    const root = createRenderRoot(div, { background: [1, 0, 0, 1], overlay: false });
    const index = i;
    root.on('contextlost', () => {
      lostAt.push({ root: index, whenCreating: roots.length });
      firstLossAt ??= roots.length;
    });
    roots.push(root);
    root.renderNow();
    await sleep(50);
  }
  await sleep(500);
  const lost = roots.map((r, i) => (r.contextLost ? i : -1)).filter((i) => i >= 0);
  page.log(
    `context limit: created ${max} roots → ${lost.length} lost (indices ${lost.join(', ') || 'none'}); ` +
      `first loss when creating #${firstLossAt ?? '–'} · lost roots report contextLost=true and pause rendering`,
  );
  // destroy() calls forceContextLoss(): slots must free immediately.
  for (const r of roots) r.destroy();
  holder.replaceChildren();
  await sleep(300);
  const again: RenderRoot[] = [];
  let lostAgain = 0;
  for (let i = 0; i < 16; i++) {
    const div = document.createElement('div');
    div.style.cssText = 'width:64px;height:64px';
    holder.appendChild(div);
    const root = createRenderRoot(div, { overlay: false });
    root.on('contextlost', () => lostAgain++);
    root.renderNow();
    again.push(root);
    await yieldTask();
  }
  await sleep(500);
  page.log(`after destroy(): 16 new roots → ${lostAgain} lost (slots were released)`);
  for (const r of again) r.destroy();
  holder.remove();
  page.set('contextLimit', { created: max, lost, firstLossAt, lostAt, recreate16Lost: lostAgain });
}

async function main(page: SpikePage): Promise<void> {
  await sleep(300);
  const q = new URLSearchParams(window.location.search);
  const reps = Math.max(2, Number(q.get('reps')) || 3);
  const probe = document.createElement('canvas');
  const probeGl = probe.getContext('webgl2')!;
  page.record.env = await collectEnv(probeGl, probe);
  probeGl.getExtension('WEBGL_lose_context')?.loseContext();
  const size = canvasSize();
  page.log(
    `GPU: ${page.record.env.glRenderer} · DPR ${Math.min(window.devicePixelRatio, 2)} · figure ${size.width}×${size.height} CSS · ` +
      `9 panels × (${MARKERS / 1000}k markers + ${LINE_POINTS / 1000}k-pt line)`,
  );
  const data = Array.from({ length: PANELS }, (_, i) => panelData(i + 1));
  if (q.get('only') !== 'limit') await compare(page, data, reps);
  if (q.get('only') !== 'compare') await contextLimit(page, Number(q.get('max')) || 24);
}

export function run(el: HTMLElement): ExampleHandle {
  const page = createSpikePage(el, 'd-viewports');
  let disposed = false;
  main(page).then(
    () => {
      if (!disposed) page.done();
    },
    (error: unknown) => page.fail(error),
  );
  return {
    ready: Promise.resolve(),
    dispose() {
      disposed = true;
      page.dispose();
    },
  };
}
