import {
  forceLayout,
  graphLayoutWorker,
  isLayoutAbort,
  layoutInWorker,
  setGraphWorkerUrl,
  type LayoutGraph,
  type LayoutResult,
  type LayoutThread,
} from '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The layout worker by itself (backlog G7): a random graph of 10,000 nodes and 50,000 links laid
 * out by the force layout through `layoutInWorker`, drawn on a bare 2D canvas each time positions
 * arrive, so the graph can be watched settling while the page stays responsive. It does not use
 * the `graph` trace: this page is about the worker, its fallback and their timings.
 *
 * The buttons run the same layout in the worker, on the main thread in slices (the fallback) and
 * in one blocking call, and the readout says how long each took, when the first positions came
 * and the longest stretch the main thread was held. `?nodes=`, `?links=` and `?ticks=` change the
 * graph. The Playwright suite drives the page through `window.__graphWorker`
 * (tests/interaction/graph-worker.spec.ts).
 */
export const meta: ExampleMeta = {
  title: 'Graph layout in a worker',
  description:
    'A 10,000-node force layout computed in a worker and drawn as its positions stream in; buttons compare the worker, the sliced main-thread fallback and a blocking call.',
  tags: ['dev', 'graph', 'worker', 'perf', 'no-visual-test'],
  size: { width: 640, height: 480 },
};

/** What a test or a button asks for. */
interface LayoutAsk {
  nodes?: number;
  links?: number;
  /** Ticks of the simulation. Default: the layout's own for the size. */
  ticks?: number;
  /** `'sync'`: one blocking call on the main thread, for comparison. Default `'auto'`. */
  thread?: 'auto' | 'main' | 'sync';
  /** Abort after this many progress reports. */
  cancelAfter?: number;
  /** Also lay out on the main thread in one call and compare the bytes. */
  compare?: boolean;
  /** Draw every progress report (default) or only the result. */
  draw?: boolean;
  /** Give the arrays to the worker instead of copies. */
  move?: boolean;
}

/** How a layout went. Times are milliseconds from the request. */
interface LayoutReport {
  thread: LayoutThread | 'sync';
  outcome: 'done' | 'aborted';
  /** Ticks at each progress report that arrived before the result. */
  progressTicks: number[];
  firstProgress: number | null;
  total: number;
  /** Time the layout computed, wherever it ran. */
  elapsed: number;
  ticks: number;
  /** The longest gap between two turns of the main thread's event loop while the layout ran. */
  longestBlock: number;
  /** The result is the bytes a blocking main-thread layout gives; `null` when not compared. */
  equalsMain: boolean | null;
  finite: boolean;
}

interface GraphWorkerHook {
  layout(ask?: LayoutAsk): Promise<LayoutReport>;
  /** Where the shared worker file is looked for; `null`: the default. */
  workerUrl(url: string | null): void;
  /** Where layouts run, once known. */
  thread(): LayoutThread | undefined;
  /** Warnings the page logged (the fallback says why there is no worker). */
  warnings: string[];
}

/** A random graph: `links` links between uniformly drawn pairs of `nodes` nodes, seeded. */
function randomGraph(nodes: number, links: number, seed = 42): LayoutGraph {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  for (let k = 0; k < links; k++) {
    const s = Math.floor(next() * nodes);
    let t = Math.floor(next() * (nodes - 1));
    if (t >= s) t++;
    source[k] = s;
    target[k] = t;
  }
  return {
    nodes,
    source,
    target,
    weight: new Float64Array(links).fill(1),
    halfWidth: new Float64Array(nodes).fill(4),
    halfHeight: new Float64Array(nodes).fill(4),
    x: new Float64Array(nodes).fill(NaN),
    y: new Float64Array(nodes).fill(NaN),
  };
}

const sameBytes = (a: Float64Array, b: Float64Array): boolean => {
  if (a.length !== b.length) return false;
  const p = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const q = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
  return true;
};

/** Links drawn at most: the picture is a check that positions arrive, not the trace. */
const MAX_LINKS_DRAWN = 20_000;

/**
 * Watches the main thread: the longest time between two turns of its event loop. A timer chain
 * is held to 4 ms by browsers, so gaps below that are noise.
 */
function watchBlocking(): () => number {
  let longest = 0;
  let last = performance.now();
  let running = true;
  const beat = (): void => {
    const time = performance.now();
    longest = Math.max(longest, time - last);
    last = time;
    if (running) setTimeout(beat, 0);
  };
  setTimeout(beat, 0);
  return () => {
    running = false;
    return Math.max(longest, performance.now() - last);
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const query = new URLSearchParams(location.search);
  const param = (name: string, fallback: number): number => {
    const value = Number(query.get(name));
    return query.has(name) && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };
  const defaults = {
    nodes: param('nodes', 10_000),
    links: param('links', 50_000),
    ticks: query.has('ticks') ? param('ticks', 300) : undefined,
  };

  el.style.position ||= 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  el.appendChild(canvas);
  const context = canvas.getContext('2d');

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:8px;left:8px;padding:6px 8px;background:rgba(255,255,255,.88);' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 32px)';
  const readout = document.createElement('span');
  readout.dataset['role'] = 'readout';
  readout.textContent = 'starting';
  el.appendChild(panel);

  const draw = (graph: LayoutGraph, positions: Pick<LayoutResult, 'x' | 'y'>): void => {
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = el.clientWidth || 640;
    const height = el.clientHeight || 480;
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    const { x, y } = positions;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < x.length; i++) {
      if (x[i]! < x0) x0 = x[i]!;
      if (x[i]! > x1) x1 = x[i]!;
      if (y[i]! < y0) y0 = y[i]!;
      if (y[i]! > y1) y1 = y[i]!;
    }
    const scale = 0.94 * Math.min(width / (x1 - x0 || 1), height / (y1 - y0 || 1));
    const px = (v: number): number => width / 2 + (v - (x0 + x1) / 2) * scale;
    const py = (v: number): number => height / 2 - (v - (y0 + y1) / 2) * scale;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.beginPath();
    const step = Math.max(1, Math.ceil(graph.source.length / MAX_LINKS_DRAWN));
    for (let k = 0; k < graph.source.length; k += step) {
      const s = graph.source[k]!;
      const t = graph.target[k]!;
      context.moveTo(px(x[s]!), py(y[s]!));
      context.lineTo(px(x[t]!), py(y[t]!));
    }
    context.strokeStyle = 'rgba(40,70,120,0.08)';
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = '#1f4e8c';
    for (let i = 0; i < x.length; i++) context.fillRect(px(x[i]!) - 1, py(y[i]!) - 1, 2, 2);
  };

  // Positions can arrive faster than they can be drawn (a tick of a small graph is well under a
  // frame). Only the latest ones are drawn, once per frame: drawing each report as it comes would
  // queue the result behind a backlog of pictures nobody sees.
  let latest: { graph: LayoutGraph; positions: Pick<LayoutResult, 'x' | 'y'> } | null = null;
  let frame = 0;
  const drawSoon = (graph: LayoutGraph, positions: Pick<LayoutResult, 'x' | 'y'>): void => {
    latest = { graph, positions };
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (latest) draw(latest.graph, latest.positions);
      latest = null;
    });
  };

  const controller = new AbortController();

  async function layout(ask: LayoutAsk = {}): Promise<LayoutReport> {
    const nodes = ask.nodes ?? defaults.nodes;
    const links = ask.links ?? defaults.links;
    const ticks = ask.ticks ?? defaults.ticks;
    const options = ticks === undefined ? {} : { ticks };
    const graph = randomGraph(nodes, links);
    // The caller's graph is gone after a moved request: keep one to draw and to compare with.
    const kept = ask.move ? randomGraph(nodes, links) : graph;
    const drawProgress = ask.draw !== false;
    const report: LayoutReport = {
      thread: ask.thread === 'sync' ? 'sync' : 'main',
      outcome: 'done',
      progressTicks: [],
      firstProgress: null,
      total: 0,
      elapsed: 0,
      ticks: 0,
      longestBlock: 0,
      equalsMain: null,
      finite: false,
    };
    readout.textContent = `laying out ${nodes} nodes, ${links} links…`;
    const abort = new AbortController();
    const stop = (): void => abort.abort();
    controller.signal.addEventListener('abort', stop);
    const blocked = watchBlocking();
    const started = performance.now();
    let result: LayoutResult | undefined;
    try {
      if (ask.thread === 'sync') {
        result = forceLayout(graph, options);
        report.elapsed = performance.now() - started;
      } else {
        result = await layoutInWorker(graph, 'force', options, {
          owner: el,
          signal: abort.signal,
          ...(ask.thread === 'main' ? { thread: 'main' as const } : {}),
          ...(ask.move ? { move: true } : {}),
          onProgress: (progress) => {
            report.firstProgress ??= performance.now() - started;
            report.progressTicks.push(progress.ticks);
            report.thread = progress.thread;
            if (drawProgress) drawSoon(kept, progress);
            readout.textContent =
              `${progress.thread}: tick ${progress.ticks} of ${progress.totalTicks}, ` +
              `alpha ${progress.alpha.toFixed(3)}`;
            if (report.progressTicks.length === ask.cancelAfter) abort.abort();
          },
          onDone: (info) => {
            report.thread = info.thread;
            report.ticks = info.ticks;
            report.elapsed = info.elapsed;
          },
        });
      }
    } catch (error) {
      if (!isLayoutAbort(error)) throw error;
      report.outcome = 'aborted';
    } finally {
      controller.signal.removeEventListener('abort', stop);
    }
    report.total = performance.now() - started;
    // One more turn of the event loop, so a block that ended with the result is counted.
    await new Promise((resolve) => setTimeout(resolve, 0));
    report.longestBlock = blocked();
    if (result) {
      report.finite = result.x.every(Number.isFinite) && result.y.every(Number.isFinite);
      latest = null;
      draw(kept, result);
      if (ask.compare) {
        const expected = forceLayout(kept, options);
        report.equalsMain = sameBytes(result.x, expected.x) && sameBytes(result.y, expected.y);
      }
    }
    readout.textContent =
      `${report.thread}: ${report.outcome} in ${report.total.toFixed(0)} ms ` +
      `(${report.ticks} ticks, computing ${report.elapsed.toFixed(0)} ms), first positions ` +
      `${report.firstProgress === null ? 'never' : `${report.firstProgress.toFixed(0)} ms`}, ` +
      `longest block ${report.longestBlock.toFixed(0)} ms`;
    return report;
  }

  const warnings: string[] = [];
  const consoleWarn = console.warn;
  console.warn = (...args: unknown[]): void => {
    warnings.push(args.map(String).join(' '));
    consoleWarn.apply(console, args);
  };

  const hook: GraphWorkerHook = {
    layout,
    workerUrl: (url) => setGraphWorkerUrl(url),
    thread: () => graphLayoutWorker().thread,
    warnings,
  };
  (window as unknown as { __graphWorker?: GraphWorkerHook }).__graphWorker = hook;

  for (const [label, thread] of [
    ['Worker', 'auto'],
    ['Main thread, sliced', 'main'],
    ['Blocking call', 'sync'],
  ] as const) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => void layout({ thread });
    panel.appendChild(button);
  }
  panel.appendChild(readout);

  // The tests ask for their own layouts (`?idle`); a person opening the page sees one at once.
  if (!query.has('idle')) void layout();

  return {
    dispose() {
      controller.abort();
      cancelAnimationFrame(frame);
      graphLayoutWorker().cancel(el);
      console.warn = consoleWarn;
      delete (window as unknown as { __graphWorker?: GraphWorkerHook }).__graphWorker;
      canvas.remove();
      panel.remove();
    },
  };
}
