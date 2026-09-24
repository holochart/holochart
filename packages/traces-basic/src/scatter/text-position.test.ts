import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type ComponentPointerEvent,
  type SubplotInfo,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scatter, type ScatterCalc } from './index.ts';
import { textLabels } from './plot.ts';
import {
  lineCount,
  plainText,
  TEXT_LINE_HEIGHT,
  TEXT_POSITIONS,
  textPlacement,
} from './text-position.ts';

// troika typesets in a worker with browser globals; the view test only needs its object graph.
// Mocked by path, like the scatter tests: traces-basic does not depend on troika, render does.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

describe('textPlacement', () => {
  const fs = 12;

  it('lists the nine Plotly positions', () => {
    expect(TEXT_POSITIONS).toHaveLength(9);
    expect(TEXT_POSITIONS).toContain('middle center');
    expect(TEXT_LINE_HEIGHT).toBe(1.3);
  });

  // Expected values straight from Plotly's formula, one line of text.
  const cases: [string, 'left' | 'center' | 'right', number, number][] = [
    ['top left', 'right', -1, -1],
    ['top center', 'center', 0, -1],
    ['top right', 'left', 1, -1],
    ['middle left', 'right', -1, 0],
    ['middle center', 'center', 0, 0],
    ['middle right', 'left', 1, 0],
    ['bottom left', 'right', -1, 1],
    ['bottom center', 'center', 0, 1],
    ['bottom right', 'left', 1, 1],
  ];

  it.each(cases)('%s without markers', (pos, anchorX, _sh, sv) => {
    const dy = fs * 0.75 + ((sv - 1) * fs) / 2;
    expect(textPlacement(pos, fs, 0, 1)).toEqual({
      anchorX,
      anchorY: 'baseline',
      offset: [0, dy],
    });
  });

  it.each(cases)('%s with markers', (pos, anchorX, sh, sv) => {
    const r = 5 / 0.8 + 1;
    const p = textPlacement(pos, fs, 5, 1);
    expect(p.anchorX).toBe(anchorX);
    expect(p.offset[0]).toBeCloseTo(sh * r, 12);
    expect(p.offset[1]).toBeCloseTo(fs * 0.75 + sv * r + ((sv - 1) * fs) / 2, 12);
  });

  it('gives exact values for a few positions', () => {
    expect(textPlacement('middle center', 12, 0, 1).offset).toEqual([0, 3]);
    expect(textPlacement('top center', 12, 0, 1).offset).toEqual([0, -3]);
    expect(textPlacement('bottom center', 12, 0, 1).offset).toEqual([0, 9]);
    // r = 4 / 0.8 + 1 = 6
    expect(textPlacement('top left', 12, 4, 1).offset).toEqual([-6, -9]);
    expect(textPlacement('bottom right', 12, 4, 1).offset).toEqual([6, 15]);
    expect(textPlacement('middle right', 12, 4, 1).offset).toEqual([6, 3]);
  });

  it('shifts multi-line text by the block height', () => {
    // numLines = (3 − 1)·1.3 + 1 = 3.6
    expect(textPlacement('middle center', 10, 0, 3).offset[1]).toBeCloseTo(7.5 - 18, 12);
    expect(textPlacement('top center', 10, 0, 3).offset[1]).toBeCloseTo(7.5 - 36, 12);
    // Bottom placement starts below the point regardless of the line count.
    expect(textPlacement('bottom center', 10, 0, 3).offset[1]).toBeCloseTo(7.5, 12);
  });

  it('treats unknown positions as middle center', () => {
    expect(textPlacement('nonsense', 12, 4, 1)).toEqual(textPlacement('middle center', 12, 4, 1));
  });

  it('ignores invalid marker radii', () => {
    expect(textPlacement('top center', 12, Number.NaN, 1).offset).toEqual([0, -3]);
  });
});

describe('plainText', () => {
  it('converts <br> variants to newlines', () => {
    expect(plainText('a<br>b<BR>c<br/>d<br />e')).toBe('a\nb\nc\nd\ne');
  });

  it('strips other tags', () => {
    expect(plainText('<b>bold</b> <i>it</i> x<sup>2</sup> <a href="u">link</a>')).toBe(
      'bold it x2 link',
    );
  });

  it('keeps comparison signs that are not tags', () => {
    expect(plainText('a < b > c')).toBe('a < b > c');
  });

  it('decodes entities once', () => {
    expect(plainText('&amp; &lt; &gt; &quot; &#39; &nbsp;|')).toBe('& < > " \'  |');
    expect(plainText('&amp;lt;')).toBe('&lt;');
    expect(plainText('&lt;b&gt;')).toBe('<b>');
    expect(plainText('&#x41;&unknown;')).toBe('A&unknown;');
  });

  it('turns raw newlines into spaces like Plotly', () => {
    expect(plainText('a\nb\r\nc')).toBe('a b c');
  });

  it('returns plain strings unchanged', () => {
    expect(plainText('hello')).toBe('hello');
  });
});

describe('lineCount', () => {
  it('counts lines', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a')).toBe(1);
    expect(lineCount(plainText('a<br>b<br>c'))).toBe(3);
  });
});

// ---- Rich text labels (E2.10) -------------------------------------------------------------------

const registry = createChartRegistry().register(scatter);
const linearAxis = (): AxisInfo =>
  ({ scale: createScale({ type: 'linear' }), type: 'linear', full: {} }) as unknown as AxisInfo;

function scatterTrace(trace: Record<string, unknown>): { trace: FullTrace; calc: ScatterCalc } {
  const { fullData } = supplyDefaults(
    { data: [{ mode: 'text', x: [1, 2, 3], y: [1, 2, 3], ...trace }], layout: {} },
    registry.core,
  );
  const t = fullData[0]!;
  const calc = scatter.calc!(t, {
    fullLayout: {} as never,
    index: 0,
    xaxis: linearAxis(),
    yaxis: linearAxis(),
  }) as ScatterCalc;
  return { trace: t, calc };
}

describe('scatter rich-text labels', () => {
  it('keeps plain and break-only labels exactly as before', () => {
    const { trace, calc } = scatterTrace({
      text: ['plain', 'a<br>b', 'a\nb'],
      textfont: { size: 10 },
    });
    const labels = textLabels(trace, calc, {});
    expect(labels.map((l) => l.text)).toEqual(['plain', 'a\nb', 'a b']);
    expect(labels[1]!.font).toEqual(labels[0]!.font);
    expect(labels.every((l) => l.runs === undefined)).toBe(true);
    // Placement still counts lines.
    expect(labels[1]!.offset).toEqual(textPlacement('middle center', 10, 0, 2).offset);
  });

  it('merges label-wide styles into the font and draws mixed ones as runs', () => {
    const { trace, calc } = scatterTrace({
      text: ['<b>bold</b>', 'x<sup>2</sup>', '<span style="color:#ff0000">r</span>ed\nx'],
      opacity: 0.5,
      textfont: { size: 10 },
    });
    const [bold, sup, red] = textLabels(trace, calc, {});
    expect(bold!.runs).toBeUndefined();
    expect(bold!.font).toMatchObject({ size: 10, weight: 'bold' });
    expect(sup!.text).toBe('x2');
    expect(sup!.runs).toEqual([[{ text: 'x' }, { text: '2', font: { size: 7 }, shift: 4.2 }]]);
    // Raw newlines are spaces (Plotly); explicit run colors take the trace opacity.
    expect(red!.text).toBe('red x');
    expect(red!.runs![0]![0]!.color).toEqual([1, 0, 0, 0.5]);
  });
});

describe('scatter view links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a label link on click and ignores pointers elsewhere', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const { trace, calc } = scatterTrace({
      x: [1],
      y: [1],
      text: ['<a href="https://example.com/">go</a>'],
      textposition: 'middle right',
    });
    const subplot = { rect: { x: 10, y: 20, width: 200, height: 100 } } as unknown as SubplotInfo;
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<ScatterCalc> = {
      trace,
      calc,
      index: 0,
      fullLayout: {} as never,
      subplot,
      xaxis: undefined,
      yaxis: undefined,
      // Point (1, 1) → viewport (50, 50) → container (60, 70).
      transform: { ...IDENTITY_TRANSFORM, scaleX: 50, scaleY: 50 },
      viewport: {} as Viewport,
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => {
        added.splice(added.indexOf(p as Primitive<unknown>), 1);
        p.dispose();
      },
      invalidate: vi.fn(),
    };
    const view = scatter.plot!.create(ctx);
    const event = (type: ComponentPointerEvent['type'], x: number, y: number) =>
      ({ type, x, y, button: 0, cursor: undefined }) as ComponentPointerEvent;
    // `middle right` without markers: text starts at the point, its baseline 12 · 0.75 − 6 px
    // below it (one line centered on the point); aim 3 px above the baseline.
    const move = event('move', 60 + 3, 70 + 3 - 3);
    expect(view.handlePointer!(move)).toBe(true);
    expect(move.cursor).toBe('pointer');
    view.handlePointer!(event('click', 63, 70));
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener');
    expect(view.handlePointer!(event('move', 40, 70))).toBe(false);
    // After a zoom the link follows the point.
    view.update(
      { ...ctx, transform: { ...ctx.transform, offsetX: 20 } },
      { calc: false, plot: false, style: false, transform: true },
    );
    expect(view.handlePointer!(event('move', 63, 70))).toBe(false);
    expect(view.handlePointer!(event('move', 83, 70))).toBe(true);
  });
});
