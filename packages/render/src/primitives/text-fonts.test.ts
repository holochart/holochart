import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FONT_CSS_FAMILY,
  TROIKA_FALLBACK_CSS_FAMILY,
  clearFontRegistry,
  cssFontFamily,
  cssFontString,
  fontWeightRank,
  fonts,
  getDefaultFontURL,
  measurementFace,
  normalizeFontStyle,
  normalizeFontWeight,
  parseFontFamilyList,
  registerFont,
  registerFontFamily,
  registeredFontFamilies,
  resolveFontFace,
  resolveFontURL,
  setDefaultFontURL,
  setUnicodeFontsURL,
  subscribeFontChanges,
  troikaFallbackWeight,
} from './text-fonts.ts';

/** Plotly's default `font.family` (core's `DEFAULT_FONT_FAMILY`). */
const DEFAULT_FONT_FAMILY_LIST = '"Open Sans", verdana, arial, sans-serif';

afterEach(() => clearFontRegistry());

describe('font normalization', () => {
  it('maps weight keywords and clamps numbers', () => {
    expect(normalizeFontWeight(undefined)).toBe(400);
    expect(normalizeFontWeight('normal')).toBe(400);
    expect(normalizeFontWeight('bold')).toBe(700);
    expect(normalizeFontWeight(1200)).toBe(1000);
    expect(normalizeFontWeight(Number.NaN)).toBe(400);
  });

  it('treats oblique as italic and anything else as normal', () => {
    expect(normalizeFontStyle('oblique')).toBe('italic');
    expect(normalizeFontStyle('italic')).toBe('italic');
    expect(normalizeFontStyle(undefined)).toBe('normal');
  });
});

describe('CSS family helpers', () => {
  it('parses family lists and strips quotes', () => {
    expect(parseFontFamilyList(`"Open Sans", 'Noto Sans' , arial,, sans-serif`)).toEqual([
      'Open Sans',
      'Noto Sans',
      'arial',
      'sans-serif',
    ]);
  });

  it('quotes named families but not generic keywords', () => {
    expect(cssFontFamily('Open Sans, SANS-SERIF')).toBe('"Open Sans", sans-serif');
    expect(cssFontFamily('')).toBe('sans-serif');
    expect(cssFontString({ family: 'Inter', weight: 'bold', style: 'italic' }, 12)).toBe(
      'italic 700 12px "Inter"',
    );
  });
});

describe('fontWeightRank (CSS matching order)', () => {
  const order = (target: number, weights: number[]): number[] =>
    [...weights].sort((a, b) => fontWeightRank(target, a) - fontWeightRank(target, b));

  it('400: exact, then up to 500, then lighter, then heavier', () => {
    expect(order(400, [300, 500, 700, 100, 400])).toEqual([400, 500, 300, 100, 700]);
  });

  it('700: heavier first, then lighter descending', () => {
    expect(order(700, [400, 900, 300, 800])).toEqual([800, 900, 400, 300]);
  });

  it('300: lighter first, then heavier ascending', () => {
    expect(order(300, [400, 200, 100, 700])).toEqual([200, 100, 400, 700]);
  });
});

describe('font registry', () => {
  it('returns undefined for unregistered families (troika default font)', () => {
    expect(resolveFontURL('Inter, sans-serif')).toBeUndefined();
  });

  it('resolves the first registered family of the list, case-insensitively', () => {
    registerFont({ family: 'Inter', url: 'inter.woff' }, { cssFontFace: false });
    registerFont({ family: 'Roboto', url: 'roboto.woff' }, { cssFontFace: false });
    expect(resolveFontURL('"Missing", roboto, Inter')).toBe('roboto.woff');
    expect(resolveFontURL('INTER')).toBe('inter.woff');
  });

  it('prefers matching style, then the closest weight', () => {
    registerFont({ family: 'Inter', url: 'r.woff' }, { cssFontFace: false });
    registerFont({ family: 'Inter', url: 'b.woff', weight: 700 }, { cssFontFace: false });
    registerFont({ family: 'Inter', url: 'i.woff', style: 'italic' }, { cssFontFace: false });
    expect(resolveFontURL('Inter', 'bold')).toBe('b.woff');
    expect(resolveFontURL('Inter', 600)).toBe('b.woff');
    expect(resolveFontURL('Inter', 450)).toBe('r.woff');
    expect(resolveFontURL('Inter', 700, 'italic')).toBe('i.woff');
  });

  it('replaces an identical face and supports unregistering', () => {
    registerFont({ family: 'Inter', url: 'a.woff' }, { cssFontFace: false });
    const off = registerFont({ family: 'Inter', url: 'b.woff' }, { cssFontFace: false });
    expect(resolveFontURL('Inter')).toBe('b.woff');
    off();
    expect(resolveFontURL('Inter')).toBeUndefined();
  });

  it('notifies subscribers on changes', () => {
    const listener = vi.fn();
    const off = subscribeFontChanges(listener);
    registerFont({ family: 'Inter', url: 'a.woff' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    registerFont({ family: 'Inter', url: 'b.woff' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('resolveFontFace', () => {
  it('returns the registered family name, weight and style', () => {
    registerFont({ family: 'Inter', url: 'b.woff', weight: 700 }, { cssFontFace: false });
    expect(resolveFontFace('"Open Sans", inter', 'bold')).toEqual({
      family: 'Inter',
      url: 'b.woff',
      weight: 700,
      style: 'normal',
    });
    expect(resolveFontFace('Open Sans')).toBeUndefined();
  });
});

describe('fonts.register (E8.3)', () => {
  const noCSS = { cssFontFace: false } as const;

  it('registers regular/bold/italic/boldItalic and resolves each variant', () => {
    fonts.register(
      'Inter',
      { regular: 'r.woff', bold: 'b.woff', italic: 'i.woff', boldItalic: 'bi.woff' },
      noCSS,
    );
    expect(fonts.resolve('Inter')?.url).toBe('r.woff');
    expect(fonts.resolve('Inter', 'bold')?.url).toBe('b.woff');
    expect(fonts.resolve('Inter', 'normal', 'italic')?.url).toBe('i.woff');
    expect(fonts.resolve('Inter', 700, 'italic')).toEqual({
      family: 'Inter',
      url: 'bi.woff',
      weight: 700,
      style: 'italic',
    });
    // CSS weight matching over the registered faces: 600 → bold, 300 → regular.
    expect(fonts.resolve('Inter', 600)?.url).toBe('b.woff');
    expect(fonts.resolve('Inter', 300)?.url).toBe('r.woff');
  });

  it('registers numeric weights, as URLs or per style', () => {
    registerFontFamily(
      'Inter',
      {
        regular: 'r.woff',
        weights: { 300: 'light.woff', 600: { normal: 'sb.woff', italic: 'sbi.woff' } },
      },
      noCSS,
    );
    expect(resolveFontURL('Inter', 300)).toBe('light.woff');
    expect(resolveFontURL('Inter', 200)).toBe('light.woff');
    expect(resolveFontURL('Inter', 600)).toBe('sb.woff');
    expect(resolveFontURL('Inter', 'bold')).toBe('sb.woff');
    expect(resolveFontURL('Inter', 600, 'italic')).toBe('sbi.woff');
    // Only one italic face: every italic request gets it.
    expect(resolveFontURL('Inter', 400, 'italic')).toBe('sbi.woff');
  });

  it('resolves a fallback chain to the first registered family', () => {
    fonts.register('Inter', { regular: 'inter.woff', bold: 'inter-bold.woff' }, noCSS);
    const chain = '"Brand", Inter, sans-serif';
    expect(fonts.resolve(chain, 'bold')?.url).toBe('inter-bold.woff');
    const offBrand = fonts.register('Brand', { regular: 'brand.woff' }, noCSS);
    expect(fonts.resolve(chain)?.url).toBe('brand.woff');
    // The first registered family wins even without a matching weight.
    expect(fonts.resolve(chain, 'bold')?.url).toBe('brand.woff');
    offBrand();
    expect(fonts.resolve(chain, 'bold')?.url).toBe('inter-bold.woff');
  });

  it('unregisters every face of the call and lists families', () => {
    const off = fonts.register('Inter', { regular: 'r.woff', italic: 'i.woff' }, noCSS);
    fonts.registerFace({ family: 'Roboto', url: 'roboto.woff' }, noCSS);
    expect(fonts.families()).toEqual(['Inter', 'Roboto']);
    expect(registeredFontFamilies()).toEqual(['Inter', 'Roboto']);
    off();
    expect(resolveFontFace('Inter')).toBeUndefined();
    expect(fonts.families()).toEqual(['Roboto']);
    fonts.clear();
    expect(fonts.families()).toEqual([]);
  });

  it('keeps faces replaced by a later registration when the first call is undone', () => {
    const off = fonts.register('Inter', { regular: 'old.woff', bold: 'b.woff' }, noCSS);
    fonts.register('Inter', { regular: 'new.woff' }, noCSS);
    off();
    expect(resolveFontURL('Inter')).toBe('new.woff');
    expect(resolveFontURL('Inter', 'bold')).toBe('new.woff');
  });

  it('registers each face as a CSS FontFace for the metrics oracle', () => {
    const { added } = stubCSSFonts();
    try {
      fonts.register('Inter', { regular: 'r.woff', boldItalic: 'bi.woff' });
      expect(added.map((f) => [f.family, f.source, f.descriptors])).toEqual([
        ['Inter', 'url("r.woff")', { weight: '400', style: 'normal' }],
        ['Inter', 'url("bi.woff")', { weight: '700', style: 'italic' }],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** Minimal `FontFace` / `document.fonts` stand-ins (node has neither). */
function stubCSSFonts() {
  const added: FakeFontFace[] = [];
  class FakeFontFace {
    readonly family: string;
    readonly source: string;
    readonly descriptors: FontFaceDescriptors;
    loadCalls = 0;
    #resolve!: () => void;
    readonly loaded: Promise<FakeFontFace>;
    constructor(family: string, source: string, descriptors: FontFaceDescriptors = {}) {
      this.family = family;
      this.source = source;
      this.descriptors = descriptors;
      this.loaded = new Promise((resolve) => {
        this.#resolve = () => resolve(this);
      });
    }
    load(): Promise<FakeFontFace> {
      this.loadCalls++;
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

describe('measurementFace (E2.18: measure what troika draws)', () => {
  afterEach(() => {
    setDefaultFontURL(null);
    setUnicodeFontsURL(null);
    vi.unstubAllGlobals();
  });

  it('uses a registered family with the registered face weight/style', () => {
    registerFont({ family: 'Inter', url: 'r.woff' }, { cssFontFace: false });
    registerFont({ family: 'Inter', url: 'b.woff', weight: 700 }, { cssFontFace: false });
    expect(measurementFace({ family: 'Missing, Inter', weight: 600 })).toEqual({
      family: '"Inter", "Missing", "Inter"',
      weight: 700,
      style: 'normal',
      source: 'registered',
    });
    // Only an upright face exists: troika draws it upright, so measure upright.
    expect(measurementFace({ family: 'Inter', style: 'italic' })).toMatchObject({
      weight: 400,
      style: 'normal',
    });
  });

  it('maps unregistered families to the default font at 400/normal', () => {
    setDefaultFontURL('default.woff');
    expect(getDefaultFontURL()).toBe('default.woff');
    expect(measurementFace({ family: DEFAULT_FONT_FAMILY_LIST, weight: 'bold' })).toEqual({
      family: `${DEFAULT_FONT_CSS_FAMILY}, "Open Sans", "verdana", "arial", sans-serif`,
      weight: 400,
      style: 'normal',
      source: 'default',
    });
  });

  it("falls back to troika's CDN font (nearest weight, requested style) without a default", () => {
    expect(getDefaultFontURL()).toBeUndefined();
    expect(measurementFace({ family: 'Open Sans', weight: 650, style: 'italic' })).toEqual({
      family: `${TROIKA_FALLBACK_CSS_FAMILY}, "Open Sans"`,
      weight: 600,
      style: 'italic',
      source: 'troika',
    });
  });

  it('is recomputed after font changes', () => {
    setDefaultFontURL('default.woff');
    expect(measurementFace({ family: 'Inter' }).source).toBe('default');
    registerFont({ family: 'Inter', url: 'inter.woff' }, { cssFontFace: false });
    expect(measurementFace({ family: 'Inter' }).source).toBe('registered');
  });

  it('troikaFallbackWeight picks the nearest weight, the lighter on ties', () => {
    expect(troikaFallbackWeight('bold')).toBe(700);
    expect(troikaFallbackWeight(450)).toBe(400);
    expect(troikaFallbackWeight(1000)).toBe(900);
    expect(troikaFallbackWeight(1)).toBe(100);
  });

  it('registers the default font as an eagerly loaded CSS face and notifies on load', async () => {
    const { added, fonts } = stubCSSFonts();
    const listener = vi.fn();
    const off = subscribeFontChanges(listener);
    setDefaultFontURL('a.woff');
    expect(listener).toHaveBeenCalledTimes(1);
    const face = added[0]!;
    expect(face.family).toBe(DEFAULT_FONT_CSS_FAMILY);
    expect(face.source).toBe('url("a.woff")');
    expect(face.descriptors).toEqual({ weight: '400', style: 'normal' });
    expect(face.loadCalls).toBe(1);
    face.finish();
    await face.loaded;
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);
    // Replacing the default removes the old face; setting the same URL again is a no-op.
    setDefaultFontURL('b.woff');
    expect(fonts.delete).toHaveBeenCalledWith(face);
    setDefaultFontURL('b.woff');
    expect(fonts.add).toHaveBeenCalledTimes(2);
    off();
  });

  it("registers troika's fallback faces lazily, at troika's URLs, without loading them", () => {
    const { added } = stubCSSFonts();
    setUnicodeFontsURL('https://fonts.example/data/');
    expect(added).toHaveLength(0);
    measurementFace({ family: 'Open Sans' });
    expect(added).toHaveLength(18);
    const bold = added.find(
      (f) => f.descriptors.weight === '700' && f.descriptors.style === 'normal',
    );
    expect(bold?.family).toBe(TROIKA_FALLBACK_CSS_FAMILY);
    expect(bold?.source).toBe(
      'url("https://fonts.example/data/font-files/latin/sans-serif.normal.700.woff")',
    );
    expect(bold?.descriptors.unicodeRange).toMatch(/^U\+0-FF,/);
    expect(added.every((f) => f.loadCalls === 0)).toBe(true);
    // Registered once, not per request.
    measurementFace({ family: 'Roboto', weight: 700 });
    expect(added).toHaveLength(18);
  });
});
