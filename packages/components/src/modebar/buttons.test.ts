import { describe, expect, it, vi } from 'vitest';
import {
  modebarButtonActive,
  modebarBuiltinButton,
  modebarButtonsKey,
  resolveModebarButtons,
  type ModebarButtonGroup,
  type ModebarResolveInput,
} from './buttons.ts';
import { modebarIcons } from './icons.ts';

const names = (groups: readonly ModebarButtonGroup[]): string[][] =>
  groups.map((g) => g.map((b) => b.name));

const cartesian = (over: Partial<ModebarResolveInput> = {}): ModebarButtonGroup[] =>
  resolveModebarButtons({ hasCartesian: true, hasSelectable: false, warn: vi.fn(), ...over });

describe('resolveModebarButtons', () => {
  it('gives the Plotly v2 cartesian defaults', () => {
    expect(names(cartesian())).toEqual([
      ['toImage'],
      ['zoom2d', 'pan2d'],
      ['zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d'],
    ]);
  });

  it('adds select and lasso only with selectable traces', () => {
    expect(names(cartesian({ hasSelectable: true }))[1]).toEqual([
      'zoom2d',
      'pan2d',
      'select2d',
      'lasso2d',
    ]);
  });

  it('shows only toImage without cartesian axes', () => {
    const groups = resolveModebarButtons({ hasCartesian: false, hasSelectable: true });
    expect(names(groups)).toEqual([['toImage']]);
  });

  it('drops zoom and pan when every axis is fixed', () => {
    expect(names(cartesian({ allAxesFixed: true, hasSelectable: true }))).toEqual([
      ['toImage'],
      ['select2d', 'lasso2d'],
    ]);
  });

  it('removes buttons by name and Plotly alias, case-insensitively, from config and layout', () => {
    const groups = cartesian({
      hasSelectable: true,
      config: { modeBarButtonsToRemove: ['Lasso2d', 'zoom', 'TOIMAGE'] },
      layoutModebar: { remove: ['zoomin', 'autoscale', 'resetScale', 'zoomOut2d'] },
    });
    expect(names(groups)).toEqual([['pan2d', 'select2d']]);
  });

  it('accepts a single string as a name list', () => {
    expect(names(cartesian({ layoutModebar: { remove: 'pan' } }))[1]).toEqual(['zoom2d']);
  });

  it('adds hover and spike buttons by name as a trailing group', () => {
    const groups = cartesian({
      config: { modeBarButtonsToAdd: ['togglespikelines'] },
      layoutModebar: { add: ['hoverClosest'] },
    });
    expect(names(groups).at(-1)).toEqual(['hoverClosestCartesian', 'toggleSpikelines']);
    expect(names(cartesian({ layoutModebar: { add: ['v1hovermode'] } })).at(-1)).toEqual([
      'hoverClosestCartesian',
      'hoverCompareCartesian',
    ]);
  });

  it('adds select2d on request even without selectable traces', () => {
    const groups = cartesian({ config: { modeBarButtonsToAdd: ['select2d'] } });
    expect(names(groups)[1]).toEqual(['zoom2d', 'pan2d', 'select2d']);
  });

  it('ignores cartesian names on non-cartesian figures', () => {
    const groups = resolveModebarButtons({
      hasCartesian: false,
      hasSelectable: false,
      layoutModebar: { add: ['hovercompare'] },
    });
    expect(names(groups)).toEqual([['toImage']]);
  });

  it('removal wins over addition', () => {
    const groups = cartesian({
      layoutModebar: { add: ['hoverclosest'], remove: ['hoverClosestCartesian'] },
    });
    expect(names(groups)).toHaveLength(3);
  });

  it('appends custom buttons as their own group', () => {
    const click = vi.fn();
    const groups = cartesian({
      config: {
        modeBarButtonsToAdd: [
          { name: 'hello', title: 'Say hello', click },
          { name: 'withIcon', icon: modebarIcons.home, click },
          { name: 'badIcon', icon: { nope: 1 }, click },
        ],
      },
    });
    const last = groups.at(-1) ?? [];
    expect(last.map((b) => b.name)).toEqual(['hello', 'withIcon', 'badIcon']);
    expect(last[0]).toMatchObject({ title: 'Say hello', kind: 'action', icon: modebarIcons.dot });
    expect(last[1]).toMatchObject({ title: 'withIcon', icon: modebarIcons.home });
    expect(last[2]?.icon).toBe(modebarIcons.dot);
    expect(last[0]?.custom?.click).toBe(click);
  });

  it('removes custom buttons by name and dedupes them', () => {
    const click = vi.fn();
    const groups = cartesian({
      config: {
        modeBarButtonsToAdd: [
          { name: 'a', click },
          { name: 'A', click },
          { name: 'b', click },
        ],
        modeBarButtonsToRemove: ['B'],
      },
    });
    expect(names(groups).at(-1)).toEqual(['a']);
  });

  it('adds the shape-drawing buttons by name to the drag group, in order (Plotly DRAW_MODES)', () => {
    const groups = cartesian({
      hasSelectable: true,
      config: { modeBarButtonsToAdd: ['drawrect', 'eraseShape'] },
      layoutModebar: { add: ['drawline', 'drawopenpath', 'drawclosedpath', 'drawcircle'] },
    });
    expect(names(groups)[1]).toEqual([
      'zoom2d',
      'pan2d',
      'select2d',
      'lasso2d',
      'drawrect',
      'eraseshape',
      'drawline',
      'drawopenpath',
      'drawclosedpath',
      'drawcircle',
    ]);
    const drawline = modebarBuiltinButton('drawline');
    expect(drawline).toMatchObject({ kind: 'dragmode', dragmode: 'drawline', title: 'Draw line' });
    expect(modebarBuiltinButton('eraseshape')).toMatchObject({
      kind: 'action',
      title: 'Erase active shape',
    });
    expect(modebarButtonActive(drawline, { dragmode: 'drawline' })).toBe(true);
    // Removable like the others; no cartesian axes, no draw buttons.
    const removed = cartesian({
      config: { modeBarButtonsToAdd: ['drawrect'], modeBarButtonsToRemove: ['drawRect'] },
    });
    expect(names(removed)[1]).toEqual(['zoom2d', 'pan2d']);
    const pie = resolveModebarButtons({
      hasCartesian: false,
      hasSelectable: false,
      config: { modeBarButtonsToAdd: ['drawrect'] },
    });
    expect(names(pie)).toEqual([['toImage']]);
  });

  it('warns once per unknown or unsupported name and ignores it', () => {
    const warn = vi.fn();
    const input: ModebarResolveInput = {
      hasCartesian: true,
      hasSelectable: false,
      warn,
      config: {
        modeBarButtonsToAdd: ['zoomm', 'zoomm', 'orbitRotation', { name: 'no click' }],
        modeBarButtonsToRemove: ['sendDataToCloud', 'nothing'],
      },
    };
    const groups = resolveModebarButtons(input);
    resolveModebarButtons(input);
    expect(names(groups)).toEqual(names(cartesian()));
    expect(warn).toHaveBeenCalledTimes(4);
    const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(messages).toContain("'zoomm'");
    expect(messages).toContain("'orbitRotation' is not supported yet");
    expect(messages).toContain('`click` function');
    expect(messages).toContain("'nothing'");
    expect(messages).not.toContain('sendDataToCloud');
  });
});

describe('modebarButtonActive', () => {
  it('presses the button of the current dragmode', () => {
    const state = { dragmode: 'pan' };
    expect(modebarButtonActive(modebarBuiltinButton('pan2d'), state)).toBe(true);
    expect(modebarButtonActive(modebarBuiltinButton('zoom2d'), state)).toBe(false);
    expect(modebarButtonActive(modebarBuiltinButton('lasso2d'), { dragmode: 'lasso' })).toBe(true);
  });

  it('presses hover buttons by hovermode', () => {
    const closest = modebarBuiltinButton('hoverClosestCartesian');
    const compare = modebarBuiltinButton('hoverCompareCartesian');
    expect(modebarButtonActive(closest, { hovermode: 'closest' })).toBe(true);
    expect(modebarButtonActive(compare, { hovermode: 'closest' })).toBe(false);
    expect(modebarButtonActive(compare, { hovermode: 'x unified' })).toBe(true);
    expect(modebarButtonActive(closest, { hovermode: false })).toBe(false);
  });

  it('reflects spike lines and has no state for actions', () => {
    expect(modebarButtonActive(modebarBuiltinButton('toggleSpikelines'), {})).toBe(false);
    expect(
      modebarButtonActive(modebarBuiltinButton('toggleSpikelines'), { spikelines: true }),
    ).toBe(true);
    expect(modebarButtonActive(modebarBuiltinButton('zoomIn2d'), { dragmode: 'zoom' })).toBe(
      undefined,
    );
  });
});

describe('modebarButtonsKey', () => {
  it('distinguishes sets and custom buttons', () => {
    const a = cartesian();
    const b = cartesian({ hasSelectable: true });
    expect(modebarButtonsKey(a)).toBe(modebarButtonsKey(cartesian()));
    expect(modebarButtonsKey(a)).not.toBe(modebarButtonsKey(b));
    const custom = cartesian({ config: { modeBarButtonsToAdd: [{ name: 'zoom2d', click() {} }] } });
    expect(modebarButtonsKey(custom)).toContain('custom:zoom2d');
  });
});
