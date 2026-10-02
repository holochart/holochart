import { expect, test, type Page } from '@playwright/test';

/**
 * Leak test (backlog S2.6, plan E20.6) on `_dev/interaction-leak`: every chart family is created,
 * hovered, updated (`react`, `relayout`) and destroyed (`destroy()` and `purge(el)` in turn)
 * `LEAK_CYCLES` times (10 by default), once with a WebGL context of its own and once on the shared renderer
 * (ADR-023). After a few warm-up rounds (fonts, glyph atlases, lazy chunks, the style element and
 * program caches are filled once per page), everything a chart takes must come back:
 *
 * - **GPU resources.** On the shared renderer, where a chart's leftovers no longer die with its
 *   context: three's `renderer.info.memory` (geometries, textures) and `info.programs`, and the
 *   WebGL objects alive in the context (buffers, textures, programs, shaders, framebuffers,
 *   renderbuffers, vertex arrays), counted by wrapping the context's create/delete calls, which
 *   also sees what three's counters do not. A small anchor chart keeps the shared renderer alive.
 * - **Contexts.** A dedicated chart's context is lost on destroy, and its renderer holds nothing;
 *   the shared context goes with the last chart on it. The page's live contexts stay level.
 * - **DOM and listeners.** Element count of the document; listeners on targets that outlive a
 *   chart (window, document, connected nodes, media queries, the visual viewport, `document.fonts`),
 *   counted by wrapping `addEventListener`/`removeEventListener`; Resize-, Mutation- and
 *   IntersectionObservers that were not disconnected.
 * - **Heap** (Chromium only, through the DevTools protocol, which needs no launch flag): after a
 *   forced GC, a census of live instances (`Chart`, `WebGLRenderer`, three's `Object3D`,
 *   `BufferGeometry`, `Material`, `Texture`, render targets, canvases, elements; DevTools'
 *   `queryObjects`) must be what it was, which is exact. The used heap in bytes is noisy, so it
 *   is only a coarse net for what the census has no class for: checked from
 *   {@link HEAP_MIN_CYCLES} rounds on, against {@link HEAP_BYTES_PER_CYCLE}.
 *
 * All of it needs a real browser: the unit tests' fake renderer (runtime `__testing__/fakes.ts`)
 * has no GPU bookkeeping, and the leaks worth finding are in how real three.js, the text engine
 * and the DOM are used. The counts are exact (no tolerance), so the test means as much with
 * the default `LEAK_CYCLES=10`, which local runs and PR CI use; the nightly workflow runs 100 on
 * Chromium, Firefox and WebKit.
 *
 * Every counter is read three times: after the warm-up, half way and at the end. What a round
 * leaves behind is the growth per round that shows in both halves (`gl.buffers: 2`); a counter
 * that moved once is not a leak. That growth must equal what {@link KNOWN_LEAKS} lists for the
 * case: nothing, for a clean one. A known leak is thus an exact expectation, not a tolerance: a
 * new leak fails, and so does fixing a listed one, until its entry is removed.
 */
const EXAMPLE = '_dev/interaction-leak';
const CYCLES = Math.max(2, Number(process.env.LEAK_CYCLES ?? 10));
const WARMUP = 3;
/** Rounds before the middle snapshot. */
const HALF = Math.floor(CYCLES / 2);
/** Rounds per `page.evaluate`, so a stuck round fails within one call's timeout. */
const CHUNK = 10;
/**
 * Heap growth allowed per round, after a forced GC. Measured over 100 rounds on Chromium: clean
 * families grow 12–15 kB per round (not attributed to any class in the census; DevTools shows
 * performance-timeline entries and small plain objects), and one leaked canvas with its lost
 * context (L1 below) adds ~25 kB to that. A retained chart costs hundreds of kB.
 */
const HEAP_BYTES_PER_CYCLE = 48 * 1024;
/** The byte check runs from this many rounds on; the exact counts run always. */
const HEAP_MIN_CYCLES = 50;

const FAMILIES = [
  'cartesian',
  'controls',
  'heatmap',
  'image',
  'polar',
  'pie',
  'table',
  'stats',
  'density',
  'splom',
  'parcoords',
  'parcats',
  'finance',
  'waterfall',
  'indicator',
  'hierarchy',
  'sankey',
  'scene',
  'fields',
  'volumes',
  'bar3d',
  'view3d',
] as const;
type Family = (typeof FAMILIES)[number];
type Mode = 'dedicated' | 'shared';

/** Growth per round by counter, e.g. `{ 'gl.buffers': 2 }`; `{}` is a clean case. */
type Growth = Record<string, number>;

/**
 * Leaks this test found that are not fixed yet (backlog S2.6), as the most growth per round they
 * cause. Keys are `family/mode`, or a mode's name for every family in it. Record the cause with
 * each entry, and remove the entry with the fix.
 */
const KNOWN_LEAKS: Partial<Record<Mode | `${Family}/${Mode}`, { why: string; growth: Growth }>> = {
  // L1. The text engine's glyph atlas is one texture per page, used by every renderer. three
  // registers a `dispose` listener on it per renderer and `renderer.dispose()` does not remove
  // it, so each destroyed dedicated renderer leaves a closure on the atlas that keeps its
  // (lost) WebGL context and canvas alive: ~55 kB per chart. Not on the shared renderer, which
  // registers once.
  dedicated: {
    why: 'L1: the glyph atlas texture keeps a dispose listener per destroyed renderer',
    growth: { 'destroyed.textures': 1, 'live.canvas': 1, 'live.element': 1 },
  },
  // L1b. The same through three's own page-wide DFG lookup texture, which lit (standard and
  // physical) materials use: here the listener also keeps a program, and with it the whole
  // WebGLRenderer and its internal shadow and environment objects.
  'scene/dedicated': {
    why: 'L1b: three’s DFG lookup texture keeps a dispose listener per destroyed renderer',
    growth: {
      'destroyed.textures': 2,
      'destroyed.programs': 1,
      'live.renderer': 1,
      'live.geometry': 1,
      'live.material': 4,
      'live.object3d': 4,
    },
  },
  // L2. troika's BatchedText replaces its per-glyph attributes when a batch's text changes
  // length, then disposes the geometry, which frees the new attributes' buffers and not the
  // replaced `aTroikaTextBatchMemberIndex` one. One small GL buffer per resized text batch stays
  // in the context: until it is lost on a dedicated renderer, for the page's life on the shared
  // one. The number is the family's text batches that change length in a round.
  ...Object.fromEntries(
    (
      [
        ['cartesian', 4],
        ['controls', 1],
        ['heatmap', 3],
        ['image', 2],
        ['polar', 1],
        ['pie', 2],
        ['table', 3],
        ['stats', 2],
        ['splom', 2],
        ['finance', 2],
        ['indicator', 1],
        ['hierarchy', 2],
        ['scene', 1],
        ['fields', 1],
        ['bar3d', 1],
      ] as const
    ).map(([family, buffers]) => [
      `${family}/shared`,
      {
        why: 'L2: troika BatchedText orphans a GL buffer when a text batch changes length',
        growth: { 'gl.buffers': buffers },
      },
    ]),
  ),
};

/** What the case is expected to leak per round on this browser. */
function expectedGrowth(family: Family, mode: Mode, census: boolean): Growth {
  const growth = { ...KNOWN_LEAKS[mode]?.growth, ...KNOWN_LEAKS[`${family}/${mode}`]?.growth };
  // The live-instance census needs Chromium's DevTools protocol.
  if (!census)
    for (const key of Object.keys(growth)) if (key.startsWith('live.')) delete growth[key];
  return growth;
}

/**
 * Counters that kept growing (or shrinking), per round: the smaller rate of the two halves of the
 * run. A leak grows with the rounds, so it shows in both halves; a counter that moved once (a
 * lazily created buffer, a frame that had not finished at one of the snapshots) is not one.
 */
function growthPerRound(start: Growth, middle: Growth, end: Growth): Growth {
  const out: Growth = {};
  for (const key of new Set([...Object.keys(start), ...Object.keys(middle), ...Object.keys(end)])) {
    const first = ((middle[key] ?? 0) - (start[key] ?? 0)) / HALF;
    const second = ((end[key] ?? 0) - (middle[key] ?? 0)) / (CYCLES - HALF);
    if (first > 0 && second > 0) out[key] = Math.min(first, second);
    else if (first < 0 && second < 0) out[key] = Math.max(first, second);
  }
  return out;
}

/** `{ gl: { buffers: 1 } }` → `{ 'gl.buffers': 1 }`. */
function flat(value: object, prefix = ''): Growth {
  const out: Growth = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'number') out[prefix + key] = v;
    else if (v && typeof v === 'object') Object.assign(out, flat(v as object, `${prefix}${key}.`));
  }
  return out;
}

interface GlCounts {
  buffers: number;
  textures: number;
  programs: number;
  shaders: number;
  framebuffers: number;
  renderbuffers: number;
  vertexArrays: number;
}

interface Probe {
  /** WebGL contexts created on the page that are not lost (and not collected). */
  liveContexts(): number;
  /** WebGL objects created and not deleted in `gl`. */
  gl(gl: WebGL2RenderingContext): GlCounts;
  /** Listeners on long-lived targets, as `target:type` → count. */
  listeners(): Record<string, number>;
  /** Observers that observed something and were not disconnected. */
  observers(): Record<string, number>;
}

interface Renderer {
  info: { memory: { geometries: number; textures: number }; programs: unknown[] | null };
  getContext(): WebGL2RenderingContext;
}

interface Hook {
  families: string[];
  uncovered: string[];
  prototypes: Record<string, object>;
  cycle(family: string, shared: boolean, round: number): Promise<Renderer>;
  anchor(): Promise<{ three: { renderer: Renderer; root: { shared: boolean } } }>;
  release(): void;
}

interface Snapshot {
  dom: number;
  listeners: Record<string, number>;
  observers: Record<string, number>;
  contexts: number;
  /** Shared mode: the shared renderer's counters. */
  memory?: { geometries: number; textures: number; programs: number };
  gl?: GlCounts;
}

declare global {
  interface Window {
    __leak?: Hook;
    __probe?: Probe;
    __anchor?: { three: { renderer: Renderer; root: { shared: boolean } } };
    __prototypes?: Record<string, object>;
  }
}

/** Count contexts, WebGL objects, listeners and observers from before the page's first script. */
async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // --- WebGL contexts and the objects alive in each.
    const contexts: WeakRef<WebGL2RenderingContext>[] = [];
    const seen = new WeakSet<object>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      const context = (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
      if (/^webgl/.test(type) && context && !seen.has(context)) {
        seen.add(context);
        contexts.push(new WeakRef(context as WebGL2RenderingContext));
      }
      return context;
    } as typeof getContext;

    const KINDS = {
      buffers: 'Buffer',
      textures: 'Texture',
      programs: 'Program',
      shaders: 'Shader',
      framebuffers: 'Framebuffer',
      renderbuffers: 'Renderbuffer',
      vertexArrays: 'VertexArray',
    } as const;
    type Kind = keyof typeof KINDS;
    const alive = new WeakMap<object, Record<Kind, Set<object>>>();
    const objects = (gl: object): Record<Kind, Set<object>> => {
      let sets = alive.get(gl);
      if (!sets) {
        sets = Object.fromEntries(
          Object.keys(KINDS).map((kind) => [kind, new Set<object>()]),
        ) as Record<Kind, Set<object>>;
        alive.set(gl, sets);
      }
      return sets;
    };
    const proto = WebGL2RenderingContext.prototype as unknown as Record<
      string,
      (this: object, ...args: unknown[]) => unknown
    >;
    for (const [kind, name] of Object.entries(KINDS) as [Kind, string][]) {
      const create = proto[`create${name}`]!;
      const remove = proto[`delete${name}`]!;
      proto[`create${name}`] = function (...args) {
        const object = create.apply(this, args) as object | null;
        if (object) objects(this)[kind].add(object);
        return object;
      };
      proto[`delete${name}`] = function (...args) {
        if (args[0]) objects(this)[kind].delete(args[0]);
        return remove.apply(this, args);
      };
    }

    // --- Listeners. Only the targets are kept (weakly); a listener is identified per target.
    interface Entry {
      target: WeakRef<EventTarget>;
      type: string;
    }
    const entries = new Set<Entry>();
    const registered = new WeakMap<EventTarget, Map<string, Map<unknown, Entry>>>();
    const capture = (options: unknown): boolean =>
      typeof options === 'boolean'
        ? options
        : Boolean((options as { capture?: boolean } | undefined)?.capture);
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const forget = (target: EventTarget, key: string, listener: unknown): void => {
      const byListener = registered.get(target)?.get(key);
      const entry = byListener?.get(listener);
      if (!entry) return;
      byListener!.delete(listener);
      entries.delete(entry);
    };
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      // `this` is undefined for a bare `addEventListener(...)` call, which means the window.
      const target = (this as EventTarget | undefined) ?? window;
      const once = typeof options === 'object' && options.once === true;
      if (listener && !once) {
        const key = `${type}|${capture(options)}`;
        let byKey = registered.get(target);
        if (!byKey) registered.set(target, (byKey = new Map()));
        let byListener = byKey.get(key);
        if (!byListener) byKey.set(key, (byListener = new Map()));
        if (!byListener.has(listener)) {
          const entry: Entry = { target: new WeakRef(target), type };
          byListener.set(listener, entry);
          entries.add(entry);
          const signal = typeof options === 'object' ? options.signal : undefined;
          if (signal) {
            add.call(signal, 'abort', () => forget(target, key, listener), { once: true });
          }
        }
      }
      return add.call(target, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      const target = (this as EventTarget | undefined) ?? window;
      forget(target, `${type}|${capture(options)}`, listener);
      return remove.call(target, type, listener, options);
    };
    /** A name for targets that outlive a chart; undefined for the rest (detached nodes, workers). */
    const longLived = (target: EventTarget): string | undefined => {
      if (target === window) return 'window';
      if (target === document) return 'document';
      if (target instanceof Node) {
        return target.isConnected ? target.nodeName.toLowerCase() : undefined;
      }
      if (typeof MediaQueryList !== 'undefined' && target instanceof MediaQueryList) return 'media';
      if (typeof VisualViewport !== 'undefined' && target instanceof VisualViewport) {
        return 'visualViewport';
      }
      if (target === (document.fonts as unknown)) return 'fonts';
      return undefined;
    };

    // --- Observers that were started and not disconnected.
    const observing: Record<string, number> = {};
    for (const name of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver'] as const) {
      const Base = window[name] as unknown as
        | (new (...args: unknown[]) => {
            observe(...a: unknown[]): void;
            disconnect(): void;
          })
        | undefined;
      if (!Base) continue;
      observing[name] = 0;
      const active = new WeakSet<object>();
      const Counted = class extends Base {
        override observe(...args: unknown[]): void {
          if (!active.has(this)) {
            active.add(this);
            observing[name]!++;
          }
          super.observe(...args);
        }
        override disconnect(): void {
          if (active.has(this)) {
            active.delete(this);
            observing[name]!--;
          }
          super.disconnect();
        }
      };
      (window as unknown as Record<string, unknown>)[name] = Counted;
    }

    window.__probe = {
      liveContexts: () =>
        contexts.filter((ref) => {
          const gl = ref.deref();
          return gl !== undefined && !gl.isContextLost();
        }).length,
      gl: (gl) =>
        Object.fromEntries(
          Object.entries(objects(gl)).map(([kind, set]) => [kind, set.size]),
        ) as unknown as GlCounts,
      listeners: () => {
        const counts: Record<string, number> = {};
        for (const entry of entries) {
          const target = entry.target.deref();
          const name = target && longLived(target);
          if (name) counts[`${name}:${entry.type}`] = (counts[`${name}:${entry.type}`] ?? 0) + 1;
        }
        return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
      },
      observers: () => ({ ...observing }),
    };
  });
}

async function open(page: Page): Promise<void> {
  await instrument(page);
  for (let attempt = 1; ; attempt++) {
    await page.goto(`/?example=${EXAMPLE}&size=meta`, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__leak !== undefined, undefined, { timeout: 30_000 });
      return;
    } catch (error) {
      // Vite may reload the page once after optimizing a newly discovered dependency.
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed|navigation/i.test(message) || attempt >= 2) throw error;
    }
  }
}

/** Run rounds `from`…`to - 1`; what the dedicated renderers still held after their teardown. */
async function cycles(
  page: Page,
  family: Family,
  mode: Mode,
  from: number,
  to: number,
): Promise<{ contextsKept: number; geometries: number; textures: number; programs: number }> {
  const held = { contextsKept: 0, geometries: 0, textures: 0, programs: 0 };
  for (let start = from; start < to; start += CHUNK) {
    const part = await page.evaluate(
      async ([name, shared, a, b]) => {
        const out = { contextsKept: 0, geometries: 0, textures: 0, programs: 0 };
        for (let round = a; round < b; round++) {
          const renderer = await window.__leak!.cycle(name, shared, round);
          if (shared) continue;
          if (!renderer.getContext().isContextLost()) out.contextsKept++;
          out.geometries += renderer.info.memory.geometries;
          out.textures += renderer.info.memory.textures;
          out.programs += renderer.info.programs?.length ?? 0;
        }
        return out;
      },
      [family, mode === 'shared', start, Math.min(to, start + CHUNK)] as const,
    );
    for (const key of Object.keys(held) as (keyof typeof held)[]) held[key] += part[key];
  }
  return held;
}

async function snapshot(page: Page, mode: Mode): Promise<Snapshot> {
  return page.evaluate(async (shared) => {
    // Two frames: removals that wait for a frame (and the sandbox's own stats) have run.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const probe = window.__probe!;
    const out: Snapshot = {
      dom: document.getElementsByTagName('*').length,
      listeners: probe.listeners(),
      observers: probe.observers(),
      contexts: probe.liveContexts(),
    };
    if (shared) {
      const renderer = window.__anchor!.three.renderer;
      out.memory = {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
      };
      out.gl = probe.gl(renderer.getContext());
    }
    return out;
  }, mode === 'shared');
}

interface Heap {
  used: number;
  /** Live instances per class: charts, renderers, three objects, canvases, elements. */
  census: Record<string, number>;
}

/** Chromium: collect garbage, then the used heap and a census of what charts are made of. */
async function heap(page: Page): Promise<Heap> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.enable');
    // Twice: objects kept only through weak references and finalizers go in the second pass.
    await cdp.send('HeapProfiler.collectGarbage');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    const names = await page.evaluate(() => Object.keys(window.__prototypes!));
    const census: Record<string, number> = {};
    for (const name of names) {
      const proto = await cdp.send('Runtime.evaluate', {
        expression: `window.__prototypes[${JSON.stringify(name)}]`,
      });
      const { objects } = await cdp.send('Runtime.queryObjects', {
        prototypeObjectId: proto.result.objectId!,
      });
      const length = await cdp.send('Runtime.callFunctionOn', {
        objectId: objects.objectId!,
        functionDeclaration: 'function () { return this.length; }',
        returnByValue: true,
      });
      await cdp.send('Runtime.releaseObject', { objectId: objects.objectId! });
      census[name] = length.result.value as number;
    }
    return { used: usedSize, census };
  } finally {
    await cdp.detach();
  }
}

for (const family of FAMILIES) {
  for (const mode of ['dedicated', 'shared'] as const) {
    test(`${family} (${mode}): ${CYCLES} create/update/destroy rounds leak nothing`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(120_000 + CYCLES * 6_000);
      const warnings: string[] = [];
      page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));

      await open(page);
      if (mode === 'shared') {
        const shared = await page.evaluate(async () => {
          window.__anchor = await window.__leak!.anchor();
          return window.__anchor.three.root.shared;
        });
        expect(shared).toBe(true);
      }
      await cycles(page, family, mode, 0, WARMUP);
      // Prototypes for the heap census: the page's three classes, and the chart and renderer
      // classes from an instance.
      await page.evaluate(async () => {
        const chart = window.__anchor ?? (await window.__leak!.anchor());
        window.__prototypes = {
          ...window.__leak!.prototypes,
          chart: Object.getPrototypeOf(chart) as object,
          renderer: Object.getPrototypeOf(chart.three.renderer) as object,
        };
        if (!window.__anchor) window.__leak!.release();
      });
      // Three measurements: after the warm-up, half way and at the end.
      const measure = async (held: object): Promise<{ counts: Growth; used?: number }> => {
        const counts = await snapshot(page, mode);
        const memory = browserName === 'chromium' ? await heap(page) : undefined;
        return {
          counts: { ...flat(counts), ...flat({ live: memory?.census ?? {}, destroyed: held }) },
          ...(memory ? { used: memory.used } : {}),
        };
      };
      const none = { contextsKept: 0, geometries: 0, textures: 0, programs: 0 };
      const start = await measure(none);
      const first = await cycles(page, family, mode, WARMUP, WARMUP + HALF);
      const middle = await measure(first);
      const second = await cycles(page, family, mode, WARMUP + HALF, WARMUP + CYCLES);
      const sum = Object.fromEntries(
        Object.entries(first).map(([key, n]) => [key, n + second[key as keyof typeof second]]),
      );
      const end = await measure(sum);

      expect(warnings, 'no page errors').toEqual([]);
      // Everything is counted, not estimated: contexts, the shared renderer's GPU counters (`memory`, `gl`), DOM,
      // listeners, observers, what destroyed dedicated renderers still held (`destroyed`), and
      // on Chromium the instances alive after a GC (`live`).
      const growth = growthPerRound(start.counts, middle.counts, end.counts);
      const expected = expectedGrowth(family, mode, browserName === 'chromium');
      // The same counters grow as listed, no others, and none by more than listed. A known
      // leak that depends on timing (a text batch that sometimes keeps its length) can fall short
      // of its figure in a short run; one that stops growing fails here, so its entry gets removed.
      expect(Object.keys(growth).sort(), `counters growing over ${CYCLES} rounds`).toEqual(
        Object.keys(expected).sort(),
      );
      for (const [key, most] of Object.entries(expected)) {
        expect(growth[key], `${key} per round`).toBeGreaterThan(0);
        expect(growth[key], `${key} per round`).toBeLessThanOrEqual(most);
      }

      const heapBefore = start.used === undefined ? undefined : { used: start.used };
      const heapAfter = end.used === undefined ? undefined : { used: end.used };
      if (heapBefore && heapAfter) {
        const perCycle = (heapAfter.used - heapBefore.used) / CYCLES;
        test.info().annotations.push({
          type: 'heap',
          description: `${Math.round(perCycle)} bytes per round (${heapBefore.used} → ${heapAfter.used})`,
        });
        // Bytes only mean something over many rounds (caches and code still settle during the
        // first ones) and where no known leak already accounts for growth.
        if (CYCLES >= HEAP_MIN_CYCLES && Object.keys(expected).length === 0) {
          expect(perCycle, 'heap growth per round, bytes').toBeLessThan(HEAP_BYTES_PER_CYCLE);
        }
      }

      if (mode === 'shared') {
        // The last chart on the shared renderer takes its context with it.
        const contexts = await page.evaluate(() => {
          const gl = window.__anchor!.three.renderer.getContext();
          window.__leak!.release();
          return { lost: gl.isContextLost(), live: window.__probe!.liveContexts() };
        });
        expect(contexts).toEqual({ lost: true, live: start.counts['contexts']! - 1 });
      }
    });
  }
}

test('the families cover every registered trace type', async ({ page }) => {
  await open(page);
  const hook = await page.evaluate(() => ({
    families: window.__leak!.families,
    uncovered: window.__leak!.uncovered,
  }));
  expect(hook).toEqual({ families: [...FAMILIES], uncovered: [] });
});
