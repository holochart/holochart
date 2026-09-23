import { describe, expect, it, vi } from 'vitest';
import { ClickDispatcher, legendToggle, type Timers, type ToggleTrace } from './toggle.ts';

function traces(
  specs: [visible: boolean | 'legendonly', group?: string, inLegend?: boolean][],
): ToggleTrace[] {
  return specs.map(([visible, group = '', inLegend = true], index) => ({
    index,
    visible,
    legendgroup: group,
    inLegend,
  }));
}

const entries = (m: Map<number, unknown>) => [...m.entries()];

describe('legendToggle', () => {
  it('toggles one item between visible and legendonly', () => {
    const t = traces([[true], [true]]);
    expect(entries(legendToggle(t, 0, 'toggle', 'togglegroup'))).toEqual([[0, 'legendonly']]);
    const back = traces([['legendonly'], [true]]);
    expect(entries(legendToggle(back, 0, 'toggle', 'togglegroup'))).toEqual([[0, true]]);
  });

  it('toggles the whole legendgroup unless groupclick is toggleitem', () => {
    const t = traces([[true, 'g'], [true, 'g'], [true]]);
    expect(entries(legendToggle(t, 1, 'toggle', 'togglegroup'))).toEqual([
      [0, 'legendonly'],
      [1, 'legendonly'],
    ]);
    expect(entries(legendToggle(t, 1, 'toggle', 'toggleitem'))).toEqual([[1, 'legendonly']]);
  });

  it('isolates an item, and restores everything when it is already isolated', () => {
    const t = traces([[true], [true], ['legendonly'], [false]]);
    expect(entries(legendToggle(t, 1, 'toggleothers', 'togglegroup'))).toEqual([[0, 'legendonly']]);
    const isolated = traces([['legendonly'], [true], ['legendonly'], [false]]);
    expect(entries(legendToggle(isolated, 1, 'toggleothers', 'togglegroup'))).toEqual([
      [0, true],
      [2, true],
    ]);
  });

  it('never touches visible:false traces or traces without a legend item', () => {
    const t = traces([[true], [true, '', false], [false]]);
    expect(entries(legendToggle(t, 0, 'toggleothers', 'togglegroup'))).toEqual([]);
    expect(entries(legendToggle(t, 2, 'toggle', 'togglegroup'))).toEqual([]);
    expect(entries(legendToggle(t, 9, 'toggle', 'togglegroup'))).toEqual([]);
  });
});

function fakeTimers() {
  let now = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  const timers: Timers = {
    set(fn, ms) {
      queue.set(++id, { at: now + ms, fn });
      return id;
    },
    clear(handle) {
      queue.delete(handle as number);
    },
    now: () => now,
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [k, t] of [...queue]) {
      if (t.at <= now) {
        queue.delete(k);
        t.fn();
      }
    }
  };
  return { timers, advance };
}

describe('ClickDispatcher', () => {
  it('fires a single click after the delay', () => {
    const { timers, advance } = fakeTimers();
    const click = vi.fn();
    const dbl = vi.fn();
    const d = new ClickDispatcher<number>(click, dbl, timers);
    d.click(3, 300);
    advance(299);
    expect(click).not.toHaveBeenCalled();
    advance(1);
    expect(click).toHaveBeenCalledWith(3);
    expect(dbl).not.toHaveBeenCalled();
  });

  it('turns click + double-click into one double-click, in either report order', () => {
    const { timers, advance } = fakeTimers();
    const click = vi.fn();
    const dbl = vi.fn();
    const d = new ClickDispatcher<number>(click, dbl, timers);
    d.click(1, 300);
    advance(100);
    d.doubleClick(1);
    d.click(1, 300); // the second click reported after the double-click
    advance(1000);
    expect(click).not.toHaveBeenCalled();
    expect(dbl).toHaveBeenCalledTimes(1);
  });

  it('fires at once without a double-click action, and cancels pending clicks', () => {
    const { timers, advance } = fakeTimers();
    const click = vi.fn();
    const d = new ClickDispatcher<number>(click, vi.fn(), timers);
    d.click(2, 0);
    expect(click).toHaveBeenCalledWith(2);
    d.click(5, 300);
    d.cancel();
    advance(1000);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending click on another item before a double-click', () => {
    const { timers } = fakeTimers();
    const click = vi.fn();
    const dbl = vi.fn();
    const d = new ClickDispatcher<number>(click, dbl, timers);
    d.click(1, 300);
    d.doubleClick(2);
    expect(click).toHaveBeenCalledWith(1);
    expect(dbl).toHaveBeenCalledWith(2);
  });
});
