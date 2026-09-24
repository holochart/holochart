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
  };
}
type MockState = ReturnType<typeof freshState>;
let troika: MockState = freshState();

/** Register the troika mock for the current test's state. */
function mockEngine(): void {
  const state = troika;
  vi.doMock('troika-three-text', () => mockTroika(state));
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
      troika.syncs.push(() => callback?.());
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
  members: Set<{ text: string }>;
  renderOrder: number;
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
    await expect(mod.preloadTextFont({ characters: '0123456789' })).resolves.toBeUndefined();
    expect(troika.loads).toBe(1);
  });
});
