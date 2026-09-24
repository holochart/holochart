import { describe, expect, it } from 'vitest';
import {
  Color,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import {
  assignLabelSlots,
  batchedColorChannel,
  clampAlpha,
  computeLabelPlacement,
  layoutKey,
  linearToSrgb,
  resolveTextLabel,
  shadowOutline,
  srgbToLinear,
  textAngleToRotation,
  troikaAnchorY,
  worldPerPixel,
  type LabelPlacement,
  type TextLabel,
  type TextStyle,
} from './text-layout.ts';
import {
  createFallbackTextMeasurer,
  createFontMetricsOracle,
  TEXT_ELLIPSIS,
} from './text-metrics.ts';

const oracle = createFontMetricsOracle({ measurer: createFallbackTextMeasurer() });
const noFonts = (): undefined => undefined;
const resolve = (label: Partial<TextLabel>, style: TextStyle = {}) =>
  resolveTextLabel({ text: 'Label', x: 0, y: 0, ...label }, style, oracle, noFonts);

describe('anchor and angle mapping', () => {
  it('maps Plotly yanchor to troika anchorY', () => {
    expect(troikaAnchorY('top')).toBe('top');
    expect(troikaAnchorY('middle')).toBe('middle');
    expect(troikaAnchorY('bottom')).toBe('bottom');
    expect(troikaAnchorY('baseline')).toBe('top-baseline');
  });

  it('converts clockwise-on-screen degrees to counter-clockwise radians', () => {
    expect(textAngleToRotation(90)).toBeCloseTo(-Math.PI / 2);
    expect(textAngleToRotation(-30)).toBeCloseTo(Math.PI / 6);
    expect(textAngleToRotation(0)).toBe(0);
    expect(textAngleToRotation(Number.NaN)).toBe(0);
  });
});

describe('resolveTextLabel', () => {
  it('applies defaults', () => {
    const r = resolve({});
    expect(r.layout).toMatchObject({
      text: 'Label',
      font: null,
      fontSize: 12,
      fontWeight: 400,
      fontStyle: 'normal',
      maxWidth: Infinity,
      whiteSpace: 'nowrap',
      anchorX: 'left',
      anchorY: 'top-baseline',
      textAlign: 'left',
    });
    expect(r.color).toEqual([0, 0, 0, 1]);
    expect(r.outline).toBeNull();
    expect(r.visible).toBe(true);
  });

  it('lets labels override the shared style field by field', () => {
    const r = resolve(
      { font: { size: 20 }, anchorX: 'right', color: [1, 0, 0, 1] },
      { font: { family: 'Inter', weight: 'bold' }, anchorX: 'center', anchorY: 'middle' },
    );
    expect(r.layout.fontSize).toBe(20);
    expect(r.layout.fontWeight).toBe(700);
    expect(r.layout.anchorX).toBe('right');
    expect(r.layout.anchorY).toBe('middle');
    expect(r.layout.textAlign).toBe('right');
    expect(r.color).toEqual([1, 0, 0, 1]);
  });

  it('resolves font URLs through the resolver', () => {
    const r = resolveTextLabel(
      { text: 'a', x: 0, y: 0, font: { family: 'Inter', style: 'italic' } },
      {},
      oracle,
      (family, weight, style) => `${family}-${weight}-${style}.woff`,
    );
    expect(r.layout.font).toBe('Inter-400-italic.woff');
  });

  it('wraps natively when maxWidth is set', () => {
    const r = resolve({ maxWidth: 50 });
    expect(r.layout.maxWidth).toBe(50);
    expect(r.layout.whiteSpace).toBe('normal');
  });

  it('truncates with the oracle in ellipsis mode and disables wrapping', () => {
    const r = resolve({ text: 'A very long category name', maxWidth: 60, overflow: 'ellipsis' });
    expect(r.layout.text.endsWith(TEXT_ELLIPSIS)).toBe(true);
    expect(
      oracle.measureWidth(r.layout.text, { family: 'sans-serif', size: 12 }),
    ).toBeLessThanOrEqual(60);
    expect(r.layout.maxWidth).toBe(Infinity);
    expect(r.layout.whiteSpace).toBe('nowrap');
  });

  it("does not wrap with overflow 'none'", () => {
    expect(resolve({ maxWidth: 10, overflow: 'none' }).layout.whiteSpace).toBe('nowrap');
  });

  it('hides labels with empty text, bad positions, or non-positive sizes', () => {
    expect(resolve({ text: '' }).visible).toBe(false);
    expect(resolve({ x: Number.NaN }).visible).toBe(false);
    expect(resolve({ z: Infinity }).visible).toBe(false);
    expect(resolve({ font: { size: 0 } }).visible).toBe(false);
  });

  it('drops no-op outlines and honors null overrides', () => {
    expect(resolve({ outline: { width: 0, color: [1, 1, 1, 1] } }).outline).toBeNull();
    const halo = { width: 2, color: [1, 1, 1, 1] as const };
    expect(resolve({}, { outline: halo }).outline).toBe(halo);
    expect(resolve({ outline: null }, { outline: halo }).outline).toBeNull();
  });

  it('keys only layout-affecting properties', () => {
    const base = resolve({});
    expect(resolve({ color: [1, 0, 0, 1], x: 5, angle: 45 }).key).toBe(base.key);
    expect(resolve({ text: 'Other' }).key).not.toBe(base.key);
    expect(resolve({ font: { size: 13 } }).key).not.toBe(base.key);
    expect(resolve({ anchorY: 'top' }).key).not.toBe(base.key);
    expect(layoutKey(base.layout)).toBe(base.key);
  });

  it('converts angle and offset', () => {
    const r = resolve({ angle: 45, offset: [3, -4] });
    expect(r.rotation).toBeCloseTo(-Math.PI / 4);
    expect(r.offsetX).toBe(3);
    expect(r.offsetY).toBe(-4);
  });
});

describe('resolveTextLabel: font attributes (E8.3)', () => {
  it('applies textcase to the typeset text and the layout key', () => {
    const r = resolve({ text: 'élan vital', font: { textcase: 'word caps' } });
    expect(r.layout.text).toBe('Élan Vital');
    expect(r.layout.fontSize).toBe(12);
    const upper = resolve({ text: 'abc' }, { font: { textcase: 'upper' } });
    expect(upper.layout.text).toBe('ABC');
    expect(upper.key).not.toBe(resolve({ text: 'abc' }).key);
    // Same drawn text, same key: the glyphs are shared.
    expect(upper.key).toBe(resolve({ text: 'ABC' }).key);
    // A label can turn an inherited textcase off.
    expect(
      resolve({ text: 'abc', font: { textcase: 'normal' } }, { font: { textcase: 'upper' } }),
    ).toMatchObject({ layout: { text: 'abc' } });
  });

  it('applies the variant as uppercase text at a scaled size', () => {
    const r = resolve({ text: 'Small', font: { size: 20, variant: 'small-caps' } });
    expect(r.layout.text).toBe('SMALL');
    expect(r.layout.fontSize).toBeCloseTo(16);
    expect(r.key).not.toBe(resolve({ text: 'SMALL', font: { size: 20 } }).key);
    expect(resolve({ text: 'u', font: { variant: 'unicase' } }).layout).toMatchObject({
      text: 'U',
      fontSize: 12,
    });
  });

  it('ellipsizes the transformed text at the scaled size', () => {
    const r = resolve({
      text: 'abcdefghij',
      maxWidth: 30,
      overflow: 'ellipsis',
      font: { size: 10, textcase: 'upper' },
    });
    expect(r.layout.text.endsWith(TEXT_ELLIPSIS)).toBe(true);
    expect(r.layout.text).toBe(r.layout.text.toUpperCase());
    expect(oracle.measureWidth(r.layout.text, { family: 'x', size: 10 })).toBeLessThanOrEqual(30);
  });

  it('turns a CSS shadow into the outline pass', () => {
    const r = resolve({ font: { shadow: '1px 2px 3px rgba(0, 0, 0, 0.5)' } });
    expect(r.outline).toEqual({ width: 0, color: [0, 0, 0, 0.5], blur: 3, offsetX: 1, offsetY: 2 });
    // An offset-only shadow is kept (troika draws it), a transparent one is dropped.
    expect(resolve({ font: { shadow: '2px 2px' } }).outline).toMatchObject({ offsetX: 2 });
    expect(resolve({ font: { shadow: '2px 2px transparent' } }).outline).toBeNull();
    expect(resolve({ font: { shadow: 'none' } }).outline).toBeNull();
  });

  it("uses the text color for 'auto' and shadows without a color", () => {
    const dark = resolve({ color: [0.1, 0.1, 0.2, 1], font: { shadow: 'auto' } });
    expect(dark.outline).toEqual({
      width: 1,
      color: [1, 1, 1, 1],
      blur: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const light = resolve({ color: [0.9, 0.9, 0.9, 1] }, { font: { shadow: 'auto' } });
    expect(light.outline?.color).toEqual([0, 0, 0, 1]);
    expect(resolve({ color: [0, 1, 0, 1], font: { shadow: '1px 1px' } }).outline?.color).toEqual([
      0, 1, 0, 1,
    ]);
    expect(shadowOutline(undefined, [0, 0, 0, 1], 12)).toBeUndefined();
  });

  it('lets an explicit outline win over the shadow', () => {
    const halo = { width: 2, color: [1, 1, 1, 1] as const };
    expect(resolve({ outline: halo, font: { shadow: '1px 1px black' } }).outline).toBe(halo);
    expect(resolve({ font: { shadow: '1px 1px black' } }, { outline: halo }).outline).toBe(halo);
  });

  it('resolves decoration lines without changing the layout key', () => {
    const r = resolve({ font: { lineposition: 'under+through' } });
    expect(r.decoration).toEqual({ under: true, over: false, through: true });
    expect(r.key).toBe(resolve({}).key);
    expect(resolve({ font: { lineposition: 'none' } }).decoration).toBeNull();
    expect(resolve({}).decoration).toBeNull();
    expect(resolve({}, { font: { lineposition: 'over' } }).decoration?.over).toBe(true);
  });
});

describe('assignLabelSlots', () => {
  it('keeps unchanged labels in place without re-typesetting', () => {
    const { slot, resync } = assignLabelSlots(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(Array.from(slot)).toEqual([0, 1, 2]);
    expect(Array.from(resync)).toEqual([0, 0, 0]);
  });

  it('reuses glyphs when labels shift (panning tick labels)', () => {
    // Ticks 0,1,2,3 -> 1,2,3,4: only the new "4" needs typesetting, reusing the freed "0".
    const { slot, resync } = assignLabelSlots(['0', '1', '2', '3'], ['1', '2', '3', '4']);
    expect(Array.from(slot)).toEqual([1, 2, 3, 0]);
    expect(Array.from(resync)).toEqual([0, 0, 0, 1]);
  });

  it('creates new members only when no candidate is left', () => {
    const { slot, resync } = assignLabelSlots(['a'], ['a', 'b', 'c']);
    expect(Array.from(slot)).toEqual([0, -1, -1]);
    expect(Array.from(resync)).toEqual([0, 1, 1]);
  });

  it('matches pooled candidates by key', () => {
    // Candidates: active ["x"], pooled ["b"].
    const { slot, resync } = assignLabelSlots(['x', 'b'], ['b']);
    expect(Array.from(slot)).toEqual([1]);
    expect(Array.from(resync)).toEqual([0]);
  });

  it('handles duplicate keys one-to-one', () => {
    const { slot, resync } = assignLabelSlots(['a', 'a'], ['b', 'a', 'a', 'a']);
    expect(Array.from(slot)).toEqual([-1, 1, 0, -1]);
    expect(Array.from(resync)).toEqual([1, 0, 0, 1]);
  });

  it('handles empty inputs', () => {
    expect(assignLabelSlots([], []).slot.length).toBe(0);
    expect(Array.from(assignLabelSlots(['a'], []).slot)).toEqual([]);
  });
});

describe('worldPerPixel', () => {
  it('is 1 for the 2D pixel-space orthographic camera', () => {
    const camera = new OrthographicCamera(0, 640, 400, 0, -1000, 1000);
    expect(worldPerPixel(camera.projectionMatrix.elements, -1, 400)).toBeCloseTo(1);
  });

  it('accounts for orthographic zoom', () => {
    const camera = new OrthographicCamera(0, 640, 400, 0, -1000, 1000);
    camera.zoom = 2;
    camera.updateProjectionMatrix();
    expect(worldPerPixel(camera.projectionMatrix.elements, -5, 400)).toBeCloseTo(0.5);
  });

  it('grows with depth for perspective cameras', () => {
    const camera = new PerspectiveCamera(90, 1, 0.1, 100);
    // Visible height at depth 10 is 2 * 10 * tan(45deg) = 20 world units over 100 px.
    expect(worldPerPixel(camera.projectionMatrix.elements, -10, 100)).toBeCloseTo(0.2);
    expect(worldPerPixel(camera.projectionMatrix.elements, -20, 100)).toBeCloseTo(0.4);
  });

  it('returns NaN behind the camera or without a viewport', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    expect(worldPerPixel(camera.projectionMatrix.elements, 5, 100)).toBeNaN();
    expect(worldPerPixel(camera.projectionMatrix.elements, -5, 0)).toBeNaN();
  });
});

describe('computeLabelPlacement', () => {
  const out = (): LabelPlacement => ({
    position: new Vector3(),
    quaternion: new Quaternion(),
    scale: new Vector3(),
  });

  it('fixed mode: rotation in the XY plane, unrotated px offset with +y down', () => {
    const p = computeLabelPlacement(
      out(),
      new Vector3(100, 50, 0),
      10,
      5,
      textAngleToRotation(90),
      new Quaternion(),
      2,
    );
    expect(p.position.toArray()).toEqual([120, 40, 0]);
    expect(p.scale.toArray()).toEqual([2, 2, 2]);
    // Text +x axis points down the screen after a 90deg clockwise rotation.
    const xAxis = new Vector3(1, 0, 0).applyQuaternion(p.quaternion);
    expect(xAxis.x).toBeCloseTo(0);
    expect(xAxis.y).toBeCloseTo(-1);
  });

  it('billboard mode: the text plane and offset follow the camera orientation', () => {
    // A camera yawed +90deg about +y sits at +x looking down -x; its right vector is world -z.
    const orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const p = computeLabelPlacement(out(), new Vector3(0, 0, 0), 4, 0, 0, orientation, 1);
    const normal = new Vector3(0, 0, 1).applyQuaternion(p.quaternion);
    expect(normal.x).toBeCloseTo(1); // faces the camera at +x
    expect(p.position.x).toBeCloseTo(0);
    expect(p.position.z).toBeCloseTo(-4); // camera-right is world -z
  });
});

describe('batched colors', () => {
  it('encodes channels so that BatchedText renders the requested sRGB value', () => {
    for (let i = 0; i <= 255; i++) {
      const srgb = i / 255;
      const v = batchedColorChannel(srgb);
      const color = new Color().setRGB(v, v, v, SRGBColorSpace);
      // BatchedText packs getHex() and decodes byte / 256 as a linear value; three converts to sRGB.
      const rendered = linearToSrgb((color.getHex() & 0xff) / 256);
      // 8-bit linear encoding: coarse steps near black (documented on batchedColorChannel).
      const tolerance = (srgb < 0.1 ? 6 : srgb < 0.2 ? 2.6 : srgb < 0.4 ? 1.6 : 0.62) / 255;
      expect(Math.abs(rendered - srgb)).toBeLessThanOrEqual(tolerance);
    }
  });

  it('clamps inputs', () => {
    expect(batchedColorChannel(-1)).toBe(0);
    expect(batchedColorChannel(2)).toBe(1);
    expect(batchedColorChannel(Number.NaN)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1);
    expect(clampAlpha(1.5)).toBe(1);
    expect(clampAlpha(Number.NaN)).toBe(1);
  });
});
