import { describe, expect, it } from 'vitest';
import {
  holochartTemplate,
  plotlyClassicTemplate,
  type FullLayout,
  type Template,
} from '@mk7s/holochart-core';
import type { ComponentLayoutContext } from '@mk7s/holochart-runtime';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import {
  layoutUpdatemenu,
  placeUpdatemenu,
  resolveXAnchor,
  resolveYAnchor,
  updatemenuMarginPush,
} from './layout.ts';
import type { FullUpdatemenu } from './schema.ts';
import { updatemenusComponent, updatemenusMarginPushes } from './updatemenus.ts';

const registry = () =>
  testRegistry([updatemenusComponent])
    .registerTemplate('holochart', holochartTemplate as Template)
    .registerTemplate('plotly-classic', plotlyClassicTemplate as Template);

function menus(layout: Record<string, unknown>): FullUpdatemenu[] {
  const { fullLayout } = defaults(layout, [], registry());
  return fullLayout['updatemenus'] as FullUpdatemenu[];
}

const BUTTONS = [
  { label: 'A', method: 'restyle', args: ['visible', [true, false]] },
  { label: 'Bb', method: 'restyle', args: ['visible', [false, true]] },
];

describe('updatemenus defaults', () => {
  it("follows Plotly's schema defaults", () => {
    const [m] = menus({ template: 'plotly-classic', updatemenus: [{ buttons: BUTTONS }] });
    expect(m).toMatchObject({
      visible: true,
      type: 'dropdown',
      direction: 'down',
      active: 0,
      showactive: true,
      x: -0.05,
      xanchor: 'right',
      y: 1,
      yanchor: 'top',
      pad: { t: 0, r: 0, b: 0, l: 0 },
      borderwidth: 1,
    });
    expect(m?.buttons[0]).toMatchObject({ visible: true, method: 'restyle', execute: true });
  });

  it('hides buttons without args and menus without visible buttons', () => {
    const [a, b] = menus({
      updatemenus: [
        { buttons: [{ label: 'x' }, { label: 'skip', method: 'skip' }] },
        { buttons: [{ label: 'no args' }] },
      ],
    });
    expect(a?.buttons.map((x) => x.visible)).toEqual([false, true]);
    expect(a?.visible).toBe(true);
    expect(b?.visible).toBe(false);
    const [c] = menus({ updatemenus: [{ visible: false, buttons: BUTTONS }] });
    expect(c?.visible).toBe(false);
  });

  it("uses Plotly's widget colors on a light paper and paper tints on a dark one", () => {
    const [light] = menus({ template: 'plotly-classic', updatemenus: [{ buttons: BUTTONS }] });
    expect(light).toMatchObject({
      bgcolor: 'rgb(255, 255, 255)',
      bordercolor: '#BEC8D9',
      _activecolor: '#F4FAFF',
    });
    expect(light?.font).toMatchObject({ size: 12, color: 'rgb(68, 68, 68)' });
    const [dark] = menus({ template: 'holochart', updatemenus: [{ buttons: BUTTONS }] });
    expect(dark?.bgcolor).toMatch(/^rgb\(/);
    expect(dark?.bordercolor).not.toBe('#BEC8D9');
    expect(dark?.font.size).toBe(9);
    const [set] = menus({
      template: 'holochart',
      updatemenus: [{ buttons: BUTTONS, bgcolor: 'red', bordercolor: 'blue', font: { size: 14 } }],
    });
    expect(set).toMatchObject({ bgcolor: 'rgb(255, 0, 0)', bordercolor: 'rgb(0, 0, 255)' });
    expect(set?.font.size).toBe(14);
  });

  it('applies template updatemenudefaults and buttondefaults', () => {
    const template: Template = {
      layout: {
        updatemenudefaults: {
          bgcolor: '#506784',
          borderwidth: 0,
          buttondefaults: { execute: false },
        },
      },
    };
    const [m] = menus({ template, updatemenus: [{ buttons: BUTTONS }] });
    expect(m).toMatchObject({ bgcolor: 'rgb(80, 103, 132)', borderwidth: 0 });
    expect(m?.buttons[0]?.execute).toBe(false);
  });

  it('keeps named template menus and buttons (templateitemname)', () => {
    const named = BUTTONS.map((b, i) => ({ ...b, name: `b${i}` }));
    const template: Template = {
      layout: { updatemenus: [{ name: 'tpl', type: 'buttons', buttons: named }] },
    };
    const list = menus({ template, updatemenus: [{ buttons: BUTTONS }] });
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ _index: -1, type: 'buttons', visible: true });
    expect(list[1]?.buttons.map((b) => b._index)).toEqual([-1, -1]);
    // Items are identified by position, not `_index`.
    const l = layoutUpdatemenu(list[1] as FullUpdatemenu, measure);
    expect(l.items.map((b) => b.index)).toEqual([0, 1]);
  });
});

describe('updatemenus layout', () => {
  const full = (menu: Record<string, unknown>, template = 'plotly-classic'): FullUpdatemenu =>
    menus({ template, updatemenus: [menu] })[0] as FullUpdatemenu;

  it('resolves auto anchors like Plotly', () => {
    expect(resolveXAnchor('auto', 0.1)).toBe('left');
    expect(resolveXAnchor('auto', 0.5)).toBe('center');
    expect(resolveXAnchor('auto', 0.9)).toBe('right');
    expect(resolveYAnchor('auto', 0.9)).toBe('top');
    expect(resolveYAnchor('auto', 0.5)).toBe('middle');
    expect(resolveYAnchor('auto', 0.1)).toBe('bottom');
    expect(resolveXAnchor('left', 0.9)).toBe('left');
  });

  it('sizes buttons from their labels (12 px: Plotly constants)', () => {
    // measure: 0.5 em per character → 'A' = 6 px, 'Bb' = 12 px at 12 px.
    const l = layoutUpdatemenu(
      full({ type: 'buttons', direction: 'right', buttons: BUTTONS }),
      measure,
    );
    expect(l.vertical).toBe(false);
    expect(l.items.map((b) => b.width)).toEqual([30, 36]); // minWidth 30; 12 + 24
    expect(l.items.map((b) => b.x)).toEqual([0, 32]); // gap 2
    const h = Math.ceil(12 * 1.3 + 8);
    expect(l.items.every((b) => b.height === h)).toBe(true);
    expect(l.width).toBe(68);
    expect(l.height).toBe(h);
  });

  it('stacks vertical buttons at the widest width', () => {
    const l = layoutUpdatemenu(
      full({ type: 'buttons', direction: 'down', buttons: BUTTONS }),
      measure,
    );
    expect(l.items.map((b) => [b.x, b.width])).toEqual([
      [0, 36],
      [0, 36],
    ]);
    expect(l.items[1]?.y).toBe((l.items[0]?.height ?? 0) + 2);
  });

  it('dropdowns: the header pushes, the list opens on the direction side', () => {
    const down = layoutUpdatemenu(full({ buttons: BUTTONS, pad: { t: 3, l: 4 } }), measure);
    expect(down.header).toMatchObject({ x: 4, y: 3, width: 36 + 16 });
    expect(down.width).toBe(52 + 4);
    expect(down.items[0]?.y).toBe(3 + (down.header?.height ?? 0) + 5);
    expect(down.items.every((b) => b.width === 52)).toBe(true);
    const up = layoutUpdatemenu(full({ buttons: BUTTONS, direction: 'up' }), measure);
    const last = up.items.at(-1);
    expect((last?.y ?? 0) + (last?.height ?? 0)).toBe(-5);
    const right = layoutUpdatemenu(full({ buttons: BUTTONS, direction: 'right' }), measure);
    expect(right.items[0]?.x).toBe(52 + 5);
    const left = layoutUpdatemenu(full({ buttons: BUTTONS, direction: 'left' }), measure);
    const end = left.items.at(-1);
    expect((end?.x ?? 0) + (end?.width ?? 0)).toBe(-5);
  });

  it('scales the constants with the font (dense default look)', () => {
    const l = layoutUpdatemenu(
      full({ type: 'buttons', direction: 'right', buttons: BUTTONS }, 'holochart'),
      measure,
    );
    expect(l.scale).toBe(0.75);
    expect(l.items[0]?.width).toBe(Math.ceil(30 * 0.75));
  });

  it('places the padded box by its anchor and pushes margins when outside the plot', () => {
    const m = full({ type: 'buttons', buttons: BUTTONS, x: 1.02, xanchor: 'left', y: 1 });
    const l = layoutUpdatemenu(m, measure);
    const area = { x: 80, y: 100, width: 400, height: 200 };
    expect(placeUpdatemenu(m, l, { width: 600, height: 400 }, area)).toEqual({
      left: Math.round(80 + 1.02 * 400),
      top: 100,
    });
    const push = updatemenuMarginPush(
      m,
      l,
      { width: 600, height: 400 },
      { l: 80, r: 80, t: 100, b: 80 },
    );
    expect(push?.r).toBeGreaterThan(l.width);
    const inside = full({ type: 'buttons', buttons: BUTTONS, x: 0.5, xanchor: 'center', y: 0.5 });
    expect(
      updatemenuMarginPush(
        inside,
        layoutUpdatemenu(inside, measure),
        { width: 600, height: 400 },
        {
          l: 80,
          r: 80,
          t: 100,
          b: 80,
        },
      ),
    ).toBeUndefined();
  });

  it('the component pushes one margin per visible menu', () => {
    const { fullLayout } = defaults(
      {
        template: 'plotly-classic',
        updatemenus: [
          { buttons: BUTTONS },
          { buttons: BUTTONS, visible: false },
          { buttons: BUTTONS, x: 0.5, y: 0.5 },
        ],
      },
      [],
      registry(),
    );
    const ctx = { fullLayout, fullData: [], width: 600, height: 400, axes: new Map() };
    const pushes = updatemenusMarginPushes(ctx as unknown as ComponentLayoutContext);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.l).toBeGreaterThan(0);
    expect(
      updatemenusComponent.pushMargin?.({ ...ctx, fullLayout: {} as FullLayout } as never),
    ).toBe(undefined);
  });
});
