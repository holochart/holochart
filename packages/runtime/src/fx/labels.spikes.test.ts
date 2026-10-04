// @vitest-environment jsdom
/**
 * The hover layer drawing spike lines as SVG: one `<line>` per segment and one `<circle>` per dot,
 * under the hover labels, with pooled elements that follow the scene from hover to hover; hidden
 * for an empty scene and on a subplot shown in the 2.5D view.
 */
import type { ViewportProjector } from '@mk7s/holochart-render';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HoverLayer } from './labels.ts';
import { NO_SPIKES, type SpikeDot, type SpikeLine, type SpikeScene } from './spikes.ts';

function line(x1: number, y1: number, x2: number, y2: number, dash = ''): SpikeLine {
  return { x1, y1, x2, y2, width: 3, color: 'rgb(234, 42, 55)', dash };
}

function dot(cx: number, cy: number): SpikeDot {
  return { cx, cy, r: 3, color: 'rgb(0, 255, 0)' };
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

function svg(): SVGSVGElement | null {
  return layer.layer.querySelector<SVGSVGElement>('.holochart-spikelines');
}

function lines(): SVGLineElement[] {
  return [...layer.layer.querySelectorAll<SVGLineElement>('.holochart-spikeline')];
}

function dots(): SVGCircleElement[] {
  return [...layer.layer.querySelectorAll<SVGCircleElement>('.holochart-spikemarker')];
}

function attrs(el: Element, ...names: string[]): (string | null)[] {
  return names.map((n) => el.getAttribute(n));
}

const SCENE: SpikeScene = {
  lines: [line(100, 170, 160, 170), line(160, 250, 160, 170, '9px,9px')],
  dots: [dot(160, 247)],
};

describe('spike lines', () => {
  it('draws every line and dot of the scene, under the hover labels', () => {
    const style = {
      bgcolor: '#fff',
      bordercolor: '#444',
      fontFamily: 'sans-serif',
      fontSize: 13,
      fontColor: '#444',
      align: 'auto' as const,
      namelength: 15,
      showarrow: true,
    };
    layer.showLabels(
      [{ text: 'a', extra: undefined, color: '#000', style, ax: 160, ay: 170, traceIndex: 0 }],
      { width: 640, height: 400, plot: undefined },
    );
    layer.showSpikes(SCENE);
    expect(layer.spikesShowing).toBe(true);
    expect(svg()?.style.display).toBe('block');
    // Before the label in the layer, so the label is drawn over the lines.
    expect(layer.layer.firstElementChild).toBe(svg());
    const [solid, dashed] = lines() as [SVGLineElement, SVGLineElement];
    expect(attrs(solid, 'x1', 'y1', 'x2', 'y2')).toEqual(['100', '170', '160', '170']);
    expect(attrs(solid, 'stroke', 'stroke-width')).toEqual(['rgb(234, 42, 55)', '3']);
    expect(solid.hasAttribute('stroke-dasharray')).toBe(false);
    expect(attrs(dashed, 'x1', 'y1', 'x2', 'y2')).toEqual(['160', '250', '160', '170']);
    expect(dashed.getAttribute('stroke-dasharray')).toBe('9px,9px');
    const [marker] = dots() as [SVGCircleElement];
    expect(attrs(marker, 'cx', 'cy', 'r', 'fill')).toEqual(['160', '247', '3', 'rgb(0, 255, 0)']);
  });

  it('moves the same elements on the next hover and hides those it no longer needs', () => {
    layer.showSpikes({
      lines: [line(0, 0, 10, 0, '3px,3px'), line(5, 5, 5, 50)],
      dots: [dot(1, 1), dot(2, 2)],
    });
    const before = [...lines(), ...dots()];
    layer.showSpikes({ lines: [line(20, 30, 40, 30)], dots: [] });
    expect([...lines(), ...dots()]).toEqual(before);
    const [first, second] = lines() as [SVGLineElement, SVGLineElement];
    expect(attrs(first, 'x1', 'y1', 'x2', 'y2')).toEqual(['20', '30', '40', '30']);
    // The dash of the line it drew before is gone.
    expect(first.hasAttribute('stroke-dasharray')).toBe(false);
    expect(first.style.display).toBe('');
    expect(second.style.display).toBe('none');
    expect(dots().map((d) => d.style.display)).toEqual(['none', 'none']);
    // Needed again: shown again.
    layer.showSpikes({ lines: [line(0, 0, 1, 1), line(2, 2, 3, 3)], dots: [dot(9, 9)] });
    expect(lines().map((l) => l.style.display)).toEqual(['', '']);
    expect(dots().map((d) => d.style.display)).toEqual(['', 'none']);
    expect(attrs(dots()[0] as Element, 'cx', 'cy')).toEqual(['9', '9']);
  });

  it('keeps the dots above every line, also lines added later', () => {
    layer.showSpikes({ lines: [line(0, 0, 10, 0)], dots: [dot(1, 1)] });
    layer.showSpikes({
      lines: [line(0, 0, 10, 0), line(5, 5, 5, 50), line(7, 7, 7, 70)],
      dots: [dot(1, 1)],
    });
    const order = [...(svg() as SVGSVGElement).children].map((el) => el.tagName.toLowerCase());
    expect(order).toEqual(['line', 'line', 'line', 'circle']);
  });

  it('are hidden by an empty scene and by hideSpikes, and shown again by the next scene', () => {
    layer.showSpikes(SCENE);
    layer.showSpikes(NO_SPIKES);
    expect(layer.spikesShowing).toBe(false);
    expect(svg()?.style.display).toBe('none');
    layer.showSpikes(SCENE);
    expect(svg()?.style.display).toBe('block');
    expect(layer.layer.querySelectorAll('.holochart-spikelines')).toHaveLength(1);
    layer.hideSpikes();
    expect(layer.spikesShowing).toBe(false);
    expect(svg()?.style.display).toBe('none');
  });

  it('are not drawn at all before a scene has anything to show', () => {
    layer.hideSpikes();
    layer.showSpikes(NO_SPIKES);
    expect(svg()).toBeNull();
    expect(layer.spikesShowing).toBe(false);
  });

  it('are not shown on a subplot in the 2.5D view, and hide when the hover moves onto one', () => {
    layer.showSpikes(SCENE);
    layer.projector = { project: (x: number, y: number) => [x, y] } as unknown as ViewportProjector;
    layer.showSpikes(SCENE);
    expect(layer.spikesShowing).toBe(false);
    expect(svg()?.style.display).toBe('none');
  });
});
