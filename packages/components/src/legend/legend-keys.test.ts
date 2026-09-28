// @vitest-environment jsdom
/**
 * The legend's keyboard access (plan E17.4): transparent toggle buttons over the WebGL items, one
 * tab stop with roving focus, clicks and Shift double-clicks, focus kept across redraws.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegendKeys, type LegendKeyItem } from './legend-keys.ts';

const LAYOUT = { font: { color: '#444' }, legend: { font: { color: '#123456' } } };
const layout = LAYOUT as unknown as FullLayout;

function item(id: string, label: string, pressed = true, top = 0): LegendKeyItem {
  return { id, label, pressed, left: 500, top, width: 80, height: 19 };
}

let host: HTMLElement;
let keys: LegendKeys;
let act: ReturnType<typeof vi.fn<(id: string, double: boolean) => void>>;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const before = document.createElement('span');
  const anchor = document.createComment('legend');
  const after = document.createElement('span');
  host.append(before, anchor, after);
  act = vi.fn<(id: string, double: boolean) => void>();
  keys = new LegendKeys(anchor, act);
});

afterEach(() => {
  keys.destroy();
  host.remove();
});

function buttons(): HTMLButtonElement[] {
  return [...keys.root.querySelectorAll('button')];
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? keys.root).dispatchEvent(e);
  return e;
}

describe('LegendKeys', () => {
  it('mounts in place of its anchor as a labelled toolbar of toggle buttons', () => {
    keys.update([item('t0', 'Revenue'), item('t1', 'Costs &\nfees', false, 19)], layout);
    expect(host.children[1]).toBe(keys.root);
    expect(keys.root.getAttribute('role')).toBe('toolbar');
    expect(keys.root.getAttribute('aria-label')).toBe('Legend');
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual(['Revenue', 'Costs & fees']);
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(buttons()[1]?.style.top).toBe('19px');
    expect(keys.root.style.getPropertyValue('--hc-legend-focus')).toBe('#123456');
    // One tab stop.
    expect(buttons().map((b) => b.tabIndex)).toEqual([0, -1]);
  });

  it('moves focus with the arrow keys, Home and End (wrapping like the modebar)', () => {
    keys.update([item('t0', 'A'), item('t1', 'B'), item('t2', 'C')], layout);
    buttons()[0]?.focus();
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons()[1]);
    press('ArrowRight');
    press('ArrowRight');
    expect(document.activeElement).toBe(buttons()[0]);
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons()[2]);
    press('Home');
    expect(document.activeElement).toBe(buttons()[0]);
    press('End');
    expect(document.activeElement).toBe(buttons()[2]);
    expect(buttons().map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
    expect(press('Tab').defaultPrevented).toBe(false);
  });

  it('clicks toggle, Shift + Enter / Space double-click', () => {
    keys.update([item('t0', 'A'), item('t1', 'B')], layout);
    buttons()[1]?.click();
    expect(act).toHaveBeenLastCalledWith('t1', false);
    buttons()[1]?.focus();
    press('Enter', { shiftKey: true });
    expect(act).toHaveBeenLastCalledWith('t1', true);
    press(' ', { shiftKey: true });
    expect(act).toHaveBeenCalledTimes(3);
  });

  it('keeps the focused item focused across a redraw, and moves the tab stop off a gone one', () => {
    keys.update([item('t0', 'A'), item('t1', 'B')], layout);
    const b = buttons()[1] as HTMLButtonElement;
    b.focus();
    keys.update([item('t0', 'A'), item('t1', 'B', false)], layout);
    expect(buttons()[1]).toBe(b);
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    keys.update([item('t0', 'A')], layout);
    expect(buttons().map((x) => x.tabIndex)).toEqual([0]);
    keys.update([], layout);
    expect(keys.root.hidden).toBe(true);
  });
});
