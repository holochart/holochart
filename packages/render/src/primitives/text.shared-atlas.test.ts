import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import type { TextLabel } from './text-layout.ts';

/**
 * Text primitives in different render roots share troika's glyph atlas. troika reports a text as
 * typeset as soon as its glyphs are registered, which for a glyph another text requested a moment
 * earlier is before the glyph is in the texture; the chart then draws a gap, and has to be redrawn
 * when the glyph arrives (text-atlas.ts).
 *
 * troika is mocked as in text.test.ts, with one addition: a page-wide `atlas` whose `version` the
 * tests bump the way troika's `sdfTexture.needsUpdate = true` does, and which every batch reports
 * as its `textRenderInfo.sdfTexture` once it has synced.
 */
const state = {
  atlas: { version: 0 },
  /** Pending `sync` callbacks, in the order the batches asked. */
  syncs: [] as (() => void)[],
  /** Pending `preloadFont` callbacks. */
  preloads: [] as (() => void)[],
};

async function mockTroika() {
  const { Object3D } = await import('three');
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    text = '';
    font: string | null = null;
    readonly textRenderInfo = null;
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    textRenderInfo: { sdfTexture: { version: number } } | null = null;
    constructor() {
      super();
      noopDispose(this);
    }
    addText(): void {}
    removeText(): void {}
    sync(callback?: () => void): void {
      state.syncs.push(() => {
        this.textRenderInfo = { sdfTexture: state.atlas };
        callback?.();
      });
    }
  }
  return {
    Text,
    BatchedText,
    configureTextBuilder: (): void => {},
    preloadFont: (_options: object, callback: (info: object) => void) => {
      state.preloads.push(() => callback({ sdfTexture: state.atlas }));
    },
  };
}

type TextModule = typeof import('./text.ts');
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

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/** A primitive in its own render root, with the engine attached and its typesetting pending. */
async function primitive(...texts: string[]) {
  const ctx = context();
  // Once the engine has loaded, a new primitive attaches and starts typesetting synchronously.
  const before = state.syncs.length;
  const text = mod.createTextPrimitive(ctx, { labels: labels(...texts) });
  await vi.waitFor(() => expect(state.syncs.length).toBe(before + 1));
  return { ctx, text, finish: state.syncs[before] as () => void };
}

beforeEach(async () => {
  vi.resetModules();
  state.atlas = { version: 0 };
  state.syncs = [];
  state.preloads = [];
  vi.doMock('troika-three-text', mockTroika);
  mod = await import('./text.ts');
  mod.configureText({ defaultFontURL: '/fonts/Inter.woff' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TextPrimitive: glyph atlas shared between render roots', () => {
  it('redraws a chart whose glyphs another chart’s typesetting delivers later', async () => {
    // `first` asks for "(in)" and troika starts generating it; `second` needs the same glyphs,
    // finds them registered, and is reported typeset before they exist.
    const first = await primitive('Pressure (in)');
    const second = await primitive('Rain (in)');
    second.finish();
    await flush();
    const drawn = second.ctx.invalidations;

    // The glyphs arrive: troika marks the atlas changed and finishes the first text.
    state.atlas.version++;
    first.finish();
    await flush();
    expect(second.ctx.invalidations).toBe(drawn + 1);

    first.text.dispose();
    second.text.dispose();
  });

  it('leaves other charts alone when typesetting generated no glyphs', async () => {
    const first = await primitive('abc');
    const second = await primitive('abc');
    second.finish();
    first.finish();
    await flush();
    const drawn = second.ctx.invalidations;

    // Only layout changed: the same glyphs, so the atlas is as it was.
    first.text.update({ labels: labels('cab') });
    await vi.waitFor(() => expect(state.syncs).toHaveLength(3));
    (state.syncs[2] as () => void)();
    await flush();
    expect(second.ctx.invalidations).toBe(drawn);

    first.text.dispose();
    second.text.dispose();
  });

  it('still redraws the others when the chart that asked for the glyphs is gone by then', async () => {
    const first = await primitive('Pressure (in)');
    const second = await primitive('Rain (in)');
    second.finish();
    await flush();
    const drawn = second.ctx.invalidations;

    first.text.dispose();
    const gone = first.ctx.invalidations;
    state.atlas.version++;
    first.finish();
    await flush();
    expect(second.ctx.invalidations).toBe(drawn + 1);
    expect(first.ctx.invalidations).toBe(gone);

    second.text.dispose();
  });

  it('stops redrawing a disposed primitive', async () => {
    const first = await primitive('Pressure (in)');
    const second = await primitive('Rain (in)');
    second.finish();
    await flush();
    second.text.dispose();
    const drawn = second.ctx.invalidations;

    state.atlas.version++;
    first.finish();
    await flush();
    expect(second.ctx.invalidations).toBe(drawn);

    first.text.dispose();
  });

  it('redraws when a font preload delivers glyphs a chart already uses', async () => {
    const chart = await primitive('0123');
    const preloaded = mod.preloadTextFont({ characters: '0123456789' });
    await vi.waitFor(() => expect(state.preloads).toHaveLength(1));
    chart.finish();
    await flush();
    const drawn = chart.ctx.invalidations;

    state.atlas.version++;
    (state.preloads[0] as () => void)();
    await preloaded;
    expect(chart.ctx.invalidations).toBe(drawn + 1);

    chart.text.dispose();
  });
});
