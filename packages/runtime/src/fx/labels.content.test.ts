// @vitest-environment jsdom
/**
 * What the hover layer draws for a label: its text and secondary box, the `hoverlabel` style,
 * the rows of the unified box and a custom element, and that pooled elements carry nothing over
 * from the hover before. Driven directly with label specs, as the interaction code does.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LabelSpec, LabelStyle } from './hover.ts';
import { HoverLayer } from './labels.ts';

const OPTIONS = { width: 640, height: 400, plot: { x: 40, y: 30, width: 580, height: 320 } };

const STYLE: LabelStyle = {
  bgcolor: 'rgb(10, 20, 30)',
  bordercolor: 'rgb(200, 0, 0)',
  fontFamily: 'Inter',
  fontSize: 13,
  fontColor: 'rgb(255, 255, 255)',
  align: 'auto',
  namelength: 15,
  showarrow: true,
};

function spec(text: string, over: Partial<LabelSpec> = {}): LabelSpec {
  return {
    text,
    extra: undefined,
    color: 'rgb(1, 2, 3)',
    style: STYLE,
    ax: 100,
    ay: 200,
    traceIndex: 0,
    ...over,
  };
}

let container: HTMLElement;
let layer: HoverLayer;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  layer = new HoverLayer(container);
});

afterEach(() => {
  layer.destroy();
  container.remove();
});

function all(selector: string): HTMLElement[] {
  return [...layer.layer.querySelectorAll<HTMLElement>(selector)];
}

function visible(selector: string): HTMLElement[] {
  return all(selector).filter((el) => el.style.display !== 'none');
}

/** The parts of the `i`-th label element: arrow, text box, secondary box. */
function parts(i = 0): {
  root: HTMLElement;
  arrow: HTMLElement;
  body: HTMLElement;
  extra: HTMLElement;
} {
  const root = all('.holochart-hoverlabel')[i] as HTMLElement;
  return {
    root,
    arrow: root.firstElementChild as HTMLElement,
    body: root.querySelector('.holochart-hoverlabel-text') as HTMLElement,
    extra: root.querySelector('.holochart-hoverlabel-name') as HTMLElement,
  };
}

describe('the layer', () => {
  it('is hidden from assistive technology and never takes pointer events', () => {
    expect(layer.layer.parentElement).toBe(container);
    expect(layer.layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.layer.style.pointerEvents).toBe('none');
  });

  it('makes an unpositioned container its positioning context, and leaves a positioned one', () => {
    expect(container.style.position).toBe('relative');
    const positioned = document.createElement('div');
    positioned.style.position = 'absolute';
    document.body.appendChild(positioned);
    const other = new HoverLayer(positioned);
    expect(positioned.style.position).toBe('absolute');
    other.destroy();
    expect(positioned.children).toHaveLength(0);
    positioned.remove();
  });
});

describe('a label', () => {
  it('shows its text as rich text and the secondary box in the point color', () => {
    layer.showLabels([spec('<b>12</b><br>note', { extra: 'Revenue' })], OPTIONS);
    const { root, arrow, body, extra } = parts();
    expect(root.style.display).toBe('flex');
    expect(body.querySelector('b')?.textContent).toBe('12');
    expect(body.querySelectorAll('br')).toHaveLength(1);
    expect(body.style.background).toBe('rgb(10, 20, 30)');
    expect(body.style.borderColor).toBe('rgb(200, 0, 0)');
    expect(body.style.color).toBe('rgb(255, 255, 255)');
    expect(body.style.fontFamily).toBe('Inter');
    expect(body.style.fontSize).toBe('13px');
    expect(extra.style.display).toBe('flex');
    expect(extra.textContent).toBe('Revenue');
    expect(extra.style.color).toBe('rgb(1, 2, 3)');
    expect(extra.style.fontFamily).toBe('Inter');
    // The arrow continues the text box.
    expect(arrow.style.display).toBe('block');
    expect(arrow.style.background).toBe('rgb(10, 20, 30)');
    expect(arrow.style.borderColor).toBe('rgb(200, 0, 0)');
    expect(layer.showing).toBe(true);
  });

  it('hides the secondary box when there is none', () => {
    layer.showLabels([spec('12')], OPTIONS);
    expect(parts().extra.style.display).toBe('none');
    expect(parts().body.style.display).toBe('block');
  });

  it('with only a secondary box shows that box alone, without text box or arrow', () => {
    layer.showLabels([spec('', { extra: 'Revenue' })], OPTIONS);
    const { root, arrow, body, extra } = parts();
    expect(root.style.display).toBe('flex');
    expect(body.style.display).toBe('none');
    expect(arrow.style.display).toBe('none');
    expect(extra.textContent).toBe('Revenue');
  });

  it('is not drawn for a point with neither (hoverinfo none)', () => {
    layer.showLabels([spec(''), spec('kept'), spec('', { extra: '' })], OPTIONS);
    expect(visible('.holochart-hoverlabel').map((el) => el.textContent)).toEqual(['kept']);
    layer.showLabels([spec('')], OPTIONS);
    expect(visible('.holochart-hoverlabel')).toHaveLength(0);
    expect(layer.showing).toBe(false);
  });

  it('has no arrow with hoverlabel.showarrow false', () => {
    layer.showLabels([spec('12', { style: { ...STYLE, showarrow: false } })], OPTIONS);
    expect(parts().arrow.style.display).toBe('none');
  });

  it('aligns its text as hoverlabel.align says, left for auto', () => {
    layer.showLabels([spec('12')], OPTIONS);
    expect(parts().body.style.textAlign).toBe('left');
    layer.showLabels([spec('12', { style: { ...STYLE, align: 'right' } })], OPTIONS);
    expect(parts().body.style.textAlign).toBe('right');
  });
});

describe('pooled label elements', () => {
  it('are reused from hover to hover, the surplus hidden', () => {
    layer.showLabels([spec('a'), spec('b')], OPTIONS);
    const first = parts(0).root;
    layer.showLabels([spec('c')], OPTIONS);
    expect(all('.holochart-hoverlabel')).toHaveLength(2);
    expect(parts(0).root).toBe(first);
    expect(visible('.holochart-hoverlabel').map((el) => el.textContent)).toEqual(['c']);
    layer.hideLabels();
    expect(visible('.holochart-hoverlabel')).toHaveLength(0);
    expect(layer.showing).toBe(false);
  });

  it('take the font CSS of their point and drop it for a point without', () => {
    const fontCss = {
      fontWeight: '600',
      fontStyle: 'italic',
      fontVariant: 'small-caps',
      textTransform: 'uppercase',
      textDecorationLine: 'underline',
      textShadow: '1px 1px 1px #000',
    };
    layer.showLabels([spec('a', { extra: 'A', style: { ...STYLE, fontCss } })], OPTIONS);
    for (const el of [parts().body, parts().extra]) {
      expect(el.style.fontWeight).toBe('600');
      expect(el.style.fontStyle).toBe('italic');
      expect(el.style.fontVariant).toBe('small-caps');
      expect(el.style.textTransform).toBe('uppercase');
      expect(el.style.textDecorationLine).toBe('underline');
      expect(el.style.textShadow).toBe('1px 1px 1px #000');
    }
    // The same elements, now for a point whose font sets none of these.
    layer.showLabels([spec('b', { extra: 'B' })], OPTIONS);
    for (const el of [parts().body, parts().extra]) {
      expect(el.style.fontWeight).toBe('');
      expect(el.style.fontStyle).toBe('');
      expect(el.style.fontVariant).toBe('');
      expect(el.style.textTransform).toBe('');
      expect(el.style.textDecorationLine).toBe('');
      expect(el.style.textShadow).toBe('');
    }
  });

  it('do not keep the text or secondary box of the point before', () => {
    layer.showLabels([spec('first', { extra: 'A' })], OPTIONS);
    layer.showLabels([spec('second')], OPTIONS);
    expect(parts().body.textContent).toBe('second');
    expect(parts().extra.textContent).toBe('');
    expect(parts().extra.style.display).toBe('none');
  });
});

describe('the unified box', () => {
  const unified = { ...OPTIONS, titleStyle: STYLE, x: 300, y: 200 };

  function box(): HTMLElement {
    return all('.holochart-hoverlabel-unified')[0] as HTMLElement;
  }

  it('has a bold title, then a row per point with a swatch in its color', () => {
    layer.showUnified(
      [
        spec('A : 1', { color: 'rgb(255, 0, 0)' }),
        spec('B : <i>2</i>', { color: 'rgb(0, 0, 255)' }),
      ],
      { ...unified, title: 'Mar 1' },
    );
    expect(box().style.display).toBe('block');
    expect(box().style.background).toBe('rgb(10, 20, 30)');
    const title = box().firstElementChild as HTMLElement;
    expect(title.textContent).toBe('Mar 1');
    expect(title.style.fontWeight).toBe('bold');
    const rows = all('.holochart-hoverlabel-row');
    expect(rows.map((r) => r.textContent)).toEqual(['A : 1', 'B : 2']);
    expect(rows.map((r) => (r.firstElementChild as HTMLElement).style.background)).toEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)',
    ]);
    expect(rows[1]?.querySelector('i')?.textContent).toBe('2');
    expect(layer.showing).toBe(true);
  });

  it('leaves out the title when there is none and the rows of points without text', () => {
    layer.showUnified([spec('A : 1'), spec(''), spec('C : 3')], { ...unified, title: '' });
    expect([...box().children].map((el) => el.className)).toEqual([
      'holochart-hoverlabel-row',
      'holochart-hoverlabel-row',
    ]);
    expect(all('.holochart-hoverlabel-row').map((r) => r.textContent)).toEqual(['A : 1', 'C : 3']);
  });

  it('is one element, refilled on the next hover and hidden with the labels', () => {
    layer.showUnified([spec('A : 1'), spec('B : 2')], { ...unified, title: '1' });
    layer.showUnified([spec('A : 5')], { ...unified, title: '2' });
    expect(all('.holochart-hoverlabel-unified')).toHaveLength(1);
    expect(box().firstElementChild?.textContent).toBe('2');
    expect(all('.holochart-hoverlabel-row').map((r) => r.textContent)).toEqual(['A : 5']);
    layer.hideLabels();
    expect(box().style.display).toBe('none');
    expect(layer.showing).toBe(false);
    // Per-point labels replace it.
    layer.showUnified([spec('A : 5')], { ...unified, title: '2' });
    layer.showLabels([spec('a')], OPTIONS);
    expect(box().style.display).toBe('none');
  });
});

describe('a custom label element (config.renderHover)', () => {
  it('replaces the built-in labels and is removed when the hover ends', () => {
    layer.showLabels([spec('a')], OPTIONS);
    const el = document.createElement('section');
    el.textContent = 'custom';
    layer.showCustom(el, 100, 200, 640);
    expect(visible('.holochart-hoverlabel')).toHaveLength(0);
    expect(el.parentElement).toBe(layer.layer);
    expect(layer.showing).toBe(true);
    layer.hideLabels();
    expect(el.isConnected).toBe(false);
    expect(layer.showing).toBe(false);
  });

  it('is removed when built-in labels show next', () => {
    const el = document.createElement('section');
    layer.showCustom(el, 100, 200, 640);
    layer.showLabels([spec('a')], OPTIONS);
    expect(el.isConnected).toBe(false);
    expect(visible('.holochart-hoverlabel').map((l) => l.textContent)).toEqual(['a']);
  });
});
