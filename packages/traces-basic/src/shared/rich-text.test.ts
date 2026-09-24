import { layoutTextRuns, type TextFont, type TextLabel } from '@mk7s/holochart-render';
import type { ComponentPointerEvent, SubplotInfo } from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cartesianLinkAt,
  fadeRuns,
  handleLinkPointer,
  hasLink,
  labelContent,
  measureLabel,
  richLabel,
  scaleRuns,
} from './rich-text.ts';

const FONT: TextFont = { family: 'sans-serif', size: 10 };

function pointer(type: ComponentPointerEvent['type'], x = 0, y = 0): ComponentPointerEvent {
  return {
    type,
    x,
    y,
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    native: undefined,
    cursor: undefined,
  };
}

describe('richLabel', () => {
  it('leaves plain text to the plain path', () => {
    expect(richLabel('plain', FONT)).toBeUndefined();
    expect(richLabel('', FONT)).toBeUndefined();
    expect(labelContent('plain', FONT)).toEqual({ text: 'plain', font: FONT, lineCount: 1 });
  });

  it('keeps label-wide styles single-run, merged into the font', () => {
    const bold = richLabel('<b>50%</b>', FONT)!;
    expect(bold.runs).toBeUndefined();
    expect(bold.text).toBe('50%');
    expect(bold.font).toEqual({ ...FONT, weight: 'bold' });
    // Only line breaks and entities: plain text, the very same font.
    const br = richLabel('a &amp; b<br>c', FONT)!;
    expect(br).toEqual({ text: 'a & b\nc', font: FONT, lineCount: 2 });
    expect(br.font).toBe(FONT);
  });

  it('turns mixed styles, colors and links into runs', () => {
    const sup = richLabel('x<sup>2</sup>', FONT)!;
    expect(sup.text).toBe('x2');
    expect(sup.runs).toEqual([[{ text: 'x' }, { text: '2', font: { size: 7 }, shift: 4.2 }]]);
    expect(richLabel('<span style="color:red">red</span>', FONT)!.runs).toBeDefined();
    const link = richLabel('<a href="https://example.com">go</a>', FONT)!;
    expect(hasLink(link)).toBe(true);
    expect(hasLink({ runs: sup.runs! })).toBe(false);
  });

  it('breaks or joins raw newlines', () => {
    expect(richLabel('a\nb<b>c</b>', FONT)!.lineCount).toBe(2);
    const joined = richLabel('a\nb<b>c</b>', FONT, 'space')!;
    expect(joined.lineCount).toBe(1);
    expect(joined.text).toBe('a bc');
  });

  it('measures rich labels as laid out and plain ones as before', () => {
    const plain = measureLabel({ text: 'ab', font: FONT }, 1.2);
    expect(plain.height).toBeCloseTo(12);
    const rich = richLabel('a<b>b</b>', FONT)!;
    const box = measureLabel(rich, 1.2);
    const layout = layoutTextRuns(rich.runs!, { font: FONT, lineHeight: 1.2 });
    expect(box).toEqual({ width: layout.width, height: layout.height });
  });
});

describe('run helpers', () => {
  it('scales run sizes and shifts', () => {
    const runs = richLabel('x<sup>2</sup>', FONT)!.runs!;
    expect(scaleRuns(runs, 1)).toBe(runs);
    const half = scaleRuns(runs, 0.5);
    expect(half[0]![0]).toBe(runs[0]![0]);
    expect(half[0]![1]!.font?.size).toBeCloseTo(3.5);
    expect(half[0]![1]!.shift).toBeCloseTo(2.1);
  });

  it('fades only explicitly colored runs', () => {
    const runs = richLabel('a<span style="color:#ff0000">b</span>', FONT)!.runs!;
    expect(fadeRuns(runs, 1)).toBe(runs);
    const faded = fadeRuns(runs, 0.5);
    expect(faded[0]![0]).toBe(runs[0]![0]);
    expect(faded[0]![1]!.color).toEqual([1, 0, 0, 0.5]);
  });
});

describe('label links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const content = richLabel('<a href="https://example.com/">link</a> tail', FONT)!;
  const label: TextLabel = {
    text: content.text,
    x: 1,
    y: 2,
    font: FONT,
    runs: content.runs!,
    anchorX: 'left',
    anchorY: 'baseline',
  };
  // Linear (1, 2) → viewport (10, 20) px, y up; the plot area starts at (50, 30) in the container.
  const transform = { scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 };
  const subplot = { rect: { x: 50, y: 30, width: 200, height: 100 } } as unknown as SubplotInfo;
  const ax = 60;
  const ay = 110;

  it('finds the link under a pointer in container px', () => {
    const linkWidth = layoutTextRuns(content.runs!, { font: FONT }).items[0]!.width;
    expect(cartesianLinkAt([label], transform, subplot, ax + 2, ay - 3)?.href).toBe(
      'https://example.com/',
    );
    expect(cartesianLinkAt([label], transform, subplot, ax + linkWidth - 1, ay - 3)).not.toBeNull();
    // Over the plain tail, below the line, outside the plot area, or without a subplot: nothing.
    expect(cartesianLinkAt([label], transform, subplot, ax + linkWidth + 8, ay - 3)).toBeNull();
    expect(cartesianLinkAt([label], transform, subplot, ax + 2, ay + 12)).toBeNull();
    const outside = { rect: { x: 70, y: 30, width: 200, height: 100 } } as unknown as SubplotInfo;
    expect(cartesianLinkAt([label], transform, outside, ax + 2, ay - 3)).toBeNull();
    expect(cartesianLinkAt([label], transform, undefined, ax + 2, ay - 3)).toBeNull();
  });

  it('honours the label offset', () => {
    const shifted: TextLabel = { ...label, offset: [0, 20] };
    expect(cartesianLinkAt([shifted], transform, subplot, ax + 2, ay - 3)).toBeNull();
    expect(cartesianLinkAt([shifted], transform, subplot, ax + 2, ay + 17)).not.toBeNull();
  });

  it('opens links on click and shows a pointer on move', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const link = { href: 'https://example.com/', target: '_blank' };
    const move = pointer('move');
    expect(handleLinkPointer(move, link)).toBe(true);
    expect(move.cursor).toBe('pointer');
    expect(handleLinkPointer(pointer('down'), link)).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(handleLinkPointer(pointer('click'), link)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener');
    expect(handleLinkPointer(pointer('wheel'), link)).toBe(false);
    expect(handleLinkPointer(pointer('leave'), link)).toBe(false);
    expect(handleLinkPointer(pointer('move'), null)).toBe(false);
  });
});
