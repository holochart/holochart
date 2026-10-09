/**
 * 3D scene annotations (plan E14.1d): `scene.annotations[]`, after plotly.js
 * `components/annotations3d/`: 2D annotations anchored at a data point `x`, `y`, `z` of the scene.
 * The anchor (the arrow head) is the point's projection; the text sits `ax` / `ay` px from it
 * (always pixels, default −10 / −30, as in Plotly); everything else is the 2D annotation's
 * styling — text, font, `textangle`, box (`bgcolor`, `bordercolor`, `borderwidth`, `borderpad`,
 * `width`, `height`, `align`, `valign`, `opacity`), arrow (`arrowhead`, `startarrowhead`,
 * `arrowside`, `arrowsize`, `arrowwidth`, `arrowcolor`, `standoff`, `startstandoff`), anchors and
 * shifts — with the 2D component's attribute declarations (core's `annotationItemAttributes`) and
 * arrow geometry (render's `arrowGeometry`, arrowheads and rotated boxes). `captureevents` makes a
 * click on the text emit `clickannotation`.
 *
 * Drawn in the overlay (over the scene, like the 2D component: one fill, one line and one text
 * primitive for all of a scene's annotations) and re-placed on every camera move without a
 * pipeline pass. Annotations whose point is outside the axis ranges or behind the camera are
 * hidden (Plotly hides them outside the scene box).
 */
import {
  annotationItemAttributes,
  attr,
  coerceItems,
  isPlainObject,
  richTextLabel,
  toRGBA,
  type FullLayout,
  type RGBAColor,
} from '@mk7s/holochart-core';
import {
  arrowGeometry,
  createLazyFillPrimitive,
  createTextPrimitive,
  fadeTextRuns,
  getDefaultFontMetricsOracle,
  inRotatedBox,
  layoutTextRuns,
  LinePrimitive,
  rotatedBoxCorners,
  rotateScreenPoint,
  type ArrowGeometry,
  type DataTransform,
  type LazyFillPrimitive,
  type RotatedBox,
  type ScreenPoint2D,
  type TextFont,
  type TextLabel,
  type TextPrimitive,
  type TextRunLines,
} from '@mk7s/holochart-render';
import type { ComponentDrawContext, ComponentPointerEvent } from '@mk7s/holochart-runtime';
import type { Scene3D } from './scene.ts';

type Container = Record<string, unknown>;

/** Draw order in the overlay: over the scene's labels and the traces, like 2D annotations. */
const ORDER = { fill: 30, lines: 31, text: 32 } as const;

/** Line height of annotation text (Plotly's `LINE_SPACING`, as the 2D component). */
const LINE_HEIGHT = 1.3;

const A = annotationItemAttributes;

/** The attributes Plotly's `annotations3d` keeps from 2D annotations (no references, no clicks). */
const SHARED = [
  'visible',
  'text',
  'textangle',
  'font',
  'width',
  'height',
  'opacity',
  'align',
  'valign',
  'bgcolor',
  'bordercolor',
  'borderpad',
  'borderwidth',
  'showarrow',
  'arrowcolor',
  'arrowhead',
  'startarrowhead',
  'arrowside',
  'arrowsize',
  'startarrowsize',
  'arrowwidth',
  'standoff',
  'startstandoff',
  'xanchor',
  'yanchor',
  'xshift',
  'yshift',
  'hovertext',
  'hoverlabel',
  'captureevents',
] as const;

/** `scene.annotations[]` (declared in the scene attributes). */
export const sceneAnnotationsAttributes = /* @__PURE__ */ (() => {
  const shared: Record<string, (typeof A)[keyof typeof A]> = {};
  for (const k of SHARED) shared[k] = A[k];
  return attr.items(
    {
      ...shared,
      x: attr.any({ description: "The x of the annotated point, in the scene x axis' data." }),
      y: attr.any({ description: "The y of the annotated point, in the scene y axis' data." }),
      z: attr.any({ description: "The z of the annotated point, in the scene z axis' data." }),
      ax: attr.number({
        description: 'Arrow tail (the text) x offset from the point, px. Default −10.',
      }),
      ay: attr.number({
        description:
          'Arrow tail (the text) y offset from the point, px, positive down. Default −30.',
      }),
    },
    {
      itemName: 'annotation',
      editType: ['plot'],
      description:
        'Annotations anchored at 3D data points: 2D annotation text and arrows at the projected point, following the camera.',
    },
  );
})();

/** A defaulted scene annotation. */
export interface FullSceneAnnotation {
  _index: number;
  visible: boolean;
  text: string;
  textangle: number;
  font: { family: string; size: number; color: string; weight?: unknown; style?: unknown };
  width?: number;
  height?: number;
  opacity: number;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  bgcolor: string;
  bordercolor: string;
  borderpad: number;
  borderwidth: number;
  showarrow: boolean;
  arrowcolor: string;
  arrowhead: number;
  startarrowhead: number;
  arrowside: string;
  arrowsize: number;
  startarrowsize: number;
  arrowwidth: number;
  standoff: number;
  startstandoff: number;
  x?: unknown;
  y?: unknown;
  z?: unknown;
  ax: number;
  ay: number;
  xanchor: 'auto' | 'left' | 'center' | 'right';
  yanchor: 'auto' | 'top' | 'middle' | 'bottom';
  xshift: number;
  yshift: number;
  hovertext?: string;
  captureevents: boolean;
}

/**
 * Supply `scene.annotations` of one scene into `out` (the defaulted scene container): coerced
 * with templating (`scene.annotationdefaults`, else `layout.annotationdefaults`), then the 2D
 * annotation's dependent defaults (fonts from `layout.font`, arrow color and width from the
 * border, `ax` / `ay` −10 / −30, `captureevents` with `hovertext`).
 */
export function supplySceneAnnotations(
  input: Container,
  template: Container | undefined,
  layoutTemplate: Container | undefined,
  out: Container,
  layoutOut: FullLayout,
): void {
  if (!Array.isArray(input['annotations']) && !Array.isArray(template?.['annotations'])) return;
  const list = coerceItems(
    sceneAnnotationsAttributes,
    input['annotations'],
    template?.['annotations'],
    template?.['annotationdefaults'] ?? layoutTemplate?.['annotationdefaults'],
  );
  const base = (layoutOut.font ?? {}) as Container;
  for (const a of list) {
    const font = (isPlainObject(a['font']) ? a['font'] : {}) as Container;
    a['font'] = {
      ...font,
      family: font['family'] ?? base['family'],
      size: font['size'] ?? base['size'],
      color: font['color'] ?? base['color'],
      weight: font['weight'] ?? base['weight'] ?? 'normal',
      style: font['style'] ?? base['style'] ?? 'normal',
    };
    const border = toRGBA(String(a['bordercolor'] ?? ''));
    const borderVisible = border !== null && border[3] > 0;
    a['arrowcolor'] ??= borderVisible ? a['bordercolor'] : '#444';
    a['arrowwidth'] ??= ((borderVisible && (a['borderwidth'] as number)) || 1) * 2;
    a['ax'] ??= -10;
    a['ay'] ??= -30;
    a['captureevents'] ??= typeof a['hovertext'] === 'string' && a['hovertext'] !== '';
  }
  out['annotations'] = list;
}

/** Everything one annotation draws, container px. */
export interface SceneAnnotationGeometry {
  readonly index: number;
  readonly head: ScreenPoint2D;
  readonly box: RotatedBox;
  readonly bgcolor: RGBAColor;
  readonly bordercolor: RGBAColor;
  readonly borderwidth: number;
  readonly label: TextLabel | undefined;
  readonly arrow: ArrowGeometry | undefined;
  readonly arrowcolor: RGBAColor;
  readonly arrowwidth: number;
}

function faded(
  c: RGBAColor | null,
  opacity: number,
  fallback: RGBAColor = [0, 0, 0, 0],
): RGBAColor {
  const v = c ?? fallback;
  return [v[0], v[1], v[2], v[3] * opacity];
}

function textFontOf(f: FullSceneAnnotation['font']): TextFont {
  return {
    family: typeof f.family === 'string' ? f.family : 'sans-serif',
    size: typeof f.size === 'number' ? f.size : 12,
    ...(typeof f.weight === 'number' || typeof f.weight === 'string'
      ? { weight: f.weight as TextFont['weight'] }
      : {}),
    ...(f.style === 'italic' ? { style: 'italic' as const } : {}),
  };
}

/** Size of an annotation's text (runs laid out as the text primitive draws them). */
function measure(
  text: string,
  font: TextFont,
  runs: TextRunLines | undefined,
): { width: number; height: number } {
  if (text === '') return { width: 0, height: 0 };
  const oracle = getDefaultFontMetricsOracle();
  if (runs) {
    const l = layoutTextRuns(runs, { font, lineHeight: LINE_HEIGHT }, oracle);
    return { width: l.width, height: l.height };
  }
  const lines = text.split('\n');
  let width = 0;
  for (const line of lines) width = Math.max(width, oracle.measureWidth(line, font));
  return { width, height: lines.length * font.size * LINE_HEIGHT };
}

/**
 * The geometry of an annotation whose point projects to `head` (container px): the 2D
 * annotation's box, text and arrow with the text `ax` / `ay` px from the head. Pure.
 */
export function sceneAnnotationGeometry(
  a: FullSceneAnnotation,
  head0: ScreenPoint2D,
): SceneAnnotationGeometry {
  const arrow = a.showarrow === true;
  const sx = a.xshift ?? 0;
  const sy = -(a.yshift ?? 0);
  const head = { x: head0.x + sx, y: head0.y + sy };
  const tail = arrow ? { x: head.x + (a.ax ?? -10), y: head.y + (a.ay ?? -30) } : { ...head };
  const base = textFontOf(a.font);
  const rich = richTextLabel(a.text ?? '', base, { newlines: 'break' });
  const text = rich ? rich.text : (a.text ?? '');
  const font = rich ? rich.font : base;
  const tb = measure(text, font, rich?.runs);
  const innerW = a.width ?? tb.width;
  const innerH = a.height ?? tb.height;
  const pad = a.borderwidth + a.borderpad;
  const outerW = Math.round(innerW + 2 * pad);
  const outerH = Math.round(innerH + 2 * pad);
  const angle = a.textangle ?? 0;
  const rad = (angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const bw = c * outerW + s * outerH;
  const bh = s * outerW + c * outerH;
  // `auto` anchors center the box on its point (a data-referenced 2D annotation's rule).
  const ax = a.xanchor === 'auto' ? 'center' : a.xanchor;
  const ay = a.yanchor === 'auto' ? 'middle' : a.yanchor;
  const cx = tail.x + (ax === 'left' ? bw / 2 : ax === 'right' ? -bw / 2 : 0);
  const cy = tail.y + (ay === 'top' ? bh / 2 : ay === 'bottom' ? -bh / 2 : 0);
  const box: RotatedBox = { cx, cy, hw: outerW / 2, hh: outerH / 2, angle };
  const opacity = a.opacity ?? 1;
  let label: TextLabel | undefined;
  if (text !== '') {
    const lx =
      a.align === 'left'
        ? -(innerW - tb.width) / 2
        : a.align === 'right'
          ? (innerW - tb.width) / 2
          : 0;
    const ly =
      a.valign === 'top'
        ? -(innerH - tb.height) / 2
        : a.valign === 'bottom'
          ? (innerH - tb.height) / 2
          : 0;
    const off = rotateScreenPoint(lx, ly, angle);
    label = {
      text,
      x: cx + off.x,
      y: cy + off.y,
      anchorX: 'center',
      anchorY: 'middle',
      angle,
      font,
      color: faded(toRGBA(String(a.font.color)), opacity, [0, 0, 0, 1]),
      align: a.align,
      lineHeight: LINE_HEIGHT,
      ...(rich?.runs ? { runs: fadeTextRuns(rich.runs, opacity) } : {}),
    };
  }
  const arrowGeo = arrow
    ? arrowGeometry(tail, head, box, {
        arrowside: a.arrowside,
        arrowhead: a.arrowhead,
        startarrowhead: a.startarrowhead,
        arrowsize: a.arrowsize,
        startarrowsize: a.startarrowsize,
        arrowwidth: a.arrowwidth,
        standoff: a.standoff,
        startstandoff: a.startstandoff,
      })
    : undefined;
  return {
    index: a._index,
    head,
    box,
    bgcolor: faded(toRGBA(String(a.bgcolor)), opacity),
    bordercolor: faded(toRGBA(String(a.bordercolor)), opacity),
    borderwidth: a.borderwidth,
    label,
    arrow: arrowGeo,
    arrowcolor: faded(toRGBA(String(a.arrowcolor)), opacity, [0.27, 0.27, 0.27, 1]),
    arrowwidth: a.arrowwidth,
  };
}

/** The annotations of a defaulted scene. */
export function sceneAnnotationsOf(full: Container | undefined): FullSceneAnnotation[] {
  const list = full?.['annotations'];
  return Array.isArray(list) ? (list as FullSceneAnnotation[]) : [];
}

/**
 * Container px of an annotation's point in `scene`, or `undefined` when its data doesn't convert,
 * lies outside an axis range or is behind the camera.
 */
export function sceneAnnotationAnchor(
  scene: Scene3D,
  a: Pick<FullSceneAnnotation, 'x' | 'y' | 'z'>,
): ScreenPoint2D | undefined {
  const l: number[] = [];
  const values = [a.x, a.y, a.z];
  for (let d = 0; d < 3; d++) {
    const axis = scene.layout.axes[d]!;
    const v = axis.scale.d2l(values[d]);
    const [r0, r1] = axis.range;
    const tol = Math.abs(r1 - r0) * 1e-9;
    if (!Number.isFinite(v) || v < Math.min(r0, r1) - tol || v > Math.max(r0, r1) + tol) {
      return undefined;
    }
    l.push(v);
  }
  const w = scene.toWorld(l[0]!, l[1]!, l[2]!);
  const s = scene.project(w[0], w[1], w[2]);
  if (!(s.depth >= -1 && s.depth <= 1)) return undefined;
  return { x: s.x, y: s.y };
}

/** Container px → overlay world px (bottom-left origin). */
function overlayTransform(height: number): DataTransform {
  return { scaleX: 1, offsetX: 0, scaleY: -1, offsetY: height, scaleZ: 1, offsetZ: 0 };
}

/** The annotations of one scene (owned by the scene component, like its axes). */
export class SceneAnnotations {
  readonly scene: Scene3D;
  #ctx: ComponentDrawContext;
  #fill: LazyFillPrimitive | undefined;
  #fillKey = '';
  #lines: LinePrimitive | undefined;
  #linesKey = '';
  #text: TextPrimitive | undefined;
  #geoms: SceneAnnotationGeometry[] = [];
  readonly #off: () => void;

  constructor(ctx: ComponentDrawContext, scene: Scene3D) {
    this.#ctx = ctx;
    this.scene = scene;
    this.#off = scene.onCameraChange(() => this.redraw());
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.redraw();
  }

  /** Re-place every annotation for the scene's current camera and layout. */
  redraw(): void {
    const ctx = this.#ctx;
    const full = ctx.fullLayout[this.scene.id] as Container | undefined;
    const geoms: SceneAnnotationGeometry[] = [];
    for (const a of sceneAnnotationsOf(full)) {
      if (a.visible === false) continue;
      const head = sceneAnnotationAnchor(this.scene, a);
      if (head) geoms.push(sceneAnnotationGeometry(a, head));
    }
    this.#geoms = geoms;
    const fill = {
      x: [] as number[],
      y: [] as number[],
      rings: [] as number[],
      polygons: [] as number[],
      color: [] as number[],
    };
    const lines = {
      x: [] as number[],
      y: [] as number[],
      starts: [] as number[],
      color: [] as number[],
      width: [] as number[],
    };
    const labels: TextLabel[] = [];
    const polygon = (rings: readonly ScreenPoint2D[][], color: RGBAColor): void => {
      fill.polygons.push(fill.rings.length);
      for (const ring of rings) {
        fill.rings.push(fill.x.length);
        for (const p of ring) {
          fill.x.push(p.x);
          fill.y.push(p.y);
        }
      }
      fill.color.push(...color);
    };
    for (const g of geoms) {
      if (g.bgcolor[3] > 0) polygon([rotatedBoxCorners(g.box)], g.bgcolor);
      if (g.borderwidth > 0 && g.bordercolor[3] > 0) {
        polygon([rotatedBoxCorners(g.box), rotatedBoxCorners(g.box, g.borderwidth)], g.bordercolor);
      }
      const line = g.arrow?.line;
      if (line && g.arrowcolor[3] > 0 && g.arrowwidth > 0) {
        if (lines.x.length > 0) lines.starts.push(lines.x.length);
        for (const p of line) {
          lines.x.push(p.x);
          lines.y.push(p.y);
          lines.color.push(...g.arrowcolor);
          lines.width.push(g.arrowwidth);
        }
      }
      for (const head of g.arrow?.heads ?? []) {
        if (head.length >= 3 && g.arrowcolor[3] > 0) polygon([head], g.arrowcolor);
      }
      if (g.label) labels.push(g.label);
    }
    const t = overlayTransform(ctx.height);

    const fillKey = JSON.stringify(fill);
    if (fill.polygons.length === 0) {
      if (this.#fill) ctx.remove(this.#fill);
      this.#fill = undefined;
    } else if (fillKey !== this.#fillKey || !this.#fill) {
      const data = {
        x: Float64Array.from(fill.x),
        y: Float64Array.from(fill.y),
        rings: fill.rings,
        polygons: fill.polygons,
        color: Float32Array.from(fill.color),
      };
      if (!this.#fill) {
        this.#fill = createLazyFillPrimitive(ctx.primitives, data);
        this.#fill.object.renderOrder = ORDER.fill;
        ctx.add(this.#fill);
      } else this.#fill.update(data);
    }
    this.#fillKey = fillKey;
    this.#fill?.setTransform(t);

    const linesKey = JSON.stringify(lines);
    if (lines.x.length === 0) {
      if (this.#lines) ctx.remove(this.#lines);
      this.#lines = undefined;
    } else if (linesKey !== this.#linesKey || !this.#lines) {
      if (!this.#lines) {
        this.#lines = new LinePrimitive(ctx.primitives, {});
        this.#lines.object.renderOrder = ORDER.lines;
        ctx.add(this.#lines);
      }
      this.#lines.update({
        x: Float64Array.from(lines.x),
        y: Float64Array.from(lines.y),
        starts: lines.starts,
        color: Float32Array.from(lines.color),
        width: Float32Array.from(lines.width),
        cap: 'butt',
      });
    }
    this.#linesKey = linesKey;
    this.#lines?.setTransform(t);

    if (labels.length === 0) {
      if (this.#text) ctx.remove(this.#text);
      this.#text = undefined;
    } else {
      if (!this.#text) {
        this.#text = createTextPrimitive(ctx.primitives, { mode: 'fixed', sizing: 'screen' });
        this.#text.object.renderOrder = ORDER.text;
        ctx.add(this.#text);
      }
      this.#text.update({ labels });
      this.#text.setTransform(t);
    }
    ctx.invalidate();
  }

  /** A click on an annotation with `captureevents` emits `clickannotation` (Plotly). */
  handlePointer(event: ComponentPointerEvent): boolean {
    for (let i = this.#geoms.length - 1; i >= 0; i--) {
      const g = this.#geoms[i]!;
      if (!inRotatedBox(g.box, event.x, event.y, 1)) continue;
      const full = sceneAnnotationsOf(this.#ctx.fullLayout[this.scene.id] as Container).find(
        (a) => a._index === g.index,
      );
      if (!full?.captureevents) return false;
      if (event.type === 'move') event.cursor = 'pointer';
      if (event.type === 'click') {
        const chart = this.#ctx.chart;
        const input = (chart?.layout[this.scene.id] as Container | undefined)?.['annotations'];
        chart?.emit('clickannotation', {
          index: g.index,
          annotation: Array.isArray(input) ? input[g.index] : undefined,
          fullAnnotation: full,
          ...(event.native ? { event: event.native as Event } : {}),
        });
      }
      return event.type !== 'wheel';
    }
    return false;
  }

  dispose(): void {
    this.#off();
    const ctx = this.#ctx;
    if (this.#fill) ctx.remove(this.#fill);
    if (this.#lines) ctx.remove(this.#lines);
    if (this.#text) ctx.remove(this.#text);
    this.#fill = this.#lines = this.#text = undefined;
  }
}
