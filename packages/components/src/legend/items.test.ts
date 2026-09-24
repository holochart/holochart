/**
 * Per-point legend items (M2 wave 1, pie labels): entries per item, de-duplication across traces
 * of one legend group, the `hiddenlabels` click logic, and the module / calc plumbing.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { LegendItem, TraceModule } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import { legendEntries } from './layout.ts';
import { buildLegendScene, legendComponent, legendGlyphOf, legendItemsFor } from './legend.ts';
import { hiddenLabelsToggle } from './toggle.ts';

const registry = testRegistry([legendComponent]);
const SIZE = { width: 700, height: 450 };
const AREA = { x: 80, y: 100, width: 460, height: 270 };

function item(key: string, hidden = false): LegendItem {
  return { key, name: key, hidden, glyph: { kind: 'bar', fill: { color: '#123456' } } };
}

const glyph = (t: FullTrace) => legendGlyphOf(t, { colorway: ['#111111'] });

describe('legendEntries with per-point items', () => {
  const { fullData } = defaults({}, [{}, {}, { legendgroup: 'g' }, {}], registry);
  const items: Record<number, LegendItem[] | undefined> = {
    0: [item('A'), item('B', true)],
    1: [item('B'), item('C')],
    2: [item('A')],
  };
  const itemsOf = (t: FullTrace) => items[t._index];

  it('lists one entry per item, the first trace winning duplicates within a group', () => {
    const entries = legendEntries(fullData, 'normal', glyph, itemsOf);
    expect(entries.map((e) => [e.index, e.key, e.visible])).toEqual([
      [0, 'A', true],
      [0, 'B', 'legendonly'],
      [1, 'C', true],
      // Another legend group shows its own `A`.
      [2, 'A', true],
      // Traces without items keep one entry each.
      [3, undefined, true],
    ]);
  });

  it('keeps per-point items apart when grouping', () => {
    const entries = legendEntries(fullData, 'grouped', glyph, itemsOf);
    expect(entries.map((e) => e.key ?? `trace ${e.index}`)).toEqual([
      'A',
      'B',
      'C',
      'A',
      'trace 3',
    ]);
  });

  it('puts the item keys on the scene hit regions', () => {
    const { fullLayout } = defaults(
      { showlegend: true },
      [{}, {}, { legendgroup: 'g' }, {}],
      registry,
    );
    const scene = buildLegendScene(fullLayout, fullData, SIZE, AREA, measure, itemsOf);
    expect(scene.hits.map((h) => h.key)).toEqual(['A', 'B', 'C', 'A', undefined]);
    // Hidden items are faded like `legendonly` traces.
    const texts = scene.labels.filter((l) => l.text === 'B');
    expect(texts[0]?.color[3]).toBeLessThan(1);
  });
});

describe('hiddenLabelsToggle', () => {
  const keys = ['A', 'B', 'C'];

  it('toggles one label', () => {
    expect(hiddenLabelsToggle([], keys, 'B', 'toggle')).toEqual(['B']);
    expect(hiddenLabelsToggle(['B', 'X'], keys, 'B', 'toggle')).toEqual(['X']);
  });

  it('isolates a label, and restores every label when it is already isolated', () => {
    expect(hiddenLabelsToggle([], keys, 'B', 'toggleothers')?.sort()).toEqual(['A', 'C']);
    expect(hiddenLabelsToggle(['A', 'C'], keys, 'B', 'toggleothers')).toEqual([]);
    // Isolating a hidden label shows it.
    expect(hiddenLabelsToggle(['B'], keys, 'B', 'toggleothers')?.sort()).toEqual(['A', 'C']);
    // Labels not in the legend stay hidden.
    expect(hiddenLabelsToggle(['A', 'C', 'X'], keys, 'B', 'toggleothers')).toEqual(['X']);
  });
});

describe('legendItemsFor', () => {
  const trace = { type: 'pieish', _index: 2 } as unknown as FullTrace;
  const fullLayout = {} as FullLayout;

  it('asks the module with the trace calc', () => {
    const seen: unknown[] = [];
    const module = {
      legendItems: (calc: unknown) => {
        seen.push(calc);
        return [item('A')];
      },
    } as unknown as TraceModule;
    const itemsOf = legendItemsFor({
      fullLayout,
      traceModule: () => module,
      calcdata: (i) => (i === 2 ? 'calc-2' : undefined),
    });
    expect(itemsOf(trace)?.map((i) => i.key)).toEqual(['A']);
    expect(seen).toEqual(['calc-2']);
  });

  it('falls back to one item per trace without a calc, items, or when the module throws', () => {
    const throwing = {
      legendItems: () => {
        throw new Error('boom');
      },
    } as unknown as TraceModule;
    expect(
      legendItemsFor({ fullLayout, traceModule: () => throwing, calcdata: () => 1 })(trace),
    ).toBeUndefined();
    expect(
      legendItemsFor({ fullLayout, traceModule: () => throwing, calcdata: () => undefined })(trace),
    ).toBeUndefined();
    expect(legendItemsFor({ fullLayout, traceModule: () => undefined })(trace)).toBeUndefined();
  });
});
