/**
 * Drawing a scene's axes (plan E14.1b), redrawn on every camera change (cheap: a few hundred
 * vertices and a few dozen labels):
 *
 * - **Walls** (`showbackground`): the three far faces of the axis box ({@link boxFrame}), one
 *   mesh, in the scene's viewport.
 * - **Lines**: grid and zero lines on the walls, axis lines (`showline`, `mirror`) and tick marks
 *   (`ticks`) on the label edges, one `LineSegments` in the scene's viewport. WebGL lines are one
 *   device px wide: `gridwidth`, `linewidth`, `tickwidth` and `zerolinewidth` wait for the 3D line
 *   primitive (M6 wave 1).
 * - **Labels**: tick labels and axis titles, billboards in the overlay (upright, px-sized, over the
 *   scene), pushed off their edge along its outward normal and culled where they overlap
 *   (`labels.ts`).
 *
 * Walls and lines draw first in the transparent pass without writing depth, so the data draws over
 * them and hides them where it is in front.
 */
import { richTextLabel, toRGBA, type FullLayout, type RGBAColor } from '@mk7s/holochart-core';
import {
  createTextPrimitive,
  measureText,
  type Primitive,
  type TextFont,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type { ComponentDrawContext } from '@mk7s/holochart-runtime';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  type Material,
} from 'three';
import { sceneTicks } from './axes.ts';
import { sub, unitsPerPx, type Vec3 } from './camera.ts';
import { anchorsFor, cullOverlaps, labelBox, outwardNormal, type LabelBox } from './labels.ts';
import type { Scene3D } from './scene.ts';
import { boxFrame, closestCorner, type CornerPoint } from './walls.ts';

type Container = Record<string, unknown>;

/** Overlay draw order of scene labels: under the components, like polar axis labels. */
const LABEL_ORDER = -100;

/** A three.js mesh or line object as a runtime-tracked primitive. */
class ObjectPrimitive implements Primitive<never> {
  readonly object: Mesh | LineSegments;
  constructor(object: Mesh | LineSegments) {
    this.object = object;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as Material).dispose();
  }
}

/** Growing vertex buffers: positions (3) and linear-space RGBA colors (4). */
class Buffers {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  #c: RGBAColor = [0, 0, 0, 0];
  readonly #tmp = new Color();
  color(css: unknown): this {
    const c = typeof css === 'string' ? toRGBA(css) : null;
    const t = this.#tmp.setRGB(c?.[0] ?? 0, c?.[1] ?? 0, c?.[2] ?? 0, SRGBColorSpace);
    this.#c = [t.r, t.g, t.b, c?.[3] ?? 0];
    return this;
  }
  vertex(p: Vec3): void {
    this.pos.push(p[0], p[1], p[2]);
    this.col.push(...this.#c);
  }
  segment(a: Vec3, b: Vec3): void {
    this.vertex(a);
    this.vertex(b);
  }
  upload(geometry: BufferGeometry): void {
    const set = (name: string, data: number[], size: number): void => {
      const attr = geometry.getAttribute(name) as BufferAttribute | undefined;
      if (attr && attr.array.length === data.length) {
        (attr.array as Float32Array).set(data);
        attr.needsUpdate = true;
      } else {
        // three frees an attribute's GPU buffer only with the geometry it is on: release the old
        // buffers before the attribute is replaced, or they stay in the context (which, on a
        // shared renderer, outlives the chart). The geometry is uploaded again on the next draw.
        if (attr) geometry.dispose();
        geometry.setAttribute(name, new BufferAttribute(new Float32Array(data), size));
      }
    };
    set('position', this.pos, 3);
    set('color', this.col, 4);
    geometry.setDrawRange(0, this.pos.length / 3);
    geometry.computeBoundingSphere();
  }
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** A layout font container → a text font. */
function textFont(f: Container): TextFont {
  const font: TextFont = {
    family: typeof f['family'] === 'string' ? f['family'] : 'sans-serif',
    size: num(f['size'], 12),
  };
  if (typeof f['weight'] === 'number' || typeof f['weight'] === 'string') {
    font.weight = f['weight'] as TextFont['weight'];
  }
  if (f['style'] === 'italic') font.style = 'italic';
  if (typeof f['variant'] === 'string') font.variant = f['variant'] as TextFont['variant'];
  if (typeof f['textcase'] === 'string') font.textcase = f['textcase'] as TextFont['textcase'];
  if (typeof f['shadow'] === 'string') font.shadow = f['shadow'];
  return font;
}

interface Candidate {
  readonly label: TextLabel;
  readonly box: LabelBox;
}

/** The axes of one scene (see the module comment). */
export class SceneAxes {
  readonly scene: Scene3D;
  #ctx: ComponentDrawContext;
  readonly #walls: ObjectPrimitive;
  readonly #lines: ObjectPrimitive;
  #text: TextPrimitive | undefined;
  readonly #off: () => void;

  constructor(ctx: ComponentDrawContext, scene: Scene3D) {
    this.#ctx = ctx;
    this.scene = scene;
    const walls = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    const lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );
    // First in the transparent pass (trace objects draw at orders ≥ 0).
    walls.renderOrder = -3;
    lines.renderOrder = -2;
    walls.frustumCulled = lines.frustumCulled = false;
    this.#walls = new ObjectPrimitive(walls);
    this.#lines = new ObjectPrimitive(lines);
    ctx.add(this.#walls, scene.viewport);
    ctx.add(this.#lines, scene.viewport);
    this.#off = scene.onCameraChange(() => this.redraw());
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.redraw();
  }

  dispose(): void {
    this.#off();
    const ctx = this.#ctx;
    ctx.remove(this.#walls);
    ctx.remove(this.#lines);
    if (this.#text) ctx.remove(this.#text);
    this.#text = undefined;
  }

  /** Redraw for the scene's current camera and layout. */
  redraw(): void {
    const ctx = this.#ctx;
    const scene = this.scene;
    const full = (ctx.fullLayout as FullLayout)[scene.id] as Container | undefined;
    if (!full) return;
    const layout = scene.layout;
    const h: Vec3 = [layout.aspect[0] / 2, layout.aspect[1] / 2, layout.aspect[2] / 2];
    const corner = (i: number): Vec3 => [
      i & 1 ? h[0] : -h[0],
      i & 2 ? h[1] : -h[1],
      i & 4 ? h[2] : -h[2],
    ];
    const screen = Array.from({ length: 8 }, (_, i) => {
      const c = corner(i);
      return scene.project(c[0], c[1], c[2]);
    });
    const pts: CornerPoint[] = screen.map((p) => ({ x: p.x, y: -p.y }));
    const cam = scene.camera;
    const toward = scene.projection === 'orthographic' ? sub(cam.eye, cam.center) : cam.eye;
    const frame = boxFrame(pts, closestCorner(toward));
    const center = scene.project(0, 0, 0);
    const px = unitsPerPx(cam, scene.projection, scene.viewport.rect.height, scene.orthoZoom);

    const walls = new Buffers();
    const lines = new Buffers();
    const titles: Candidate[] = [];
    const ticks: Candidate[] = [];
    const overlayHeight = ctx.overlay.size.height;

    for (let d = 0; d < 3; d++) {
      const axis = layout.axes[d]!;
      const ax = (full[`${axis.letter}axis`] ?? axis.full) as Container;
      if (ax['visible'] === false) continue;
      const e = (d + 1) % 3;
      const f = (d + 2) % 3;
      const wall = frame.walls[d]! ? h[d]! : -h[d]!;
      if (ax['showbackground'] === true) {
        walls.color(ax['backgroundcolor']);
        const q = (s: number, t: number): Vec3 => {
          const p: Vec3 = [0, 0, 0];
          p[d] = wall;
          p[e] = s * h[e]!;
          p[f] = t * h[f]!;
          return p;
        };
        for (const p of [q(-1, -1), q(1, -1), q(1, 1), q(-1, -1), q(1, 1), q(-1, 1)]) {
          walls.vertex(p);
        }
      }

      // Edge carrying this axis' ticks and labels, and its screen ends.
      const edge = frame.edges[d]!;
      const e0 = corner(edge);
      const s0 = screen[edge]!;
      const s1 = screen[edge | (1 << d)]!;
      const lengthPx = Math.hypot(s1.x - s0.x, s1.y - s0.y);
      const t = scene.transform;
      const scaleD = d === 0 ? t.scaleX : d === 1 ? t.scaleY : t.scaleZ;
      const offsetD = d === 0 ? t.offsetX : d === 1 ? t.offsetY : t.offsetZ;
      const all = sceneTicks(axis.scale, ax, lengthPx);
      const inside = (w: number): boolean => Math.abs(w) <= h[d]! * (1 + 1e-9);
      const tickWorld = all
        .map((tk) => ({ tk, w: tk.l * scaleD + offsetD }))
        .filter((x) => inside(x.w));

      // Grid and zero lines on the two walls this axis runs along.
      const onWalls = (w: number): void => {
        for (const other of [e, f]) {
          const third = other === e ? f : e;
          const a: Vec3 = [0, 0, 0];
          a[d] = w;
          a[other] = frame.walls[other]! ? h[other]! : -h[other]!;
          const b: Vec3 = [a[0], a[1], a[2]];
          a[third] = -h[third]!;
          b[third] = h[third]!;
          lines.segment(a, b);
        }
      };
      if (ax['showgrid'] !== false) {
        lines.color(ax['gridcolor']);
        for (const { w } of tickWorld) onWalls(w);
      }
      if (ax['zeroline'] === true && ax['type'] !== 'log') {
        const w0 = offsetD;
        if (inside(w0)) {
          lines.color(ax['zerolinecolor']);
          onWalls(w0);
        }
      }

      // Axis line and tick marks on the label edge (and the opposite one with `mirror`).
      const mirror = ax['mirror'];
      const edgesOf = (withMirror: boolean): number[] =>
        withMirror ? [edge, edge ^ (7 ^ (1 << d))] : [edge];
      if (ax['showline'] === true) {
        lines.color(ax['linecolor']);
        for (const ed of edgesOf(mirror !== false && mirror !== undefined)) {
          lines.segment(corner(ed), corner(ed | (1 << d)));
        }
      }
      const tickMode = ax['ticks'];
      if (tickMode === 'outside' || tickMode === 'inside') {
        lines.color(ax['tickcolor']);
        const len = num(ax['ticklen'], 5) * px * (tickMode === 'inside' ? -1 : 1);
        for (const ed of edgesOf(mirror === 'ticks' || mirror === 'allticks')) {
          const dir: Vec3 = [0, 0, 0];
          dir[e] = ed & (1 << e) ? 1 : -1;
          dir[f] = ed & (1 << f) ? 1 : -1;
          const k = len / Math.SQRT2;
          const base = corner(ed);
          for (const { w } of tickWorld) {
            const a: Vec3 = [base[0], base[1], base[2]];
            a[d] = w;
            lines.segment(a, [a[0] + dir[0] * k, a[1] + dir[1] * k, a[2] + dir[2] * k]);
          }
        }
      }

      // Labels, pushed off the edge along its outward normal.
      const [nx, ny] = outwardNormal(s0.x, s0.y, s1.x, s1.y, center.x, center.y);
      const { anchorX, anchorY } = anchorsFor(nx, ny);
      const pad = 5 + (tickMode === 'outside' ? num(ax['ticklen'], 5) : 0);
      const angle = typeof ax['tickangle'] === 'number' ? ax['tickangle'] : 0;
      let extent = 0;
      if (ax['showticklabels'] !== false) {
        const tf = (ax['tickfont'] ?? {}) as Container;
        const base = textFont(tf);
        const color = toRGBA(String(tf['color'])) ?? [0, 0, 0, 1];
        for (const { tk, w } of tickWorld) {
          if (tk.text === '' || tk.noTick) continue;
          const p: Vec3 = [e0[0], e0[1], e0[2]];
          p[d] = w;
          const s = scene.project(p[0], p[1], p[2]);
          const x = s.x + nx * pad;
          const y = s.y + ny * pad;
          const font = tk.fontScale ? { ...base, size: base.size * tk.fontScale } : base;
          const c = candidate(tk.text, x, y, font, color, anchorX, anchorY, angle, overlayHeight);
          extent = Math.max(extent, Math.abs(nx) * c.w + Math.abs(ny) * c.h);
          ticks.push(c);
        }
      }
      const title = (ax['title'] ?? {}) as Container;
      const text = typeof title['text'] === 'string' ? title['text'] : '';
      if (ax['showaxeslabels'] !== false && text !== '') {
        const tf = (title['font'] ?? {}) as Container;
        const off = pad + extent + 6;
        const x = (s0.x + s1.x) / 2 + nx * off;
        const y = (s0.y + s1.y) / 2 + ny * off;
        const color = toRGBA(String(tf['color'])) ?? [0, 0, 0, 1];
        titles.push(candidate(text, x, y, textFont(tf), color, anchorX, anchorY, 0, overlayHeight));
      }
    }

    walls.upload(this.#walls.object.geometry);
    lines.upload(this.#lines.object.geometry);

    // Labels inside the scene, titles first, without overlaps.
    const r = scene.viewport.rect;
    const within = (c: Candidate): boolean => {
      const x = c.label.x;
      const y = overlayHeight - c.label.y;
      return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    };
    const kept = cullOverlaps([...titles, ...ticks].filter(within), 2).map((c) => c.label);
    if (kept.length === 0) {
      if (this.#text) ctx.remove(this.#text);
      this.#text = undefined;
    } else {
      if (!this.#text) {
        this.#text = createTextPrimitive(ctx.primitives, { mode: 'fixed', sizing: 'screen' });
        this.#text.object.renderOrder = LABEL_ORDER;
        ctx.add(this.#text);
      }
      this.#text.update({ labels: kept });
    }
    ctx.invalidate();
  }
}

/** A label candidate at container `(x, y)`, with its box for culling. */
function candidate(
  text: string,
  x: number,
  y: number,
  font: TextFont,
  color: RGBAColor,
  anchorX: 'left' | 'center' | 'right',
  anchorY: 'top' | 'middle' | 'bottom',
  angle: number,
  overlayHeight: number,
): Candidate & { w: number; h: number } {
  const rich = richTextLabel(text, font, { newlines: 'break' });
  const plain = rich ? rich.text : text;
  const m = measureText(plain, rich ? rich.font : font, 1.2);
  const label: TextLabel = {
    text: plain,
    x,
    y: overlayHeight - y,
    font: rich ? rich.font : font,
    color,
    anchorX,
    anchorY,
    angle,
    lineHeight: 1.2,
    ...(rich?.runs ? { runs: rich.runs } : {}),
  };
  return {
    label,
    box: labelBox(x, y, m.width, m.height, anchorX, anchorY),
    w: m.width,
    h: m.height,
  };
}
