// @vitest-environment jsdom
/**
 * `clickmode` (E6.3): which of `click` and click-selection a press without a drag produces, shift
 * toggling points in the current selection, and where a click on empty space deselects. Same figure
 * as `interaction.test.ts`: 640×400, margins l 40, r 20, t 30, b 50, so the plot area is x 40–620,
 * y 30–350; with x in [0, 10] and y in [0, 100], data (x, y) sits at container
 * (40 + 58·x, 350 − 3.2·y).
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ChartEventName } from '../events.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
/** Five points on the diagonal, at x = 1, 3, 5, 7, 9. */
const FIVE = { type: 'dots', x: [1, 3, 5, 7, 9], y: [10, 30, 50, 70, 90] };

const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;
/** Container position of point `i` of {@link FIVE}. */
const at = (i: number): [number, number] => [cx(1 + 2 * i), cy(10 + 20 * i)];

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  vi.restoreAllMocks();
});

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(
    t.container,
    { data, layout: { margin: MARGIN, ...RANGES, ...layout } } as FigureInput,
    t.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

/** A press and release at one place, then the pipeline run the selection schedules. */
async function click(
  c: Chart,
  [x, y]: readonly [number, number],
  init: Partial<PointerEventInit> = {},
): Promise<void> {
  for (const type of ['pointerdown', 'pointerup']) {
    c.three.root.canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
        ...init,
      }),
    );
  }
  await c.relayout({});
}

interface Logged {
  name: string;
  /** `[curveNumber, pointNumber]` of the event's points. */
  points: [number, number][];
}

function record(c: Chart, ...names: ChartEventName[]): Logged[] {
  const log: Logged[] = [];
  for (const name of names) {
    c.on(name, (payload: unknown) => {
      const points = (payload as { points?: { curveNumber: number; pointNumber: number }[] })
        ?.points;
      log.push({ name, points: (points ?? []).map((p) => [p.curveNumber, p.pointNumber]) });
    });
  }
  return log;
}

/** The selection each trace's view was last drawn with. */
function drawn(): Map<number, readonly number[] | null | undefined> {
  return new Map(t.log.updates.map((u) => [u.index, u.selected]));
}

const SHIFT = { shiftKey: true };

describe('shift-click', () => {
  it('toggles the clicked point in the selection, kept in index order', async () => {
    const c = await chart([FIVE], { clickmode: 'event+select' });
    const log = record(c, 'selected');
    // Nothing selected yet: shift selects like a plain click.
    await click(c, at(3), SHIFT);
    expect(drawn().get(0)).toEqual([3]);
    // Adds, in index order whatever the click order.
    await click(c, at(1), SHIFT);
    expect(drawn().get(0)).toEqual([1, 3]);
    // A selected point is removed.
    await click(c, at(3), SHIFT);
    expect(drawn().get(0)).toEqual([1]);
    // `selected` reports the whole selection after each click.
    expect(log.map((l) => l.points)).toEqual([
      [[0, 3]],
      [
        [0, 1],
        [0, 3],
      ],
      [[0, 1]],
    ]);
    // Without shift the click replaces the selection.
    await click(c, at(4));
    expect(drawn().get(0)).toEqual([4]);
  });

  it('leaves the selections of the other traces as they are', async () => {
    const other = { type: 'dots', x: [2, 8], y: [80, 20] };
    const c = await chart([FIVE, other], { clickmode: 'event+select' });
    await click(c, at(2));
    // A plain click dims the rest of the subplot: the other trace is selected, with nothing in it.
    expect(drawn().get(0)).toEqual([2]);
    expect(drawn().get(1)).toEqual([]);
    await click(c, [cx(8), cy(20)], SHIFT);
    expect(drawn().get(0)).toEqual([2]);
    expect(drawn().get(1)).toEqual([1]);
    // Toggling the other trace's point off again leaves the first trace selected.
    await click(c, [cx(8), cy(20)], SHIFT);
    expect(drawn().get(0)).toEqual([2]);
    expect(drawn().get(1)).toEqual([]);
  });
});

describe('clickmode', () => {
  it("'select' selects without a click event", async () => {
    const c = await chart([FIVE], { clickmode: 'select' });
    const log = record(c, 'click', 'selected');
    await click(c, at(2));
    expect(log).toEqual([{ name: 'selected', points: [[0, 2]] }]);
    expect(drawn().get(0)).toEqual([2]);
  });

  it("'none' neither reports nor selects the clicked point", async () => {
    const c = await chart([FIVE], { clickmode: 'none' });
    const log = record(c, 'click', 'selected');
    t.log.updates.length = 0;
    await click(c, at(2));
    expect(log).toEqual([]);
    expect(t.log.updates.some((u) => Array.isArray(u.selected))).toBe(false);
  });

  it('reports no points with hovermode false: clicks read the hovered points', async () => {
    const c = await chart([FIVE], { clickmode: 'event+select', hovermode: false });
    const log = record(c, 'click', 'selected');
    t.log.updates.length = 0;
    await click(c, at(2));
    expect(log).toEqual([]);
    expect(t.log.updates.some((u) => Array.isArray(u.selected))).toBe(false);
  });
});

describe('clicking empty space', () => {
  it('deselects on the plot area only, not on the axis strips or margins', async () => {
    const c = await chart([FIVE], { clickmode: 'event+select' });
    const log = record(c, 'deselect');
    await click(c, at(2));
    // Below the plot (x axis strip), left of it (y axis strip), and in the top margin.
    await click(c, [cx(5), 365]);
    await click(c, [25, cy(50)]);
    await click(c, [cx(5), 10]);
    expect(log).toEqual([]);
    expect(drawn().get(0)).toEqual([2]);
    // Empty plot area, far from every point.
    await click(c, [cx(8), cy(20)]);
    expect(log.map((l) => l.name)).toEqual(['deselect']);
    expect(drawn().get(0)).toBeNull();
  });

  it('says nothing when there was no selection to clear', async () => {
    const c = await chart([FIVE], { clickmode: 'event+select' });
    const log = record(c, 'deselect', 'selected', 'click');
    await click(c, [cx(8), cy(20)]);
    expect(log).toEqual([]);
  });
});

describe("a point that is not one of its trace's own", () => {
  /**
   * 'pairs': dots whose hover point says what a click on it selects (`HoverPoint.selects`): the
   * point and the next one, and nothing for the last point. Its `eventData` reports the other
   * points of the selection it is given.
   */
  function pairs() {
    const log = createLog();
    const base = createDotsModule(log);
    const selections: (readonly number[] | undefined)[] = [];
    const module: typeof base = {
      ...base,
      type: 'pairs',
      hoverPoints: (calc, trace, query, ctx) =>
        base.hoverPoints!(calc, trace, query, ctx).map((p) => ({
          ...p,
          selects: p.pointIndex === 4 ? [] : [p.pointIndex, p.pointIndex + 1],
        })),
      eventData: (_calc, _trace, i, selection) => {
        selections.push(selection);
        return { others: selection?.filter((j) => j !== i) };
      },
    };
    t.registry.register(module);
    const drawnWith = (): readonly number[] | null | undefined => log.updates.at(-1)?.selected;
    return { selections, drawnWith };
  }

  it('selects what it names instead of itself, and shift toggles those', async () => {
    const { drawnWith } = pairs();
    const c = await chart([{ ...FIVE, type: 'pairs' }], { clickmode: 'event+select' });
    const log = record(c, 'click', 'selected');
    await click(c, at(1));
    expect(drawnWith()).toEqual([1, 2]);
    // The click is still the click on the point itself.
    expect(log).toEqual([
      { name: 'click', points: [[0, 1]] },
      {
        name: 'selected',
        points: [
          [0, 1],
          [0, 2],
        ],
      },
    ]);
    // Shift toggles each of them: 2 is taken out, 3 comes in.
    await click(c, at(2), SHIFT);
    expect(drawnWith()).toEqual([1, 3]);
  });

  it('selects nothing when it names nothing', async () => {
    const { drawnWith } = pairs();
    const c = await chart([{ ...FIVE, type: 'pairs' }], { clickmode: 'event+select' });
    await click(c, at(1));
    expect(drawnWith()).toEqual([1, 2]);
    // A plain click replaces the selection, here with none of the trace's points.
    await click(c, at(4));
    expect(drawnWith()).toEqual([]);
  });

  it('`eventData` is given the selection the point is part of', async () => {
    const { selections } = pairs();
    const c = await chart([{ ...FIVE, type: 'pairs' }], { clickmode: 'event+select' });
    const others: unknown[] = [];
    c.on('selected', (payload) => {
      others.push(...payload.points.map((p) => p['others']));
    });
    await click(c, at(1));
    expect(selections).toEqual([
      [1, 2],
      [1, 2],
    ]);
    // The same list for every point of the event.
    expect(selections[0]).toBe(selections[1]);
    expect(others).toEqual([[2], [1]]);
  });
});
