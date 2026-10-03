// @vitest-environment jsdom
/**
 * Where the hover layer puts its labels: beside the point (left of it when the right side would
 * leave the figure), stacked without overlaps, the common axis label on its axis, the unified box
 * and a custom element beside the pointer. jsdom lays nothing out, so every element is given a
 * measured size of 80×20 px; the figure is 640×400.
 */
import type { ViewportProjector } from '@mk7s/holochart-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelSpec, LabelStyle } from './hover.ts';
import { HoverLayer } from './labels.ts';

const W = 80;
const H = 20;
const FIGURE = { width: 640, height: 400 };
const PLOT = { x: 100, y: 30, width: 500, height: 320 };

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

function spec(text: string, ax: number, ay: number): LabelSpec {
  return { text, extra: undefined, color: 'rgb(1, 2, 3)', style: STYLE, ax, ay, traceIndex: 0 };
}

let container: HTMLElement;
let layer: HoverLayer;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(W);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(H);
  container = document.createElement('div');
  document.body.appendChild(container);
  layer = new HoverLayer(container);
});

afterEach(() => {
  layer.destroy();
  container.remove();
  vi.restoreAllMocks();
});

/** The visible labels, in the order they were given. */
function shown(): HTMLElement[] {
  return [...layer.layer.querySelectorAll<HTMLElement>('.holochart-hoverlabel')].filter(
    (el) => el.style.display !== 'none',
  );
}

/** The arrow of a label: its first child. */
function arrow(label: HTMLElement): HTMLElement {
  return label.firstElementChild as HTMLElement;
}

describe('a label beside its point', () => {
  it('sits right of the point, centered on it, the arrow pointing left at it', () => {
    layer.showLabels([spec('a', 100, 200)], { ...FIGURE, plot: PLOT });
    const [label] = shown() as [HTMLElement];
    // 6 px between the point and the label.
    expect(label.style.left).toBe('106px');
    expect(label.style.top).toBe('190px');
    expect(label.style.flexDirection).toBe('row');
    expect(arrow(label).style.left).toBe('-4px');
    // The 8 px arrow is centered on the point's height (10 px below the label's top).
    expect(arrow(label).style.top).toBe('6px');
    expect(arrow(label).style.transform).toBe('rotate(45deg)');
  });

  it('goes left of the point when the right side would leave the figure', () => {
    layer.showLabels([spec('a', 600, 200)], { ...FIGURE, plot: PLOT });
    const [label] = shown() as [HTMLElement];
    expect(label.style.left).toBe(`${600 - 6 - W}px`);
    // Mirrored: the secondary box on the far side, the arrow on the right edge pointing right.
    expect(label.style.flexDirection).toBe('row-reverse');
    expect(arrow(label).style.left).toBe(`${W - 4}px`);
    expect(arrow(label).style.transform).toBe('rotate(-135deg)');
  });

  it('stays right of the point when it fits on neither side', () => {
    layer.showLabels([spec('a', 50, 50)], { width: 100, height: 100, plot: undefined });
    const [label] = shown() as [HTMLElement];
    expect(label.style.left).toBe('56px');
    expect(label.style.flexDirection).toBe('row');
  });

  it('is drawn where a 2.5D view shows its point', () => {
    layer.projector = {
      project: (x: number, y: number) => [x + 100, y - 50],
    } as unknown as ViewportProjector;
    layer.showLabels([spec('a', 100, 200)], { ...FIGURE, plot: PLOT });
    const [label] = shown() as [HTMLElement];
    expect(label.style.left).toBe('206px');
    expect(label.style.top).toBe('140px');
  });
});

describe('several labels', () => {
  it('stack 2 px apart when their points are at one height, arrows clamped to their label', () => {
    layer.showLabels([spec('a', 100, 200), spec('b', 100, 200)], { ...FIGURE, plot: PLOT });
    const [a, b] = shown() as [HTMLElement, HTMLElement];
    expect(a.style.top).toBe('190px');
    expect(b.style.top).toBe(`${190 + H + 2}px`);
    // The second label sits below its point: its arrow stays at the label's top corner.
    expect(arrow(b).style.top).toBe('1px');
  });

  it('keep their own points whatever order they are given in', () => {
    layer.showLabels([spec('low', 100, 300), spec('high', 100, 100)], { ...FIGURE, plot: PLOT });
    const [low, high] = shown() as [HTMLElement, HTMLElement];
    expect(low.textContent).toBe('low');
    expect(low.style.top).toBe('290px');
    expect(high.textContent).toBe('high');
    expect(high.style.top).toBe('90px');
  });

  it('are pushed up to stay inside the figure', () => {
    layer.showLabels([spec('a', 100, 395), spec('b', 100, 395)], { ...FIGURE, plot: PLOT });
    const tops = shown().map((el) => Number.parseFloat(el.style.top));
    // The lower one ends at the figure's bottom edge, the other 2 px above it.
    expect(tops).toEqual([400 - 2 * H - 2, 400 - H]);
  });
});

describe('the common axis label of x / y hovermodes', () => {
  function common(): HTMLElement | null {
    return layer.layer.querySelector<HTMLElement>('.holochart-hoverlabel-axis');
  }

  it('sits under the plot area, centered on the hovered x', () => {
    layer.showLabels([spec('a', 330, 200)], {
      ...FIGURE,
      plot: PLOT,
      common: { axis: 'x', text: 'Mar 1', at: 330 },
    });
    expect(common()?.textContent).toBe('Mar 1');
    expect(common()?.style.display).toBe('block');
    expect(common()?.style.left).toBe(`${330 - W / 2}px`);
    expect(common()?.style.top).toBe(`${PLOT.y + PLOT.height + 2}px`);
  });

  it('stays inside the figure at its edges', () => {
    const options = { ...FIGURE, plot: PLOT };
    layer.showLabels([], { ...options, common: { axis: 'x', text: '10', at: 635 } });
    expect(common()?.style.left).toBe(`${640 - W}px`);
    layer.showLabels([], { ...options, common: { axis: 'x', text: '0', at: 5 } });
    expect(common()?.style.left).toBe('0px');
    // One element, reused.
    expect(layer.layer.querySelectorAll('.holochart-hoverlabel-axis')).toHaveLength(1);
    expect(common()?.textContent).toBe('0');
  });

  it('sits left of the plot area, centered on the hovered y', () => {
    layer.showLabels([spec('a', 330, 200)], {
      ...FIGURE,
      plot: PLOT,
      common: { axis: 'y', text: '50', at: 200 },
    });
    expect(common()?.style.left).toBe(`${PLOT.x - W - 2}px`);
    expect(common()?.style.top).toBe(`${200 - H / 2}px`);
  });

  it('is hidden without a value to show, and by the next hover without one', () => {
    const options = { ...FIGURE, plot: PLOT };
    layer.showLabels([spec('a', 330, 200)], {
      ...options,
      common: { axis: 'x', text: '5', at: 330 },
    });
    layer.showLabels([spec('a', 330, 200)], { ...options, common: { axis: 'x', text: '', at: 0 } });
    expect(common()?.style.display).toBe('none');
    layer.showLabels([spec('a', 330, 200)], {
      ...options,
      common: { axis: 'x', text: '5', at: 330 },
    });
    expect(common()?.style.display).toBe('block');
    // `closest` mode: no common label.
    layer.showLabels([spec('a', 330, 200)], options);
    expect(common()?.style.display).toBe('none');
  });
});

describe('the unified box', () => {
  const options = { ...FIGURE, plot: PLOT, title: '5', titleStyle: STYLE };

  function box(): HTMLElement {
    return layer.layer.querySelector<HTMLElement>('.holochart-hoverlabel-unified') as HTMLElement;
  }

  it('sits 10 px right of the pointer, centered on its height', () => {
    layer.showUnified([spec('A : 1', 300, 100)], { ...options, x: 300, y: 200 });
    expect(box().style.left).toBe('310px');
    expect(box().style.top).toBe(`${200 - H / 2}px`);
  });

  it('goes left of the pointer when the right side would leave the figure', () => {
    layer.showUnified([spec('A : 1', 600, 100)], { ...options, x: 600, y: 200 });
    expect(box().style.left).toBe(`${600 - 10 - W}px`);
  });

  it('stays inside the figure at its top, bottom and left edges', () => {
    layer.showUnified([spec('A : 1', 300, 100)], { ...options, x: 300, y: 398 });
    expect(box().style.top).toBe(`${400 - H}px`);
    layer.showUnified([spec('A : 1', 300, 100)], { ...options, x: 300, y: 3 });
    expect(box().style.top).toBe('0px');
    // Too wide for either side of the pointer: against the left edge.
    layer.showUnified([spec('A : 1', 50, 50)], { ...options, width: 100, x: 50, y: 50 });
    expect(box().style.left).toBe('0px');
  });

  it('is drawn where a 2.5D view shows the pointer’s plot position', () => {
    layer.projector = {
      project: (x: number, y: number) => [x + 100, y - 50],
    } as unknown as ViewportProjector;
    layer.showUnified([spec('A : 1', 300, 100)], { ...options, x: 300, y: 200 });
    expect(box().style.left).toBe('410px');
    expect(box().style.top).toBe(`${150 - H / 2}px`);
  });
});

describe('a custom label element (config.renderHover)', () => {
  it('sits beside the point, left of it when the right side would leave the figure', () => {
    const el = document.createElement('div');
    layer.showCustom(el, 100, 200, 640);
    expect(el.parentElement).toBe(layer.layer);
    expect(el.style.position).toBe('absolute');
    expect(el.style.left).toBe('106px');
    expect(el.style.top).toBe(`${200 - H / 2}px`);
    layer.showCustom(el, 600, 200, 640);
    expect(el.style.left).toBe(`${600 - 6 - W}px`);
  });
});
