import { createResourceManager, type RectPrimitive, type Viewport } from '@mk7s/holochart-render';
import { describe, expect, it, vi } from 'vitest';
import { defaults, fakeTraceModule, measure, testRegistry } from '../__testing__/fixtures.ts';
import { RectBatch } from '../shared/batches.ts';
import { buildLegendScene, legendComponent } from './legend.ts';

/** Pattern glyphs (plan E8.10): bar and fill glyphs whose trace has a `pattern`. */

const SIZE = { width: 700, height: 450 };
const AREA = { x: 80, y: 100, width: 460, height: 270 };
const PATTERN = { shape: '/', fgcolor: 'blue' };

function scene(hidden: boolean) {
  const registry = testRegistry(
    [legendComponent],
    fakeTraceModule({
      legendIcon: () => ({ kind: 'bar', fill: { color: 'red', pattern: PATTERN } }),
    } as never),
  );
  const { fullLayout, fullData } = defaults(
    { showlegend: true, paper_bgcolor: '#101010' },
    [hidden ? { visible: 'legendonly' } : {}, {}],
    registry,
  );
  return buildLegendScene(fullLayout, fullData, SIZE, AREA, measure);
}

describe('legend pattern glyphs', () => {
  it("hatches the glyph with the trace's pattern over the paper color, dimmed when hidden", () => {
    const [, glyph] = scene(false).rects;
    expect(glyph!.pattern).toEqual({
      attributes: PATTERN,
      color: [1, 0, 0, 1],
      opacity: 1,
      background: 'rgb(16, 16, 16)',
    });
    const [, hidden] = scene(true).rects;
    expect(hidden!.pattern!.opacity).toBe(0.5);
    // The default color stays undimmed: the pattern's opacity dims it once.
    expect(hidden!.pattern!.color).toEqual([1, 0, 0, 1]);
    expect(hidden!.color).toEqual([1, 0, 0, 0.5]);
  });

  it('draws patterned rects through one pattern fill with legend sizes', () => {
    const ctx = { add: vi.fn(), remove: vi.fn() };
    const batch = new RectBatch(
      ctx,
      { resources: createResourceManager(), invalidate: vi.fn() },
      {} as Viewport,
    );
    const rects = scene(false).rects;
    batch.set(rects);
    const data = (batch.primitive as unknown as { data: { pattern: Record<string, unknown> } })
      .data;
    expect(data.pattern).toMatchObject({
      pattern: rects.map((r) => r.pattern?.attributes),
      opacity: [1, 1, 1],
      background: 'rgb(16, 16, 16)',
      legend: true,
    });
    // Unchanged rects without patterns skip the upload; with patterns they always refresh.
    const update = vi.spyOn(batch.primitive as RectPrimitive, 'update');
    batch.set(rects);
    expect(update).toHaveBeenCalledTimes(1);
    batch.set([rects[0]!]);
    batch.set([rects[0]!]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]![0].pattern).toBeNull();
  });
});
