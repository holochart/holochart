// @vitest-environment jsdom
/**
 * Arabic and Hebrew labels (backlog S2.15): they measure and go through the whole pipeline — a
 * figure with right-to-left titles, tick labels, legend entries and an annotation — without
 * throwing, on the deterministic measurement fallback (what node, jsdom and server-side layout
 * use) and a WebGL-free renderer.
 *
 * What this cannot show: the glyphs. troika (mocked here, it needs a browser) reorders the runs
 * and joins Arabic letters when it typesets, so the tests check what the text engine is handed:
 * the strings in logical order, untouched. The limits of the fallback itself are pinned at the
 * end, as the locales guide states them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtinComponents, componentsReady } from '../../packages/components/src/index.ts';
import { ar, he } from '../../packages/locales/src/index.ts';
import {
  createFallbackTextMeasurer,
  createFontMetricsOracle,
  fallbackCharWidth,
} from '../../packages/render/src/primitives/text-metrics.ts';
import { createChart, createChartRegistry, type Chart } from '../../packages/runtime/src/index.ts';
import { bar, scatter } from '../../packages/traces-basic/src/index.ts';

/** What the troika mock uses of three's `Object3D` (three is no dependency of the repo root). */
interface Node3D {
  readonly children: readonly object[];
  add(child: object): unknown;
  remove(child: object): unknown;
}

// troika typesets in a worker with browser globals; mocked by path, like the trace packages'
// tests (and three is loaded by path too: render depends on both, the repo root on neither).
// `sync` records what each label is typeset from.
const typeset = vi.hoisted(() => [] as string[]);
vi.mock('../../packages/render/node_modules/troika-three-text', async () => {
  const { Object3D } = await vi.importActual<{ Object3D: new () => Node3D }>(
    '../../packages/render/node_modules/three/build/three.module.js',
  );
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    text = '';
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: object): void {
      this.add(text);
    }
    removeText(text: object): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      for (const child of this.children) typeset.push((child as Text).text);
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

const FONT = { family: 'sans-serif', size: 12 };

/** Labels in both scripts: plain, with vowel marks, and mixed with digits and Latin text. */
const ARABIC = {
  title: 'المبيعات الشهرية 2024',
  vowelled: 'مَبِيعَات',
  plain: 'مبيعات',
  mixed: 'Q1 مبيعات 12.5%',
  sentence: 'إجمالي المبيعات الشهرية حسب المنطقة والمنتج',
};
const HEBREW = {
  title: 'מכירות (אלפים)',
  vowelled: 'שָׁלוֹם',
  plain: 'שלום',
  mixed: 'רבעון Q1: 12.5%',
  sentence: 'סך המכירות החודשיות לפי אזור ומוצר',
};

describe.each([
  ['Arabic', ARABIC],
  ['Hebrew', HEBREW],
])('%s labels on the measurement fallback', (_, labels) => {
  const oracle = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });

  it('measure to finite, positive sizes', () => {
    for (const text of Object.values(labels)) {
      const m = oracle.measureText(text, FONT);
      expect(m.width, text).toBeGreaterThan(0);
      expect(Number.isFinite(m.width), text).toBe(true);
      expect(m.height, text).toBeCloseTo(12 * 1.2);
      expect(m.lineCount, text).toBe(1);
      expect(oracle.measureAdvance(text, FONT), text).toBeGreaterThanOrEqual(m.width);
    }
    // Two lines, and bold measures wider.
    expect(oracle.measureText(`${labels.title}\n${labels.plain}`, FONT).lineCount).toBe(2);
    expect(oracle.measureWidth(labels.title, { ...FONT, weight: 700 })).toBeGreaterThan(
      oracle.measureWidth(labels.title, FONT),
    );
  });

  it('wrap without losing or reordering a word', () => {
    const lines = oracle.wrapText(labels.sentence, FONT, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(oracle.measureWidth(line, FONT)).toBeLessThanOrEqual(100);
    const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);
    expect(lines.flatMap(words)).toEqual(words(labels.sentence));
  });

  it('ellipsize to the width, cutting between letters and never inside one', () => {
    const cut = oracle.ellipsize(labels.sentence, FONT, 80);
    expect(cut.endsWith('…')).toBe(true);
    expect(oracle.measureWidth(cut, FONT)).toBeLessThanOrEqual(80);
    expect(labels.sentence.startsWith(cut.slice(0, -1))).toBe(true);
    // A vowelled word: the cut never leaves a base letter without its marks.
    const text = `${labels.vowelled} ${labels.vowelled}`;
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
    for (let width = 4; width < oracle.measureWidth(text, FONT); width += 3) {
      const kept = oracle.ellipsize(text, FONT, width).replace(/…$/, '');
      const boundaries = graphemes.map((g) => g.index);
      expect([...boundaries, text.length], `at ${width}px`).toContain(kept.length);
    }
  });
});

/** A WebGL-free stand-in for three's renderer: the calls a render root makes, as no-ops. */
function fakeRenderer(): never {
  const noop = (): void => {};
  return {
    domElement: document.createElement('canvas'),
    autoClear: true,
    info: { autoReset: true, reset: noop },
    renderLists: { dispose: noop },
    setPixelRatio: noop,
    setSize: noop,
    setRenderTarget: noop,
    setClearColor: noop,
    clear: noop,
    setScissor: noop,
    setScissorTest: noop,
    setViewport: noop,
    render: noop,
    dispose: noop,
    forceContextLoss: noop,
  } as never;
}

let chart: Chart | undefined;
let container: HTMLElement;

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  typeset.length = 0;
  document.body.replaceChildren();
});

async function draw(figure: {
  data: object[];
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
}): Promise<Chart> {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
  chart = createChart(container, figure, {
    registry: createChartRegistry().register(...builtinComponents, bar, scatter, ar, he),
    renderRoot: { createRenderer: fakeRenderer },
  });
  await componentsReady(chart);
  return chart;
}

const MONTHS = [0, 2, 4, 6, 8, 10].map((month) => Date.UTC(2024, month, 1));

describe('a figure with right-to-left labels', () => {
  it.each([
    [ar, ARABIC, HEBREW],
    [he, HEBREW, ARABIC],
  ])('draws with config.locale $name', async (locale, own, other) => {
    const c = await draw({
      data: [
        { type: 'bar', name: own.plain, x: MONTHS, y: [42, 51, 63, 71, 68, 73] },
        {
          type: 'scatter',
          name: other.mixed,
          x: MONTHS,
          y: [40, 48, 60, 66, 70, 69],
          mode: 'lines+markers+text',
          text: MONTHS.map(() => own.vowelled),
        },
      ],
      layout: {
        title: { text: own.title },
        xaxis: { type: 'date', tickformat: '%B', dtick: 'M2', title: { text: own.mixed } },
        yaxis: { title: { text: other.title } },
        showlegend: true,
        legend: { title: { text: own.plain } },
        annotations: [{ x: MONTHS[2], y: 63, text: other.vowelled, showarrow: true }],
      },
      config: { locale: locale.name },
    });

    // The text engine got every label in logical order, as written: bidi is its job.
    for (const text of [own.title, own.mixed, other.title, own.plain, other.mixed, own.vowelled]) {
      expect(typeset, text).toContain(text);
    }
    expect(typeset).toContain(other.vowelled);
    // Month names come from the locale (plotly.js's `ar` and `he` formats).
    const january = locale.format?.months?.[0];
    expect(january).toMatch(/[\u0590-\u06ff]/);
    expect(typeset).toContain(january);
    for (const text of typeset) expect(text).not.toMatch(/[‪-‮⁦-⁩]/);

    // The layout that measured them is sound: a plot area inside the figure.
    const size = c.fullLayout?.['_size'] as { w?: number; h?: number } | undefined;
    if (size) {
      expect(size.w).toBeGreaterThan(0);
      expect(size.h).toBeGreaterThan(0);
    }
    // And the description carries the same text for screen readers.
    const description = await c.describe();
    expect(description?.label).toContain(own.title);
    expect(description?.axes.join(' ')).toContain(other.title);
    expect(description?.traces.join(' ')).toContain(own.plain);
    expect(container.getAttribute('aria-label')).toContain(own.title);
  });

  it('redraws when the labels change script', async () => {
    const c = await draw({
      data: [{ type: 'bar', name: 'Sales', x: ['A', 'B'], y: [1, 2] }],
      layout: { title: { text: 'Monthly sales' }, showlegend: true },
      config: {},
    });
    await c.react({
      data: [{ type: 'bar', name: HEBREW.plain, x: [ARABIC.plain, HEBREW.plain], y: [1, 2] }],
      layout: { title: { text: ARABIC.title }, showlegend: true },
      config: { locale: 'ar' },
    });
    await componentsReady(c);
    expect(typeset).toContain(ARABIC.title);
    expect(typeset).toContain(HEBREW.plain);
    expect((await c.describe())?.axes.join(' ')).toContain(ARABIC.plain);
  });
});

describe('known limits of the measurement fallback (see the locales guide)', () => {
  const oracle = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });

  it('has no shaping: every Arabic and Hebrew code point is one average glyph', () => {
    for (const ch of 'مبيعاتשלום') expect(fallbackCharWidth(ch.codePointAt(0)!)).toBe(0.556);
    // Joined Arabic letters are narrower in a font; here a word is its letter count.
    expect(oracle.measureWidth(ARABIC.plain, FONT)).toBeCloseTo(6 * 0.556 * 12);
  });

  it('counts vowel marks as letters, so vowelled text measures too wide', () => {
    // Harakat and niqqud are combining marks that take no width in a font.
    const marks = (s: string): number => [...s].filter((ch) => /\p{Mn}/u.test(ch)).length;
    for (const { plain, vowelled } of [ARABIC, HEBREW]) {
      expect(marks(vowelled)).toBeGreaterThan(0);
      expect(oracle.measureWidth(vowelled, FONT) - oracle.measureWidth(plain, FONT)).toBeCloseTo(
        marks(vowelled) * 0.556 * 12,
      );
    }
  });

  it('has no bidi: a width is the sum of the code points, in whatever order', () => {
    const reversed = [...ARABIC.mixed].reverse().join('');
    expect(oracle.measureWidth(reversed, FONT)).toBeCloseTo(
      oracle.measureWidth(ARABIC.mixed, FONT),
    );
  });
});
