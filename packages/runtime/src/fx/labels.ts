/**
 * DOM hover labels and drag overlays (plan E5.7, E6.2, E6.3).
 *
 * Decision (M1): hover labels render as a DOM overlay (`config.hoverRenderer: 'dom'`, the only
 * mode for now). ADR-005 puts chart text in WebGL (SDF) for export and 3D, but hover labels are
 * transient, never exported, and need exact text measurement for collision avoidance and rich
 * text (`<b>`, `<br>`) — the DOM gives all of that for free and keeps hover off the GPU. A WebGL
 * label renderer can come later behind the same {@link LabelSpec} input.
 *
 * Everything lives in one absolutely positioned, `pointer-events: none` layer on top of the
 * canvas. Label elements are pooled: hovering from point to point reuses them.
 */
import { avoidOverlaps, type Placed, type Rect } from './geometry.ts';
import type { FontCss, LabelSpec, LabelStyle } from './hover.ts';
import { appendRichText } from './richtext.ts';

/** Gap (px) between a label and its point, and between stacked labels. */
const ARROW = 6;
const GAP = 2;
const PAD_X = 6;
const PAD_Y = 3;

interface LabelEl {
  root: HTMLDivElement;
  body: HTMLDivElement;
  extra: HTMLDivElement;
  arrow: HTMLDivElement;
}

/** Options for {@link HoverLayer.showLabels}. */
export interface ShowLabelsOptions {
  /** Figure size (labels stay inside it). */
  readonly width: number;
  readonly height: number;
  /** The hovered subplot's plot area (common axis labels sit on its edges). */
  readonly plot: Rect | undefined;
  /** `x` / `y` modes: the hovered axis value, shown in a label on that axis. */
  readonly common?: { readonly axis: 'x' | 'y'; readonly text: string; readonly at: number };
}

/** Options for {@link HoverLayer.showUnified}. */
export interface ShowUnifiedOptions extends ShowLabelsOptions {
  readonly title: string;
  readonly titleStyle: LabelStyle;
  /** Pointer position: the box sits beside it. */
  readonly x: number;
  readonly y: number;
}

function applyStyle(el: HTMLElement, s: LabelStyle): void {
  const st = el.style;
  st.background = s.bgcolor;
  st.borderColor = s.bordercolor;
  st.color = s.fontColor;
  st.fontFamily = s.fontFamily;
  st.fontSize = `${s.fontSize}px`;
  st.textAlign = s.align === 'auto' ? 'left' : s.align;
  applyFontCss(el, s.fontCss);
}

/** Set (or reset) the E8.3 font CSS; labels are reused, so unset fields are cleared. */
function applyFontCss(el: HTMLElement, css: FontCss | undefined): void {
  const st = el.style;
  st.fontWeight = css?.fontWeight ?? '';
  st.fontStyle = css?.fontStyle ?? '';
  st.fontVariant = css?.fontVariant ?? '';
  st.textTransform = css?.textTransform ?? '';
  st.textDecorationLine = css?.textDecorationLine ?? '';
  st.textShadow = css?.textShadow ?? '';
}

/**
 * The overlay layer of one chart: hover labels, the zoom box, and selection outlines.
 */
export class HoverLayer {
  readonly layer: HTMLDivElement;
  readonly #doc: Document;
  readonly #labels: LabelEl[] = [];
  #used = 0;
  #unified: HTMLDivElement | undefined;
  #common: HTMLDivElement | undefined;
  #custom: HTMLElement | undefined;
  #svg: SVGSVGElement | undefined;
  #path: SVGPathElement | undefined;
  readonly #placed: Placed[] = [];

  constructor(container: HTMLElement) {
    this.#doc = container.ownerDocument;
    const layer = this.#doc.createElement('div');
    layer.className = 'holochart-fx';
    // Pointer feedback only: the same values are in the chart's accessible description (E17.1),
    // and labels that come and go with the mouse would be noise to a screen reader.
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText =
      'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2;';
    // Hover labels are positioned against the container.
    const pos = container.ownerDocument.defaultView?.getComputedStyle(container).position;
    if (!pos || pos === 'static') container.style.position = 'relative';
    container.appendChild(layer);
    this.layer = layer;
  }

  #label(i: number): LabelEl {
    let el = this.#labels[i];
    if (el) return el;
    const root = this.#doc.createElement('div');
    root.className = 'holochart-hoverlabel';
    root.style.cssText =
      'position:absolute;display:flex;align-items:stretch;white-space:nowrap;line-height:1.25;';
    const body = this.#doc.createElement('div');
    body.className = 'holochart-hoverlabel-text';
    body.style.cssText = `padding:${PAD_Y}px ${PAD_X}px;border:1px solid;border-radius:2px;`;
    const extra = this.#doc.createElement('div');
    extra.className = 'holochart-hoverlabel-name';
    extra.style.cssText = `padding:${PAD_Y}px ${PAD_X}px;display:flex;align-items:center;`;
    const arrow = this.#doc.createElement('div');
    arrow.style.cssText =
      'position:absolute;width:8px;height:8px;border:1px solid;border-top:none;border-right:none;';
    root.append(arrow, body, extra);
    this.layer.appendChild(root);
    el = { root, body, extra, arrow };
    this.#labels.push(el);
    return el;
  }

  /** Hide all hover labels (the drag overlay stays). */
  hideLabels(): void {
    for (let i = 0; i < this.#used; i++) (this.#labels[i] as LabelEl).root.style.display = 'none';
    this.#used = 0;
    if (this.#unified) this.#unified.style.display = 'none';
    if (this.#common) this.#common.style.display = 'none';
    this.#custom?.remove();
    this.#custom = undefined;
  }

  /** Whether any hover label is showing. */
  get showing(): boolean {
    return this.#used > 0 || this.#unified?.style.display === 'block' || this.#custom !== undefined;
  }

  /**
   * One label per point (`closest`, `x`, `y`): beside its point (right, or left when it would
   * leave the figure), stacked without overlaps when there are several.
   */
  showLabels(specs: readonly LabelSpec[], options: ShowLabelsOptions): void {
    this.hideLabels();
    const placed = this.#placed;
    placed.length = 0;
    const shown: { el: LabelEl; spec: LabelSpec; w: number; h: number; left: boolean }[] = [];
    for (const spec of specs) {
      if (!spec.text && !spec.extra) continue;
      const el = this.#label(this.#used++);
      el.root.style.display = 'flex';
      el.body.replaceChildren();
      appendRichText(el.body, spec.text);
      applyStyle(el.body, spec.style);
      el.body.style.display = spec.text ? 'block' : 'none';
      el.extra.replaceChildren();
      if (spec.extra) {
        appendRichText(el.extra, spec.extra);
        el.extra.style.display = 'flex';
        el.extra.style.color = spec.color;
        el.extra.style.fontFamily = spec.style.fontFamily;
        el.extra.style.fontSize = `${spec.style.fontSize}px`;
        applyFontCss(el.extra, spec.style.fontCss);
        el.extra.style.background = 'rgba(255,255,255,0.85)';
      } else el.extra.style.display = 'none';
      el.arrow.style.background = spec.style.bgcolor;
      el.arrow.style.borderColor = spec.style.bordercolor;
      el.arrow.style.display = spec.style.showarrow && spec.text ? 'block' : 'none';
      const w = el.root.offsetWidth;
      const h = el.root.offsetHeight;
      const left = spec.ax + ARROW + w > options.width && spec.ax - ARROW - w >= 0;
      shown.push({ el, spec, w, h, left });
      placed.push({ want: spec.ay, size: h, pos: spec.ay });
    }
    // Stack vertically without overlaps (placed[k] keeps its label via the sort key below).
    const order = placed.map((p, k) => ({ p, k }));
    avoidOverlaps(placed, 0, options.height, GAP);
    for (const { p, k } of order) {
      const s = shown[k];
      if (!s) continue;
      const top = p.pos - s.h / 2;
      const x = s.left ? s.spec.ax - ARROW - s.w : s.spec.ax + ARROW;
      const st = s.el.root.style;
      st.left = `${Math.round(x)}px`;
      st.top = `${Math.round(top)}px`;
      st.flexDirection = s.left ? 'row-reverse' : 'row';
      // Arrow at the point's height, clamped to the label.
      const ay = Math.min(Math.max(s.spec.ay - top, 5), Math.max(5, s.h - 5));
      const a = s.el.arrow.style;
      a.top = `${Math.round(ay - 4)}px`;
      a.left = s.left ? `${s.w - 4}px` : '-4px';
      a.transform = s.left ? 'rotate(-135deg)' : 'rotate(45deg)';
    }
    if (options.common) this.#showCommon(options.common, options);
  }

  #showCommon(common: NonNullable<ShowLabelsOptions['common']>, options: ShowLabelsOptions): void {
    if (!this.#common) {
      const el = this.#doc.createElement('div');
      el.className = 'holochart-hoverlabel-axis';
      el.style.cssText =
        'position:absolute;white-space:nowrap;padding:2px 5px;background:#444;color:#fff;' +
        'font:12px sans-serif;border-radius:2px;';
      this.layer.appendChild(el);
      this.#common = el;
    }
    const el = this.#common;
    el.replaceChildren();
    appendRichText(el, common.text);
    el.style.display = common.text ? 'block' : 'none';
    const plot = options.plot;
    if (!plot || !common.text) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (common.axis === 'x') {
      const x = Math.min(Math.max(common.at - w / 2, 0), options.width - w);
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(plot.y + plot.height + 2)}px`;
    } else {
      el.style.left = `${Math.round(Math.max(0, plot.x - w - 2))}px`;
      el.style.top = `${Math.round(common.at - h / 2)}px`;
    }
  }

  /** The unified box (`x unified`, `y unified`): a title and one row per point. */
  showUnified(specs: readonly LabelSpec[], options: ShowUnifiedOptions): void {
    this.hideLabels();
    if (!this.#unified) {
      const el = this.#doc.createElement('div');
      el.className = 'holochart-hoverlabel-unified';
      el.style.cssText = `position:absolute;white-space:nowrap;padding:${PAD_Y + 1}px ${PAD_X}px;border:1px solid;border-radius:3px;line-height:1.35;`;
      this.layer.appendChild(el);
      this.#unified = el;
    }
    const box = this.#unified;
    box.replaceChildren();
    applyStyle(box, options.titleStyle);
    if (options.title) {
      const title = this.#doc.createElement('div');
      title.style.fontWeight = 'bold';
      appendRichText(title, options.title);
      box.appendChild(title);
    }
    for (const spec of specs) {
      if (!spec.text) continue;
      const row = this.#doc.createElement('div');
      row.className = 'holochart-hoverlabel-row';
      const swatch = this.#doc.createElement('span');
      swatch.style.cssText = `display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:middle;background:${spec.color};border-radius:2px;`;
      row.appendChild(swatch);
      appendRichText(row, spec.text);
      box.appendChild(row);
    }
    box.style.display = 'block';
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const x = options.x + 10 + w > options.width ? options.x - 10 - w : options.x + 10;
    const y = Math.min(Math.max(options.y - h / 2, 0), Math.max(0, options.height - h));
    box.style.left = `${Math.round(Math.max(0, x))}px`;
    box.style.top = `${Math.round(y)}px`;
  }

  /** A custom label element (`config.renderHover`), placed beside `(x, y)`. */
  showCustom(el: HTMLElement, x: number, y: number, width: number): void {
    this.hideLabels();
    el.style.position = 'absolute';
    this.layer.appendChild(el);
    this.#custom = el;
    const w = el.offsetWidth;
    el.style.left = `${Math.round(x + ARROW + w > width ? x - ARROW - w : x + ARROW)}px`;
    el.style.top = `${Math.round(y - el.offsetHeight / 2)}px`;
  }

  // ---- drag overlay ------------------------------------------------------------------------------

  #outline(): SVGPathElement {
    if (this.#path) return this.#path;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = this.#doc.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'holochart-dragoverlay');
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
    const path = this.#doc.createElementNS(ns, 'path');
    path.setAttribute('fill', 'rgba(0,0,0,0.08)');
    path.setAttribute('stroke', '#444');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('stroke-dasharray', '3,3');
    svg.appendChild(path);
    this.layer.appendChild(svg);
    this.#svg = svg;
    this.#path = path;
    return path;
  }

  /** Draw the zoom or selection box (container px). */
  showBox(x0: number, y0: number, x1: number, y1: number): void {
    const path = this.#outline();
    (this.#svg as SVGSVGElement).style.display = 'block';
    path.setAttribute('d', `M${x0},${y0}H${x1}V${y1}H${x0}Z`);
  }

  /** Draw a lasso outline from flat `[x0, y0, x1, y1, …]` container px. */
  showLasso(points: readonly number[]): void {
    const path = this.#outline();
    (this.#svg as SVGSVGElement).style.display = 'block';
    let d = '';
    for (let i = 0; i + 1 < points.length; i += 2) {
      d += `${i === 0 ? 'M' : 'L'}${points[i] as number},${points[i + 1] as number}`;
    }
    path.setAttribute('d', `${d}Z`);
  }

  hideOverlay(): void {
    if (this.#svg) this.#svg.style.display = 'none';
  }

  destroy(): void {
    this.layer.remove();
    this.#labels.length = 0;
  }
}
