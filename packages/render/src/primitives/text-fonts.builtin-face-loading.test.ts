import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_FONT_CSS_FAMILY,
  clearFontRegistry,
  defaultFontFace,
  defaultFontFacesPending,
  loadDefaultFontFaces,
  resolveDrawnFontURL,
  setDefaultFontFaces,
  setDefaultFontURL,
  subscribeFontChanges,
} from './text-fonts.ts';

afterEach(() => {
  setDefaultFontURL(null);
  setDefaultFontFaces(null);
  clearFontRegistry();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Minimal `FontFace` / `document.fonts` stand-ins (node has neither). */
function stubCSSFonts() {
  const added: FakeFontFace[] = [];
  class FakeFontFace {
    readonly family: string;
    readonly source: string;
    #resolve!: () => void;
    readonly loaded: Promise<FakeFontFace>;
    constructor(family: string, source: string) {
      this.family = family;
      this.source = source;
      this.loaded = new Promise((resolve) => {
        this.#resolve = () => resolve(this);
      });
    }
    load(): Promise<FakeFontFace> {
      return this.loaded;
    }
    finish(): void {
      this.#resolve();
    }
  }
  const fonts = {
    add: vi.fn((face: FakeFontFace) => added.push(face)),
    delete: vi.fn((face: FakeFontFace) => {
      const i = added.indexOf(face);
      if (i >= 0) added.splice(i, 1);
      return i >= 0;
    }),
  };
  vi.stubGlobal('FontFace', FakeFontFace);
  vi.stubGlobal('document', { fonts });
  return { added, fonts };
}

describe('configureText({ defaultFontFaces }): self-hosted faces', () => {
  it('lets a numeric weight replace the named face of the same weight and style', async () => {
    setDefaultFontFaces({
      regular: 'regular.otf',
      bold: 'named-bold.otf',
      weights: { 700: 'heavy.otf', 400: { italic: 'italic.otf' } },
    });
    await loadDefaultFontFaces([
      { family: 'A' },
      { family: 'A', weight: 'bold' },
      { family: 'A', style: 'italic' },
    ]);
    expect(resolveDrawnFontURL('A')).toBe('regular.otf');
    expect(resolveDrawnFontURL('A', 'bold')).toBe('heavy.otf');
    expect(resolveDrawnFontURL('A', 400, 'italic')).toBe('italic.otf');
    // The only italic face draws bold italic text too.
    expect(resolveDrawnFontURL('A', 'bold', 'italic')).toBe('italic.otf');
    // Three faces, all loaded: the named bold was replaced, not kept next to the numeric one.
    expect(defaultFontFacesPending()).toBe(false);
  });

  it('tells font-change subscribers when a face has loaded, so text is measured again', async () => {
    setDefaultFontFaces({ regular: 'regular.otf' });
    const listener = vi.fn();
    const stop = subscribeFontChanges(listener);
    await loadDefaultFontFaces([{ family: 'A' }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(defaultFontFace('A')).toEqual({ weight: 400, style: 'normal', url: 'regular.otf' });
    stop();
  });
});

describe('data: URLs of built-in faces', () => {
  /** `OTTO` (the OpenType/CFF signature) as a base64 `data:` URL. */
  const OTTO = 'data:font/otf;base64,T1RUTw==';

  it('draws a base64 data: URL from a blob: URL holding the same bytes and type', async () => {
    setDefaultFontFaces({ regular: OTTO });
    await loadDefaultFontFaces([{ family: 'A' }]);
    const url = resolveDrawnFontURL('A')!;
    expect(url).toMatch(/^blob:/);
    const response = await fetch(url);
    expect(response.headers.get('content-type')).toBe('font/otf');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('OTTO');
  });

  it('revokes the blob: URL when the faces are replaced', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    setDefaultFontFaces({ regular: OTTO });
    await loadDefaultFontFaces([{ family: 'A' }]);
    const url = resolveDrawnFontURL('A')!;
    expect(revoke).not.toHaveBeenCalled();
    setDefaultFontFaces({ regular: 'regular.otf' });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(url);
  });

  it('draws data: URLs that are not base64, and ones without data, as they are', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const create = vi.spyOn(URL, 'createObjectURL');
    setDefaultFontFaces({ regular: 'data:font/otf,OTTO', bold: 'data:font/otf;base64' });
    await loadDefaultFontFaces([{ family: 'A' }, { family: 'A', weight: 'bold' }]);
    expect(resolveDrawnFontURL('A')).toBe('data:font/otf,OTTO');
    expect(resolveDrawnFontURL('A', 'bold')).toBe('data:font/otf;base64');
    expect(create).not.toHaveBeenCalled();
    // Nothing was created, so nothing is revoked.
    setDefaultFontFaces(null);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('draws from the data: URL itself where blob: URLs cannot be created (CSP)', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('blob: URLs are blocked');
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    setDefaultFontFaces({ regular: OTTO });
    await loadDefaultFontFaces([{ family: 'A' }]);
    expect(resolveDrawnFontURL('A')).toBe(OTTO);
    setDefaultFontFaces(null);
    expect(revoke).not.toHaveBeenCalled();
  });
});

describe('faces replaced while one is loading', () => {
  it('drops a face whose CSS face finishes loading after the faces were replaced', async () => {
    const { added, fonts } = stubCSSFonts();
    setDefaultFontFaces({ regular: 'old.otf' });
    const load = loadDefaultFontFaces([{ family: 'A' }]);
    await vi.waitFor(() => expect(added).toHaveLength(1));
    const old = added[0]!;
    expect([old.family, old.source]).toEqual([BUILTIN_FONT_CSS_FAMILY, 'url("old.otf")']);

    setDefaultFontFaces({ regular: 'new.otf' });
    expect(fonts.delete).toHaveBeenCalledWith(old);
    old.finish();
    await load;
    // The old file is not drawn with, and the new one still has to load.
    expect(resolveDrawnFontURL('A')).toBeUndefined();
    expect(defaultFontFacesPending()).toBe(true);

    const next = loadDefaultFontFaces([{ family: 'A' }]);
    await vi.waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]!.source).toBe('url("new.otf")');
    added[0]!.finish();
    await next;
    expect(resolveDrawnFontURL('A')).toBe('new.otf');
  });
});

/**
 * Failed loads. Self-hosted faces resolve their URL synchronously, so failures need the shipped
 * faces' lazy chunks: they are mocked (like in text.test.ts) with loaders the test can fail, and
 * the module is loaded fresh so the "reported once" state starts clean.
 */
describe('built-in faces that fail to load', () => {
  type Fonts = typeof import('./text-fonts.ts');

  async function freshFonts() {
    const state = { loads: [] as string[], failing: new Set<string>() };
    const face = (file: string, weight: number, style: 'normal' | 'italic') => ({
      file,
      weight,
      style,
      load: async (): Promise<string> => {
        state.loads.push(file);
        if (state.failing.has(file)) throw new Error(`chunk ${file} failed`);
        return `/fonts/${file}`;
      },
    });
    vi.resetModules();
    vi.doMock('../fonts/default-font-files.ts', () => ({
      DEFAULT_FONT_FILES: [
        face('regular.otf', 400, 'normal'),
        face('bold.otf', 700, 'normal'),
        face('italic.otf', 400, 'italic'),
      ],
    }));
    const fonts: Fonts = await import('./text-fonts.ts');
    return { fonts, state };
  }

  afterEach(() => {
    vi.doUnmock('../fonts/default-font-files.ts');
    vi.resetModules();
  });

  it('never rejects, reports the first failure only, and leaves the text to the default font', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fonts, state } = await freshFonts();
    state.failing.add('regular.otf').add('bold.otf');
    await expect(
      fonts.loadDefaultFontFaces([{ family: 'A' }, { family: 'A', weight: 'bold' }]),
    ).resolves.toBeUndefined();
    expect(state.loads).toEqual(['regular.otf', 'bold.otf']);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('built-in default font');
    // No built-in face has loaded: troika's own default font draws the text.
    expect(fonts.resolveDrawnFontURL('A')).toBeUndefined();
    expect(fonts.defaultFontFace('A')).toEqual({ weight: 400, style: 'normal', url: undefined });
  });

  it('retries failed faces only when asked to', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fonts, state } = await freshFonts();
    state.failing.add('regular.otf');
    await fonts.loadDefaultFontFaces([{ family: 'A' }]);
    expect(state.loads).toEqual(['regular.otf']);

    // A follow-up check (`retryFailed: false`) skips the failed face but loads untried ones.
    state.failing.clear();
    const followUp = fonts.loadDefaultFontFaces(
      [{ family: 'A' }, { family: 'A', weight: 'bold' }],
      {
        retryFailed: false,
      },
    );
    await followUp;
    expect(state.loads).toEqual(['regular.otf', 'bold.otf']);
    expect(fonts.loadDefaultFontFaces([{ family: 'A' }], { retryFailed: false })).toBeNull();
    // Until the regular face loads, the closest loaded face stands in for it.
    expect(fonts.resolveDrawnFontURL('A')).toBe('/fonts/bold.otf');

    // Measuring does not restart a failed load either.
    expect(fonts.measurementFace({ family: 'A' })).toMatchObject({
      source: 'builtin',
      weight: 400,
    });
    expect(state.loads).toEqual(['regular.otf', 'bold.otf']);

    // A new request (the default) retries it.
    await fonts.loadDefaultFontFaces([{ family: 'A' }]);
    expect(state.loads).toEqual(['regular.otf', 'bold.otf', 'regular.otf']);
    expect(fonts.resolveDrawnFontURL('A')).toBe('/fonts/regular.otf');
  });

  it('counts failed faces as pending only for callers that retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fonts, state } = await freshFonts();
    state.failing.add('regular.otf').add('bold.otf').add('italic.otf');
    await fonts.loadDefaultFontFaces([
      { family: 'A' },
      { family: 'A', weight: 'bold' },
      { family: 'A', style: 'italic' },
    ]);
    expect(fonts.defaultFontFacesPending(false)).toBe(false);
    expect(fonts.defaultFontFacesPending(true)).toBe(true);
  });
});
