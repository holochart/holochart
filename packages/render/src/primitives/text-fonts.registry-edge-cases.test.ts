import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearFontRegistry,
  getDefaultFontURL,
  measurementFace,
  registerFont,
  registerFontFamily,
  registeredFontFamilies,
  resolveFontFace,
  resolveFontURL,
  setDefaultFontURL,
  subscribeFontChanges,
  type FontFamilyFaces,
} from './text-fonts.ts';

const noCSS = { cssFontFace: false } as const;

afterEach(() => {
  setDefaultFontURL(null);
  clearFontRegistry();
  vi.unstubAllGlobals();
});

describe('unregistering a face that is no longer registered', () => {
  it('does nothing after the registry was cleared: no change, no notification', () => {
    const off = registerFont({ family: 'Inter', url: 'inter.woff' }, noCSS);
    clearFontRegistry();
    registerFont({ family: 'Roboto', url: 'roboto.woff' }, noCSS);
    const listener = vi.fn();
    const stop = subscribeFontChanges(listener);
    off();
    expect(listener).not.toHaveBeenCalled();
    expect(registeredFontFamilies()).toEqual(['Roboto']);
    stop();
  });

  it('removes the face once when called twice', () => {
    const off = registerFont({ family: 'Inter', url: 'inter.woff' }, noCSS);
    const listener = vi.fn();
    const stop = subscribeFontChanges(listener);
    off();
    off();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(resolveFontURL('Inter')).toBeUndefined();
    stop();
  });

  it('leaves a same-named face registered after the clear alone', () => {
    const off = registerFont({ family: 'Inter', url: 'old.woff' }, noCSS);
    clearFontRegistry();
    registerFont({ family: 'Inter', url: 'new.woff' }, noCSS);
    off();
    expect(resolveFontURL('Inter')).toBe('new.woff');
  });
});

describe('registerFontFamily: unusable entries', () => {
  it('ignores weight keys that are not numbers', () => {
    const weights = { heavy: 'heavy.woff', 300: 'light.woff' } as unknown as Record<number, string>;
    registerFontFamily('Inter', { weights }, noCSS);
    // Only the 300 face exists: every upright request resolves to it.
    expect(resolveFontFace('Inter', 900)).toEqual({
      family: 'Inter',
      url: 'light.woff',
      weight: 300,
      style: 'normal',
    });
    expect(resolveFontFace('Inter')?.url).toBe('light.woff');
  });

  it('registers nothing for a family with no usable face', () => {
    const faces = {
      regular: '',
      weights: { heavy: 'heavy.woff', 600: {} },
    } as unknown as FontFamilyFaces;
    const off = registerFontFamily('Inter', faces, noCSS);
    expect(registeredFontFamilies()).toEqual([]);
    expect(resolveFontFace('Inter')).toBeUndefined();
    off();
    expect(registeredFontFamilies()).toEqual([]);
  });
});

describe('CSS font faces the browser refuses', () => {
  /** A `FontFace` whose constructor throws, as under a CSP that forbids the font source. */
  function stubRejectingFontFace() {
    const add = vi.fn();
    class RejectingFontFace {
      constructor() {
        throw new Error('Refused to load the font');
      }
    }
    vi.stubGlobal('FontFace', RejectingFontFace);
    vi.stubGlobal('document', { fonts: { add, delete: vi.fn() } });
    return add;
  }

  it('still registers the font file for drawing', () => {
    const add = stubRejectingFontFace();
    const listener = vi.fn();
    const stop = subscribeFontChanges(listener);
    registerFont({ family: 'Inter', url: 'inter.woff' });
    expect(resolveFontURL('Inter')).toBe('inter.woff');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
    stop();
  });

  it("still records the app's default font URL", () => {
    const add = stubRejectingFontFace();
    setDefaultFontURL('/fonts/app.woff');
    expect(getDefaultFontURL()).toBe('/fonts/app.woff');
    expect(measurementFace({ family: 'Anything' }).source).toBe('default');
    expect(add).not.toHaveBeenCalled();
  });

  it('constructs no CSS face where the document has no font set', () => {
    const constructed = vi.fn();
    class CountingFontFace {
      constructor() {
        constructed();
      }
    }
    vi.stubGlobal('FontFace', CountingFontFace);
    vi.stubGlobal('document', {});
    registerFont({ family: 'Inter', url: 'inter.woff' });
    expect(resolveFontURL('Inter')).toBe('inter.woff');
    expect(constructed).not.toHaveBeenCalled();
  });
});
