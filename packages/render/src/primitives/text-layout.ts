/**
 * Pure logic behind the text primitive (`text.ts`): public label/style types, style resolution to
 * troika layout properties, change detection (which labels must be re-typeset), anchor/rotation
 * mapping, billboard / screen-size placement math, and the color encoding used by troika's
 * `BatchedText`.
 *
 * Kept free of troika imports so it is unit-testable in node (three's math classes are fine).
 */
import { Quaternion, Vector3 } from 'three';
import type { RGBA } from '../types.ts';
import {
  normalizeFontStyle,
  normalizeFontWeight,
  resolveFontURL,
  type TextFont,
  type TextFontStyle,
  type TextFontWeight,
} from './text-fonts.ts';
import { TEXT_DEFAULT_LINE_HEIGHT, type FontMetricsOracle } from './text-metrics.ts';

/** Horizontal anchor: which side of the text block sits at the label position (Plotly `xanchor`). */
export type TextAnchorX = 'left' | 'center' | 'right';

/**
 * Vertical anchor (Plotly `yanchor`): `top`/`middle`/`bottom` of the text block (line boxes), or
 * `baseline` = the baseline of the *first* line (like SVG `<text y>`).
 */
export type TextAnchorY = 'top' | 'middle' | 'bottom' | 'baseline';

/**
 * What to do when a label exceeds `maxWidth`:
 * - `wrap`: troika wraps at whitespace/hyphens (native, uses the real font file);
 * - `ellipsis`: each line is truncated with `…` using the font metrics oracle *before* typesetting
 *   (approximate: the oracle's canvas/fallback metrics may differ slightly from the SDF font);
 * - `none`: no wrapping, text may overflow.
 */
export type TextOverflow = 'wrap' | 'ellipsis' | 'none';

/** `fixed`: text lies in the world XY plane (2D charts). `billboard`: text faces the camera (3D). */
export type TextMode = 'fixed' | 'billboard';

/**
 * `screen`: font sizes and offsets are CSS px regardless of camera distance or zoom (scaled per
 * frame). `world`: sizes are world units (in 2D pixel space the two are identical).
 */
export type TextSizing = 'screen' | 'world';

/** Glyph outline / halo / shadow (troika's outline pass: one extra draw call when any is set). */
export interface TextOutline {
  /** Outline width in px. Keep ≲ 10% of the font size: the SDF has a limited distance range. */
  width: number;
  /** sRGB 0–1 RGBA. */
  color: RGBA;
  /** Blur radius in px (soft shadow). Default 0. */
  blur?: number;
  /** Shadow offset in px, +x right. Default 0. */
  offsetX?: number;
  /** Shadow offset in px, +y down (screen convention). Default 0. */
  offsetY?: number;
}

/** Style shared by all labels ({@link TextData.style}) and overridable per label. */
export interface TextStyle {
  /** Merged field-by-field: `{ ...defaults, ...style.font, ...label.font }`. */
  font?: Partial<TextFont>;
  /** sRGB 0–1 RGBA, straight alpha. Default opaque black. */
  color?: RGBA;
  /** Default `left`. */
  anchorX?: TextAnchorX;
  /** Default `baseline`. */
  anchorY?: TextAnchorY;
  /**
   * Rotation in degrees, Plotly `textangle` / `tickangle` convention: **clockwise positive on
   * screen**, about the anchor point. Default 0.
   */
  angle?: number;
  /** Max line width in px (font units). Default: unlimited. */
  maxWidth?: number;
  /** Default `wrap`. Only used when `maxWidth` is finite. */
  overflow?: TextOverflow;
  /** Alignment of lines within a multi-line block. Default: follows `anchorX`. */
  align?: 'left' | 'center' | 'right';
  /** Line advance as a multiple of the font size. Default {@link TEXT_DEFAULT_LINE_HEIGHT}. */
  lineHeight?: number;
  /** Outline/halo/shadow; `null` disables an outline inherited from the shared style. */
  outline?: TextOutline | null;
  /** Screen-space offset from the anchor in px, `[dx, dy]` with +y down. Not rotated by `angle`. */
  offset?: readonly [number, number];
}

/** One label. Position is in DATA space (see `DataTransform`); JS numbers are float64. */
export interface TextLabel extends TextStyle {
  text: string;
  x: number;
  y: number;
  /** Default 0. */
  z?: number;
}

/** Defaults applied under {@link TextStyle.font}. */
export const TEXT_DEFAULT_FONT: Readonly<Required<TextFont>> = Object.freeze({
  family: 'sans-serif',
  size: 12,
  weight: 400,
  style: 'normal',
});

const DEFAULT_COLOR: RGBA = [0, 0, 0, 1];

/** Properties handed to a troika `Text`; changing any of them forces a re-typeset. */
export interface TroikaLayoutProps {
  text: string;
  font: string | null;
  fontSize: number;
  fontWeight: number;
  fontStyle: TextFontStyle;
  lineHeight: number;
  maxWidth: number;
  whiteSpace: 'normal' | 'nowrap';
  anchorX: TextAnchorX;
  anchorY: 'top' | 'middle' | 'bottom' | 'top-baseline';
  textAlign: 'left' | 'center' | 'right';
}

/** A label with every style field resolved. */
export interface ResolvedTextLabel {
  layout: TroikaLayoutProps;
  /** Identity of `layout`: equal keys ⇒ the typeset glyphs can be reused as-is. */
  key: string;
  color: RGBA;
  outline: TextOutline | null;
  /** Rotation about +z in radians (counter-clockwise, world convention). */
  rotation: number;
  offsetX: number;
  offsetY: number;
  /** False when the position is not finite, the font size is not positive, or the text is empty. */
  visible: boolean;
}

/** Font resolver signature (default: the registry's {@link resolveFontURL}). */
export type FontURLResolver = (
  family: string,
  weight?: TextFontWeight,
  style?: TextFontStyle,
) => string | undefined;

/** Map a Plotly-style vertical anchor to troika's `anchorY`. */
export function troikaAnchorY(anchor: TextAnchorY): TroikaLayoutProps['anchorY'] {
  return anchor === 'baseline' ? 'top-baseline' : anchor;
}

/**
 * Plotly angle (degrees, clockwise on screen) → rotation about +z in radians. World space is +y up
 * (ADR-008), so clockwise on screen is a negative rotation.
 */
export function textAngleToRotation(degrees: number): number {
  return Number.isFinite(degrees) && degrees !== 0 ? (-degrees * Math.PI) / 180 : 0;
}

/** Stable identity string for layout props (field order is fixed by construction). */
export function layoutKey(p: TroikaLayoutProps): string {
  return [
    p.font ?? '',
    p.fontSize,
    p.fontWeight,
    p.fontStyle,
    p.lineHeight,
    p.maxWidth,
    p.whiteSpace,
    p.anchorX,
    p.anchorY,
    p.textAlign,
    p.text,
  ].join('\u0001');
}

/** Resolve a label against the shared style: fonts, overflow handling, anchors, paint. */
export function resolveTextLabel(
  label: TextLabel,
  style: TextStyle,
  oracle: FontMetricsOracle,
  resolveFont: FontURLResolver = resolveFontURL,
): ResolvedTextLabel {
  const pick = <K extends keyof TextStyle>(k: K): TextStyle[K] =>
    label[k] !== undefined ? label[k] : style[k];
  const weight = normalizeFontWeight(label.font?.weight ?? style.font?.weight);
  const font = {
    family: label.font?.family ?? style.font?.family ?? TEXT_DEFAULT_FONT.family,
    size: label.font?.size ?? style.font?.size ?? TEXT_DEFAULT_FONT.size,
    weight,
    style: normalizeFontStyle(label.font?.style ?? style.font?.style),
  };
  const anchorX = pick('anchorX') ?? 'left';
  const anchorY = pick('anchorY') ?? 'baseline';
  const maxWidthIn = pick('maxWidth');
  const maxWidth =
    maxWidthIn !== undefined && Number.isFinite(maxWidthIn) ? Math.max(0, maxWidthIn) : Infinity;
  const overflow = pick('overflow') ?? 'wrap';
  const lineHeightIn = pick('lineHeight');
  const lineHeight =
    lineHeightIn !== undefined && lineHeightIn > 0 ? lineHeightIn : TEXT_DEFAULT_LINE_HEIGHT;

  let text = label.text == null ? '' : String(label.text);
  const sizeOk = Number.isFinite(font.size) && font.size > 0;
  let wrap = false;
  if (maxWidth !== Infinity && sizeOk) {
    if (overflow === 'ellipsis') text = oracle.ellipsize(text, font, maxWidth);
    else if (overflow === 'wrap') wrap = true;
  }

  const layout: TroikaLayoutProps = {
    text,
    font: resolveFont(font.family, font.weight, font.style) ?? null,
    fontSize: sizeOk ? font.size : 0,
    fontWeight: weight,
    fontStyle: font.style,
    lineHeight,
    maxWidth: wrap ? maxWidth : Infinity,
    whiteSpace: wrap ? 'normal' : 'nowrap',
    anchorX,
    anchorY: troikaAnchorY(anchorY),
    textAlign: pick('align') ?? anchorX,
  };
  const outline = pick('outline') ?? null;
  const offset = pick('offset');
  const z = label.z ?? 0;
  return {
    layout,
    key: layoutKey(layout),
    color: pick('color') ?? DEFAULT_COLOR,
    outline: outline && (outline.width > 0 || (outline.blur ?? 0) > 0) ? outline : null,
    rotation: textAngleToRotation(pick('angle') ?? 0),
    offsetX: offset?.[0] ?? 0,
    offsetY: offset?.[1] ?? 0,
    visible:
      sizeOk &&
      text.length > 0 &&
      Number.isFinite(label.x) &&
      Number.isFinite(label.y) &&
      Number.isFinite(z),
  };
}

/** Result of {@link assignLabelSlots}. */
export interface SlotAssignment {
  /** For each next label: index of the reused candidate, or -1 when a new member is needed. */
  slot: Int32Array;
  /** For each next label: 1 when the member must be re-typeset (its key differs). */
  resync: Uint8Array;
}

/**
 * Match next labels to existing troika members so that as few as possible are re-typeset.
 *
 * `candidateKeys` lists the current members (active ones first, in label order, then pooled ones).
 * Priority per label: (1) the candidate at the same index with the same key (stable identity);
 * (2) any unused candidate with the same key — e.g. tick labels that shift position while panning
 * keep their glyphs; (3) any unused candidate, re-typeset; (4) a new member. O(n) with hashing.
 */
export function assignLabelSlots(
  candidateKeys: readonly string[],
  nextKeys: readonly string[],
): SlotAssignment {
  const n = nextKeys.length;
  const slot = new Int32Array(n).fill(-1);
  const resync = new Uint8Array(n);
  const used = new Uint8Array(candidateKeys.length);

  for (let i = 0; i < n && i < candidateKeys.length; i++) {
    if (candidateKeys[i] === nextKeys[i]) {
      slot[i] = i;
      used[i] = 1;
    }
  }

  const byKey = new Map<string, number[]>();
  for (let c = candidateKeys.length - 1; c >= 0; c--) {
    if (used[c]) continue;
    const key = candidateKeys[c]!;
    const list = byKey.get(key);
    if (list) list.push(c);
    else byKey.set(key, [c]);
  }
  for (let i = 0; i < n; i++) {
    if (slot[i] !== -1) continue;
    const list = byKey.get(nextKeys[i]!);
    // Lists are built in reverse, so pop() yields the lowest candidate index first.
    const c = list?.pop();
    if (c !== undefined) {
      slot[i] = c;
      used[c] = 1;
    }
  }

  let free = 0;
  for (let i = 0; i < n; i++) {
    if (slot[i] !== -1) continue;
    while (free < candidateKeys.length && used[free]) free++;
    if (free < candidateKeys.length) {
      slot[i] = free;
      used[free] = 1;
    }
    resync[i] = 1;
  }
  return { slot, resync };
}

/**
 * World units per CSS pixel at view-space depth `viewZ` (negative in front of a three.js camera),
 * derived from the projection matrix (column-major `elements`) so it covers perspective, zoomed,
 * and orthographic cameras alike: `2 · w / (P[5] · viewportHeight)` with `w = P[11]·z + P[15]`.
 * Returns `NaN` when the point is at or behind the camera plane.
 */
export function worldPerPixel(
  projection: ArrayLike<number>,
  viewZ: number,
  viewportHeight: number,
): number {
  const w = projection[11]! * viewZ + projection[15]!;
  const sy = projection[5]!;
  if (!(w > 0) || !(sy !== 0) || !(viewportHeight > 0)) return NaN;
  return (2 * w) / (Math.abs(sy) * viewportHeight);
}

const Z_AXIS = new Vector3(0, 0, 1);
const tmpRotation = new Quaternion();
const tmpOffset = new Vector3();

/** Output of {@link computeLabelPlacement}: a troika member's local transform. */
export interface LabelPlacement {
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

/**
 * Place one label in the batch's local space.
 *
 * - `base`: anchor position (data → world, in the batch's parent-local space);
 * - `orientation`: the text plane's orientation — identity in `fixed` mode, the camera's rotation
 *   relative to the batch in `billboard` mode;
 * - `unitScale`: local units per CSS px (1 in 2D pixel space or with `sizing: 'world'`).
 *
 * The rotation by `rotation` (radians, +z) is applied inside the text plane; the px offset is
 * applied in the plane but *not* rotated (Plotly semantics), with +y down.
 */
export function computeLabelPlacement(
  out: LabelPlacement,
  base: Readonly<Vector3>,
  offsetX: number,
  offsetY: number,
  rotation: number,
  orientation: Readonly<Quaternion>,
  unitScale: number,
): LabelPlacement {
  tmpRotation.setFromAxisAngle(Z_AXIS, rotation);
  out.quaternion.copy(orientation).multiply(tmpRotation);
  tmpOffset.set(offsetX * unitScale, -offsetY * unitScale, 0).applyQuaternion(orientation);
  out.position.copy(base).add(tmpOffset);
  out.scale.setScalar(unitScale);
  return out;
}

/** sRGB → linear transfer function (IEC 61966-2-1). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear → sRGB transfer function (IEC 61966-2-1). */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * Channel value to pass to `Color.setRGB(v, v, v, SRGBColorSpace)` for a troika `BatchedText`
 * member so that the *rendered* color matches the requested sRGB value `srgb`.
 *
 * Why: `BatchedText` packs each member color as an sRGB hex byte (`Color.getHex()`) and its shader
 * decodes it as `byte / 256` into `diffuse`, which three then treats as *linear* and converts to
 * sRGB on output. So the byte must hold the linear value (scaled by 256, not 255); we pick the byte
 * whose rendered sRGB value is closest. Setting the Color from `byte / 255` in sRGB makes
 * `getHex()` return exactly `byte`, with or without `ColorManagement`. Precision is limited by the
 * 8-bit linear encoding (max error per channel, in 1/255 units): 0.6 for sRGB ≥ 0.4, 1.5 for
 * 0.2–0.4, 2.5 for 0.1–0.2, and up to 6 for very dark values < 0.1 (black itself is exact).
 */
export function batchedColorChannel(srgb: number): number {
  const c = Number.isFinite(srgb) ? Math.min(1, Math.max(0, srgb)) : 0;
  const exact = srgbToLinear(c) * 256;
  const lo = Math.min(255, Math.floor(exact));
  const hi = Math.min(255, lo + 1);
  const byte =
    Math.abs(linearToSrgb(lo / 256) - c) <= Math.abs(linearToSrgb(hi / 256) - c) ? lo : hi;
  return byte / 255;
}

/** Clamp an alpha value to [0, 1] (non-finite → 1). */
export function clampAlpha(a: number): number {
  return Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1;
}
