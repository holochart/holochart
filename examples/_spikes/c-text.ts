import {
  createRenderRoot,
  createTextPrimitive,
  type DataTransform,
  type RenderRoot,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import {
  collectEnv,
  createSpikePage,
  fmt,
  heapMB,
  yieldTask,
  round,
  runFrames,
  settleHeap,
  sleep,
  summarize,
  syncGL,
  type SpikePage,
} from './env.ts';

/**
 * Spike C (E0.7, ADR-005): 2,000 tick-like labels.
 *
 * - WebGL: our `TextPrimitive` (troika `BatchedText`, E2.9): cold and warm sync time until
 *   `ready`, update cost when 100 labels change, pan cost (setTransform every frame), draw calls,
 *   JS heap, SDF atlas size.
 * - DOM overlay: 2,000 absolutely positioned spans: creation, 100-label update, pan (per-span
 *   transform every frame), JS heap. DOM times include forced style + layout but not paint or
 *   compositing (the benchmark may run in a hidden pane where nothing is painted).
 */
export const meta: ExampleMeta = {
  title: 'Spike C: 2,000 labels',
  description: 'troika BatchedText vs DOM overlay: sync, update, pan, draw calls, memory.',
  tags: ['spike', 'no-visual-test'],
};

const COUNT = 2000;
const COLS = 40;

function tickText(random: () => number, i: number): string {
  switch (i % 5) {
    case 0:
      return (random() * 10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    case 1:
      return (random() * 2 - 1).toFixed(2);
    case 2:
      return `2024-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`;
    case 3:
      return `${(random() * 999).toFixed(1)}k`;
    default:
      return `${(random() * 9).toFixed(1)}e−${Math.floor(random() * 9)}`;
  }
}

function labelTexts(seed: number): string[] {
  const random = rng(seed);
  return Array.from({ length: COUNT }, (_, i) => tickText(random, i));
}

/** Grid positions in px (bottom-left origin). */
function gridPositions(width: number, height: number): { x: number[]; y: number[] } {
  const rows = Math.ceil(COUNT / COLS);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    x.push(((i % COLS) + 0.5) * (width / COLS));
    y.push((Math.floor(i / COLS) + 0.5) * (height / rows));
  }
  return { x, y };
}

function panTransform(phase: number): DataTransform {
  return { scaleX: 1, scaleY: 1, offsetX: Math.sin(phase) * 40, offsetY: Math.cos(phase) * 10 };
}

function atlasInfo(text: TextPrimitive): { width: number; height: number; MB: number } | null {
  const info = (
    text.object as unknown as {
      _textRenderInfo?: { sdfTexture?: { image?: { width: number; height: number } } };
    }
  )._textRenderInfo;
  const image = info?.sdfTexture?.image;
  if (!image) return null;
  return {
    width: image.width,
    height: image.height,
    MB: round((image.width * image.height * 4) / 2 ** 20, 2),
  };
}

async function webgl(page: SpikePage, root: RenderRoot, reps: number): Promise<void> {
  const gl = root.renderer.getContext() as WebGL2RenderingContext;
  const vp = root.addViewport({ rect: { x: 0, y: 0, ...root.size } });
  const { x, y } = gridPositions(root.size.width, root.size.height);
  const style = { font: { family: 'Inter', size: 11 }, color: [0.16, 0.25, 0.37, 1] as const };
  const makeLabels = (texts: string[]): TextLabel[] =>
    texts.map((text, i) => ({ text, x: x[i]!, y: y[i]! }));

  const timeSync = async (
    create: () => TextPrimitive,
  ): Promise<{ text: TextPrimitive; create: number; ready: number }> => {
    const t0 = performance.now();
    const text = create();
    const t1 = performance.now();
    await text.ready;
    root.renderNow();
    syncGL(gl);
    return { text, create: t1 - t0, ready: performance.now() - t0 };
  };

  await settleHeap();
  const heap0 = heapMB();
  // Cold: first text in the page (font fetch + parse, worker start, glyph SDF generation).
  const cold = await timeSync(() =>
    createTextPrimitive(root.context, { labels: makeLabels(labelTexts(1)), style }),
  );
  vp.add(cold.text);
  root.renderNow();
  const calls = root.renderer.info.render.calls;
  await settleHeap();
  const heap1 = heapMB();
  const atlas = atlasInfo(cold.text);
  page.log(
    `WebGL cold: create ${round(cold.create)} ms · ready+frame ${round(cold.ready)} ms · ` +
      `${calls} draw call(s) · heap +${heap0 !== null && heap1 !== null ? round(heap1 - heap0, 1) : '?'} MB · ` +
      `atlas ${atlas ? `${atlas.width}×${atlas.height} (${atlas.MB} MB RGBA)` : '?'}`,
  );

  // Warm: new primitives with already-seen glyphs (same and different strings).
  const warmSame: number[] = [];
  const warmNew: number[] = [];
  for (let r = 0; r < reps; r++) {
    const a = await timeSync(() =>
      createTextPrimitive(root.context, { labels: makeLabels(labelTexts(1)), style }),
    );
    warmSame.push(a.ready);
    a.text.dispose();
    const b = await timeSync(() =>
      createTextPrimitive(root.context, { labels: makeLabels(labelTexts(100 + r)), style }),
    );
    warmNew.push(b.ready);
    b.text.dispose();
    await yieldTask();
  }
  page.log(
    `WebGL warm 2,000 labels → ready+frame: same strings ${fmt(summarize(warmSame))} · ` +
      `new strings ${fmt(summarize(warmNew))}`,
  );

  // Update 100 labels' text.
  const text = cold.text;
  let texts = labelTexts(1);
  const upd: number[] = [];
  const updReady: number[] = [];
  const random = rng(42);
  for (let r = 0; r < reps + 1; r++) {
    texts = texts.slice();
    for (let k = 0; k < 100; k++) {
      const i = Math.floor(random() * COUNT);
      texts[i] = tickText(random, i);
    }
    await yieldTask();
    const t0 = performance.now();
    text.update({ labels: makeLabels(texts) });
    const t1 = performance.now();
    await text.ready;
    root.renderNow();
    syncGL(gl);
    const t2 = performance.now();
    if (r > 0) {
      upd.push(t1 - t0);
      updReady.push(t2 - t0);
    }
  }
  page.log(
    `WebGL update 100 of 2,000: update() ${fmt(summarize(upd))} · until ready+frame ${fmt(summarize(updReady))}`,
  );

  // Pan: every label moves every frame.
  const pans = [];
  for (let r = 0; r < Math.min(reps, 3); r++) {
    pans.push(
      await runFrames(
        3000,
        (t) => text.setTransform(panTransform(t / 500)),
        () => root.renderNow(),
        { gl },
      ),
    );
  }
  const pan = {
    fps: summarize(pans.map((p) => p.fps)),
    frame: summarize(pans.map((p) => p.frame.median)),
    p95: summarize(pans.map((p) => p.frame.p95)),
    cpu: summarize(pans.map((p) => p.cpu.median)),
    gpu: summarize(pans.flatMap((p) => (p.gpu ? [p.gpu.median] : []))),
  };
  page.log(
    `WebGL pan: ${fmt(pan.fps, 'fps')} · synced frame ${fmt(pan.frame)} (p95 ${fmt(pan.p95)}) · ` +
      `CPU/frame ${fmt(pan.cpu)} · GPU/frame ${fmt(pan.gpu)}`,
  );
  page.set('webgl', {
    cold: { create: round(cold.create), readyFrame: round(cold.ready) },
    drawCalls: calls,
    heapDeltaMB: heap0 !== null && heap1 !== null ? round(heap1 - heap0, 1) : null,
    atlas,
    warmSame: summarize(warmSame),
    warmNew: summarize(warmNew),
    update100: { update: summarize(upd), readyFrame: summarize(updReady) },
    pan,
  });
  vp.remove(text);
}

async function dom(page: SpikePage, width: number, height: number, reps: number): Promise<void> {
  const layer = document.createElement('div');
  layer.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;font:11px Inter,system-ui,sans-serif;color:#293f5e;contain:strict`;
  page.host.appendChild(layer);
  const { x, y } = gridPositions(width, height);
  await settleHeap();
  const heap0 = heapMB();
  const create: number[] = [];
  let spans: HTMLSpanElement[] = [];
  const texts = labelTexts(1);
  for (let r = 0; r < reps + 1; r++) {
    layer.replaceChildren();
    await yieldTask();
    const t0 = performance.now();
    spans = texts.map((text, i) => {
      const s = document.createElement('span');
      s.textContent = text;
      s.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;transform:translate(${x[i]}px,${height - y[i]!}px)`;
      return s;
    });
    layer.append(...spans);
    void layer.offsetHeight; // style + layout
    spans[spans.length - 1]!.getBoundingClientRect();
    if (r > 0) create.push(performance.now() - t0);
  }
  await settleHeap();
  const heap1 = heapMB();
  page.log(
    `DOM create 2,000 spans (+style/layout): ${fmt(summarize(create))} · ` +
      `heap +${heap0 !== null && heap1 !== null ? round(heap1 - heap0, 1) : '?'} MB (DOM nodes are mostly outside the JS heap)`,
  );

  const random = rng(42);
  const upd: number[] = [];
  for (let r = 0; r < reps + 1; r++) {
    await yieldTask();
    const t0 = performance.now();
    for (let k = 0; k < 100; k++) {
      const i = Math.floor(random() * COUNT);
      spans[i]!.textContent = tickText(random, i);
    }
    void layer.offsetHeight;
    spans[0]!.getBoundingClientRect();
    if (r > 0) upd.push(performance.now() - t0);
  }
  page.log(`DOM update 100 of 2,000 (+style/layout): ${fmt(summarize(upd))}`);

  const pans = [];
  for (let r = 0; r < Math.min(reps, 3); r++) {
    pans.push(
      await runFrames(
        3000,
        (t) => {
          const p = panTransform(t / 500);
          for (let i = 0; i < COUNT; i++) {
            spans[i]!.style.transform =
              `translate(${x[i]! + p.offsetX}px,${height - y[i]! - p.offsetY}px)`;
          }
        },
        // Force style recalc + layout so it is inside the measured time (paint/composite are not).
        () => void layer.offsetHeight,
      ),
    );
  }
  const pan = {
    fps: summarize(pans.map((p) => p.fps)),
    frame: summarize(pans.map((p) => p.frame.median)),
    p95: summarize(pans.map((p) => p.frame.p95)),
  };
  page.log(
    `DOM pan (per-span transform, JS + style/layout only): ${fmt(pan.frame)} per frame (p95 ${fmt(pan.p95)}) · ` +
      `${fmt(pan.fps, 'fps')} ceiling before paint/composite`,
  );
  page.set('dom', {
    create: summarize(create),
    heapDeltaMB: heap0 !== null && heap1 !== null ? round(heap1 - heap0, 1) : null,
    update100: summarize(upd),
    pan,
  });
  layer.remove();
}

async function main(page: SpikePage, disposers: (() => void)[]): Promise<void> {
  useExampleFonts();
  await sleep(300);
  const q = new URLSearchParams(window.location.search);
  const reps = Math.max(2, Number(q.get('reps')) || 5);
  const root = createRenderRoot(page.host, { background: [1, 1, 1, 1], overlay: false });
  disposers.push(() => root.destroy());
  page.record.env = await collectEnv(root.renderer.getContext(), root.canvas);
  page.log(
    `GPU: ${page.record.env.glRenderer} · DPR ${root.pixelRatio} · canvas ${page.record.env.canvasCss} CSS · ` +
      `refresh ≈ ${page.record.env.refreshHz} Hz · heap API ${heapMB() === null ? 'no' : 'yes'}`,
  );
  const order = q.get('order') === 'dom-first' ? ['dom', 'webgl'] : ['webgl', 'dom'];
  for (const which of order) {
    if (which === 'webgl') await webgl(page, root, reps);
    else {
      root.renderNow();
      await dom(page, root.size.width, root.size.height, reps);
    }
  }
}

export function run(el: HTMLElement): ExampleHandle {
  const page = createSpikePage(el, 'c-text');
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
