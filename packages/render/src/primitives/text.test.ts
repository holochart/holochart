import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import type { TextLabel } from './text-layout.ts';

/**
 * Lazy loading of the SDF text engine (plan E21.5). troika is mocked: its worker needs browser
 * globals, and the tests control when the dynamic import resolves (`gate`) and when typesetting
 * finishes (`syncs`). Modules are reset and the mock re-registered (`vi.doMock`) per test with a
 * fresh state object, so each test starts with the engine unloaded and counts its own loads: an
 * import still in flight from an earlier test updates that test's state, not this one's.
 *
 * Positive outcomes of the dynamic import are awaited with `vi.waitFor` rather than a fixed number
 * of ticks, which a loaded machine can outlast.
 *
 * The built-in default font's faces (plan E2.18) are mocked the same way: each face's loader
 * records its file (`fontLoads`), waits for `fontGate`, and resolves to `/fonts/<file>` (or fails
 * with `fontFail`), so the tests see which faces load, when, and what troika is told to draw with.
 */
function freshState() {
  return {
    /** How many times a load started (the mock factory ran). */
    loads: 0,
    /** How many loads finished and returned the module. */
    loaded: 0,
    /** While set, the dynamic import waits for it. */
    gate: null as Promise<void> | null,
    /** Make the next load fail (a chunk that could not be fetched). */
    fail: false,
    /** Pending `sync` callbacks; typesetting finishes when a test calls them. */
    syncs: [] as (() => void)[],
    /** `configureTextBuilder` calls and `Text` constructions, in order. */
    log: [] as string[],
    /** Default font faces whose load started, by file name. */
    fontLoads: [] as string[],
    /** While set, default font face loads wait for it. */
    fontGate: null as Promise<void> | null,
    /** Make default font face loads fail. */
    fontFail: false,
  };
}
type MockState = ReturnType<typeof freshState>;
let troika: MockState = freshState();

/** Register the troika mock for the current test's state. */
function mockEngine(): void {
  const state = troika;
  vi.doMock('troika-three-text', () => mockTroika(state));
}

/** Register the default font faces mock (400/700 × upright/italic) for the current test's state. */
function mockDefaultFont(): void {
  const state = troika;
  const face = (file: string, weight: number, style: 'normal' | 'italic') => ({
    file,
    weight,
    style,
    load: async (): Promise<string> => {
      state.fontLoads.push(file);
      if (state.fontGate) await state.fontGate;
      if (state.fontFail) throw new Error('font chunk failed');
      return `/fonts/${file}`;
    },
  });
  vi.doMock('../fonts/default-font-files.ts', () => ({
    DEFAULT_FONT_FILES: [
      face('regular.otf', 400, 'normal'),
      face('bold.otf', 700, 'normal'),
      face('italic.otf', 400, 'italic'),
      face('bolditalic.otf', 700, 'italic'),
    ],
  }));
}

async function mockTroika(troika: MockState) {
  troika.loads++;
  if (troika.gate) await troika.gate;
  if (troika.fail) throw new Error('chunk load failed');
  const { Object3D } = await import('three');
  // `Object3D.dispose()` exists only in newer @types/three: attach it instead of declaring it, so
  // this typechecks with and without `override` (CI's `three (min)`).
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    text = '';
    font: string | null = null;
    /** The text of the last finished typesetting (`textRenderInfo.parameters.text` in troika). */
    typeset = '';
    sync(): void {
      this.typeset = this.text;
    }
    /** troika-like layout: 10 units per character, one line, baseline at 0. */
    get textRenderInfo() {
      const carets = new Float32Array(this.text.length * 4);
      for (let i = 0; i < this.text.length; i++) carets.set([i * 10, i * 10 + 10, -3, 11], i * 4);
      return { caretPositions: carets, topBaseline: 0, parameters: { text: this.typeset } };
    }
    constructor() {
      super();
      noopDispose(this);
      troika.log.push('Text');
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    readonly members = new Set<Text>();
    constructor() {
      super();
      noopDispose(this);
    }
    addText(text: Text): void {
      this.members.add(text);
    }
    removeText(text: Text): void {
      this.members.delete(text);
    }
    sync(callback?: () => void): void {
      troika.syncs.push(() => {
        for (const member of this.members) member.sync();
        callback?.();
      });
    }
  }
  troika.loaded++;
  return {
    Text,
    BatchedText,
    configureTextBuilder: (config: object) => troika.log.push(`config ${JSON.stringify(config)}`),
    preloadFont: (_options: object, callback: () => void) => callback(),
  };
}

type TextModule = typeof import('./text.ts');
interface MockBatch {
  members: Set<{ text: string; font: string | null }>;
  renderOrder: number;
}

interface DecorationMesh {
  name: string;
  renderOrder: number;
  visible: boolean;
}

let mod: TextModule;

function context(): PrimitiveContext & { invalidations: number } {
  const ctx = {
    resources: createResourceManager(),
    invalidations: 0,
    invalidate() {
      ctx.invalidations++;
    },
  };
  return ctx;
}

const labels = (...texts: string[]): TextLabel[] => texts.map((text, i) => ({ text, x: i, y: 0 }));

/** Let pending promise callbacks (and the mocked dynamic import) run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/** Finish every typesetting started so far. */
function finishSyncs(): void {
  for (const done of troika.syncs.splice(0)) done();
}

/** Whether a promise has settled, after letting pending callbacks run. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  await flush();
  return done;
}

function batchOf(primitive: { object: { children: unknown[] } }): MockBatch | undefined {
  return primitive.object.children[0] as MockBatch | undefined;
}

/** Release the gated dynamic import. */
let open: () => void = () => {};

beforeEach(async () => {
  vi.resetModules();
  troika = freshState();
  troika.gate = new Promise<void>((resolve) => (open = resolve));
  mockEngine();
  mockDefaultFont();
  mod = await import('./text.ts');
});

afterEach(() => {
  open();
  vi.restoreAllMocks();
});

describe('TextPrimitive: lazy text engine (E21.5)', () => {
  it('never loads the engine without labels', async () => {
    open();
    mod.configureText({ defaultFontURL: '/fonts/Inter.woff', sdfGlyphSize: 32 });
    const text = mod.createTextPrimitive(context(), { labels: [] });
    text.setTransform({ scaleX: 2, scaleY: 1, scaleZ: 1, offsetX: 0, offsetY: 0, offsetZ: 0 });
    text.setViewport({ width: 100, height: 100, pixelRatio: 1 });
    text.update({ style: { font: { size: 20 } } });
    await text.ready;
    await flush();
    expect(troika.loads).toBe(0);
    expect(troika.fontLoads).toEqual([]);
    expect(text.object.children).toHaveLength(0);
    text.dispose();
    expect(troika.loads).toBe(0);
  });

  it('queues labels set before the engine loads and typesets them on arrival', async () => {
    const ctx = context();
    const text = mod.createTextPrimitive(ctx, { labels: labels('a', 'b') });
    await vi.waitFor(() => expect(troika.loads).toBe(1));
    expect(text.object.children).toHaveLength(0);
    // Updates while loading only replace the queued data: the latest labels are typeset.
    text.update({ labels: labels('x', 'y', 'z') });
    open();
    await vi.waitFor(() => expect(batchOf(text)).toBeDefined());
    const batch = batchOf(text);
    expect(batch).toBeDefined();
    expect([...batch!.members].map((m) => m.text)).toEqual(['x', 'y', 'z']);
    expect(troika.syncs).toHaveLength(1);
    expect(ctx.invalidations).toBeGreaterThan(0);
    finishSyncs();
    await text.ready;
  });

  it('includes the load and the typesetting in `ready`', async () => {
    const text = mod.createTextPrimitive(context(), { labels: labels('a') });
    const ready = text.ready;
    expect(await settled(ready)).toBe(false); // engine still loading
    open();
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    expect(await settled(ready)).toBe(false); // loaded, still typesetting
    finishSyncs();
    await ready;
  });

  it('applies configureText made before the load, before the first label is created', async () => {
    mod.configureText({ defaultFontURL: '/fonts/Inter.woff' });
    mod.configureText({ sdfGlyphSize: 32 });
    expect(troika.loads).toBe(0);
    mod.createTextPrimitive(context(), { labels: labels('a') });
    open();
    await vi.waitFor(() => expect(troika.log).toContain('Text'));
    expect(troika.log[0]).toBe('config {"defaultFontURL":"/fonts/Inter.woff","sdfGlyphSize":32}');
    expect(troika.log.slice(1)).toEqual(['Text']);
    // After the load, configuration goes straight to troika.
    mod.configureText({ useWorker: false });
    expect(troika.log.at(-1)).toBe('config {"useWorker":false}');
  });

  it('attaches synchronously once the engine has loaded, and loads it only once', async () => {
    const first = mod.createTextPrimitive(context(), { labels: labels('a') });
    const second = mod.createTextPrimitive(context(), { labels: labels('b') });
    open();
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(2));
    finishSyncs();
    await Promise.all([first.ready, second.ready]);
    const third = mod.createTextPrimitive(context(), { labels: labels('c') });
    expect(batchOf(third)).toBeDefined();
    expect(troika.loads).toBe(1);
  });

  it('forwards renderOrder set on `object` to the batch, before and after it exists', async () => {
    const text = mod.createTextPrimitive(context(), { labels: labels('a') });
    text.object.renderOrder = 7;
    open();
    await vi.waitFor(() => expect(batchOf(text)).toBeDefined());
    expect(batchOf(text)!.renderOrder).toBe(7);
    text.object.renderOrder = 9;
    expect(text.object.renderOrder).toBe(9);
    expect(batchOf(text)!.renderOrder).toBe(9);
  });

  it('does not attach a primitive disposed while the engine was loading', async () => {
    const text = mod.createTextPrimitive(context(), { labels: labels('a') });
    const ready = text.ready;
    text.dispose();
    open();
    await vi.waitFor(() => expect(troika.loaded).toBe(1));
    await flush(); // let the attach step run if it (wrongly) would
    expect(await settled(ready)).toBe(true);
    expect(text.object.children).toHaveLength(0);
    expect(troika.syncs).toHaveLength(0);
  });

  it('resolves `ready` when the load fails, reports it once, and retries on the next update', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    troika.fail = true;
    open();
    const a = mod.createTextPrimitive(context(), { labels: labels('a') });
    const b = mod.createTextPrimitive(context(), { labels: labels('b') });
    await Promise.all([a.ready, b.ready]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(a.object.children).toHaveLength(0);

    troika.fail = false;
    mockEngine(); // a fresh chunk request
    a.update({ labels: labels('a2') });
    await vi.waitFor(() => expect(batchOf(a)).toBeDefined());
    expect([...batchOf(a)!.members].map((m) => m.text)).toEqual(['a2']);
    finishSyncs();
    await a.ready;
  });

  it('preloadTextFont and preloadTextEngine load the engine', async () => {
    open();
    await mod.preloadTextEngine();
    expect(troika.loads).toBe(1);
    expect(troika.fontLoads).toEqual([]);
    await expect(mod.preloadTextFont({ characters: '0123456789' })).resolves.toBeUndefined();
    expect(troika.loads).toBe(1);
    // Without a family: the default font's face for the weight and style.
    expect(troika.fontLoads).toEqual(['regular.otf']);
    await mod.preloadTextFont({ weight: 'bold', characters: 'A' });
    expect(troika.fontLoads).toEqual(['regular.otf', 'bold.otf']);
  });
});

describe('TextPrimitive: built-in default font (E2.18)', () => {
  const fontsOf = (primitive: { object: { children: unknown[] } }) =>
    [...(batchOf(primitive)?.members ?? [])].map((m) => [m.text, m.font]);

  /** Release the gated font loads. */
  let openFonts: () => void = () => {};
  const gateFonts = (): void => {
    troika.fontGate = new Promise<void>((resolve) => (openFonts = resolve));
  };
  afterEach(() => openFonts());

  it('loads only the regular face for plain labels, and draws unregistered families with it', async () => {
    open();
    const text = mod.createTextPrimitive(context(), {
      labels: [
        { text: 'a', x: 0, y: 0 },
        {
          text: 'b',
          x: 1,
          y: 0,
          font: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
        },
        // Empty labels draw nothing and need no face.
        { text: '', x: 2, y: 0, font: { weight: 'bold' } },
      ],
    });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await text.ready;
    expect(troika.fontLoads).toEqual(['regular.otf']);
    expect(fontsOf(text)).toEqual([
      ['a', '/fonts/regular.otf'],
      ['b', '/fonts/regular.otf'],
      ['', '/fonts/regular.otf'],
    ]);
  });

  it('loads bold and italic faces only when used, and picks them by weight and style', async () => {
    open();
    const text = mod.createTextPrimitive(context(), { labels: labels('a') });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await text.ready;
    text.update({
      labels: [
        { text: 'semibold', x: 0, y: 0, font: { weight: 600 } },
        { text: 'medium', x: 1, y: 0, font: { weight: 500 } },
        { text: 'bold italic', x: 2, y: 0, font: { weight: 'bold', style: 'italic' } },
      ],
    });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await text.ready;
    expect([...troika.fontLoads].sort()).toEqual(['bold.otf', 'bolditalic.otf', 'regular.otf']);
    expect(fontsOf(text)).toEqual([
      ['semibold', '/fonts/bold.otf'],
      ['medium', '/fonts/regular.otf'],
      ['bold italic', '/fonts/bolditalic.otf'],
    ]);
  });

  it('typesets only once the faces have loaded, and `ready` includes their load', async () => {
    gateFonts();
    open();
    const text = mod.createTextPrimitive(context(), { labels: labels('a') });
    await vi.waitFor(() => expect(troika.loaded).toBe(1));
    expect(troika.fontLoads).toEqual(['regular.otf']);
    const ready = text.ready;
    expect(await settled(ready)).toBe(false);
    expect(troika.syncs).toHaveLength(0); // never typeset with troika's (CDN) default font
    openFonts();
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    expect(await settled(ready)).toBe(false); // still typesetting
    finishSyncs();
    await ready;
    expect(fontsOf(text)).toEqual([['a', '/fonts/regular.otf']]);

    // A later update needing a new face keeps the old labels until it arrives.
    gateFonts();
    text.update({ labels: [{ text: 'b', x: 0, y: 0, font: { style: 'italic' } }] });
    const next = text.ready;
    await flush();
    expect(troika.syncs).toHaveLength(0);
    expect(fontsOf(text)).toEqual([['a', '/fonts/regular.otf']]);
    expect(await settled(next)).toBe(false);
    openFonts();
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await next;
    expect(fontsOf(text)).toEqual([['b', '/fonts/italic.otf']]);
  });

  it('shares one load per face between primitives', async () => {
    open();
    const a = mod.createTextPrimitive(context(), { labels: labels('a') });
    const b = mod.createTextPrimitive(context(), { labels: labels('b') });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(2));
    finishSyncs();
    await Promise.all([a.ready, b.ready]);
    expect(troika.fontLoads).toEqual(['regular.otf']);
  });

  it("uses the app's default font URL or registered families instead", async () => {
    const fonts = await import('./text-fonts.ts');
    fonts.registerFont({ family: 'Brand', url: '/brand.woff' }, { cssFontFace: false });
    open();
    const registered = mod.createTextPrimitive(context(), {
      labels: [{ text: 'r', x: 0, y: 0, font: { family: 'Brand, sans-serif', weight: 'bold' } }],
    });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await registered.ready;
    expect(fontsOf(registered)).toEqual([['r', '/brand.woff']]);
    expect(troika.fontLoads).toEqual([]);

    mod.configureText({ defaultFontURL: '/app.woff' });
    const text = mod.createTextPrimitive(context(), { labels: labels('a') });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await text.ready;
    // null: troika's configured default font, i.e. the app's.
    expect(fontsOf(text)).toEqual([['a', null]]);
    expect(troika.fontLoads).toEqual([]);
  });

  it('draws with self-hosted faces from configureText({ defaultFontFaces })', async () => {
    mod.configureText({ defaultFontFaces: { regular: '/self/r.otf', bold: '/self/b.otf' } });
    open();
    const text = mod.createTextPrimitive(context(), {
      labels: [
        { text: 'a', x: 0, y: 0 },
        { text: 'b', x: 1, y: 0, font: { weight: 'bold', style: 'italic' } },
      ],
    });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await text.ready;
    expect(troika.fontLoads).toEqual([]);
    expect(fontsOf(text)).toEqual([
      ['a', '/self/r.otf'],
      ['b', '/self/b.otf'], // no italic face: the closest weight of the other style
    ]);
  });

  it("falls back to troika's default font when a face fails, without hanging", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    troika.fontFail = true;
    open();
    const text = mod.createTextPrimitive(context(), { labels: labels('a') });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await text.ready;
    expect(fontsOf(text)).toEqual([['a', null]]);
    expect(error).toHaveBeenCalledTimes(1);
    // The next update retries the face.
    troika.fontFail = false;
    text.update({ labels: labels('b') });
    await vi.waitFor(() => expect(troika.syncs).toHaveLength(1));
    finishSyncs();
    await text.ready;
    expect(troika.fontLoads).toEqual(['regular.otf', 'regular.otf']);
    expect(fontsOf(text)).toEqual([['b', '/fonts/regular.otf']]);
  });
});

describe('TextPrimitive: decoration lines (E8.3)', () => {
  const decorationsOf = (primitive: { object: { children: unknown[] } }) =>
    (primitive.object.children as DecorationMesh[]).find(
      (c) => c.name === 'holochart:text-decorations',
    );

  it('creates the decoration mesh only once a label is decorated', async () => {
    open();
    const ctx = context();
    const text = mod.createTextPrimitive(ctx, { labels: labels('plain') });
    await vi.waitFor(() => expect(batchOf(text)).toBeDefined());
    expect(decorationsOf(text)).toBeUndefined();
    expect(text.decorationCount).toBe(0);

    text.object.renderOrder = 4;
    text.update({
      labels: [
        { text: 'under', x: 0, y: 0, font: { lineposition: 'under' } },
        { text: 'both', x: 1, y: 0, font: { lineposition: 'over+through' } },
        { text: 'plain', x: 2, y: 0 },
      ],
    });
    // The decoration module loads on demand (it is not in the initial chunk).
    await vi.waitFor(() => expect(decorationsOf(text)).toBeDefined());
    const mesh = decorationsOf(text);
    expect(mesh!.renderOrder).toBe(4);
    // The new text is not typeset yet: its old carets must not be decorated.
    expect(text.decorationCount).toBe(0);
    expect(mesh!.visible).toBe(false);
    // The batch stays the first child.
    expect(batchOf(text)!.members.size).toBe(3);
    text.object.renderOrder = 6;
    expect(mesh!.renderOrder).toBe(6);

    // Typesetting finished: decorations are rebuilt from the new layout.
    finishSyncs();
    await text.ready;
    expect(text.decorationCount).toBe(3);
    expect(mesh!.visible).toBe(true);

    // Decorations toggle without re-typesetting; the mesh is kept, hidden.
    const syncs = troika.syncs.length;
    text.update({
      labels: [
        { text: 'under', x: 0, y: 0, font: { lineposition: 'none' } },
        { text: 'both', x: 1, y: 0, font: { lineposition: 'over+through' } },
        { text: 'plain', x: 2, y: 0 },
      ],
    });
    expect(troika.syncs.length).toBe(syncs);
    expect(text.decorationCount).toBe(2);
    // A decoration in the shared style applies to every label without its own.
    text.update({ style: { font: { lineposition: 'under' } } });
    expect(text.decorationCount).toBe(3);
    text.update({ labels: labels('a', 'b'), style: {} });
    expect(text.decorationCount).toBe(0);
    expect(mesh!.visible).toBe(false);

    const quadRefs = () =>
      ctx.resources.stats().find((s) => s.key === 'holochart:primitives:unit-quad')?.refs ?? 0;
    expect(quadRefs()).toBe(1);
    text.dispose();
    expect(decorationsOf(text)).toBeUndefined();
    expect(quadRefs()).toBe(0);
  });
});
