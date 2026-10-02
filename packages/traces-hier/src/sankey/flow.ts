/**
 * Sankey flow particles (plan E13.5c, a Holochart extension): `link.flow` streams small dots along
 * every link from its source to its target, loops included. Loaded with a dynamic `import()` the
 * first time a trace sets `link.flow` (see `plot.ts`), so sankeys without it never download it.
 *
 * ## Drawing
 *
 * Every particle of a trace is one instance of one draw. Each link's center line (the Bézier
 * band's center curve or the loop's rounded route, up to the arrowhead) is resampled at
 * {@link SAMPLES} points evenly spaced by arc length, each with its offset to the ribbon's edge
 * (across the flow for a band, along the normal for a loop), into one float texture. A particle is
 * a link, a phase and a lane: the vertex shader places it `u = fract(phase + time × speed /
 * length)` along its link by interpolating two texels, then `lane` (−1…1) across the ribbon, so
 * particles move at a constant speed in px and an animation frame costs no CPU work beyond the
 * time uniform. Particles fade in and out over their own size at the link's ends.
 *
 * Phases and lanes follow the R2 low-discrepancy sequence (Roberts 2018) per link: evenly spread
 * along and across the ribbon for any count, and more particles (a longer link) never move the
 * others. A link carries `density` particles per 100 px of length for every 10 px of width (one
 * lane at least). When a link's length changes (a drag), its phase offset is adjusted so its
 * particles go on from where they are.
 *
 * ## Time
 *
 * The clock counts seconds from when the particles appear, and runs only while the chart asks for
 * frames for it: some particle is drawn, the canvas is on screen (an `IntersectionObserver`), and
 * motion is allowed. Browsers stop animation frames in hidden pages. `prefers-reduced-motion:
 * reduce` holds the particles still (spread along the links); `link.flow.time` freezes the clock
 * at a given time: a deterministic frame for exports and visual tests.
 *
 * Hover dims the particles of links outside the highlight; a drag moves them with their links.
 */
import {
  acquireInstancedGeometry,
  createPrimitiveMaterial,
  createUnitQuadTemplate,
  createViewportUniforms,
  presentedCanvas,
  SCREEN_GLSL,
  syncViewportUniforms,
  UNIT_QUAD_KEY,
  type PrimitiveContext,
  type RGBA,
} from '@mk7s/holochart-render';
import {
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  FloatType,
  InstancedBufferAttribute,
  NearestFilter,
  RGBAFormat,
  type IUniform,
  type InstancedBufferGeometry,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { arrowLength, cubic, CURVATURE, loopRoute } from './geometry.ts';
import { pick, rgba, type SankeyModel } from './model.ts';

/** What the particles draw: the view's model, its viewport height and the highlighted links. */
export interface FlowState {
  readonly model: SankeyModel;
  /** Viewport height: world y is `height − container y`. */
  readonly height: number;
  /** Highlighted links (by position): while any is, the other links' particles dim. */
  readonly lit: ReadonlySet<number>;
  /**
   * `config.a11y.reducedMotion` (plan E17.5): `true` holds the particles still, `false` animates
   * them anyway; `'auto'` (or unset) follows `prefers-reduced-motion`.
   */
  readonly reducedMotion?: 'auto' | boolean | undefined;
}

/** Center-line samples per link, evenly spaced by arc length. */
export const SAMPLES = 64;
/** Path texture width in texels: a multiple of {@link SAMPLES}, so a link never wraps a row. */
const TEX_WIDTH = 1024;
/** Most particles on one link. */
const MAX_PER_LINK = 4096;
/** Opacity factor of particles on links outside a hover highlight. */
const DIM = 0.25;
/** The R2 sequence's steps (1/φ₂ and 1/φ₂², φ₂ the plastic number). */
const R2_A = 0.7548776662466927;
const R2_B = 0.5698402909980532;
const QUERY = '(prefers-reduced-motion: reduce)';

/** Defaults of `link.flow` (as the schema's). */
const DFLT = { density: 2, speed: 50, size: 3, opacity: 1 } as const;

const fract = (v: number): number => v - Math.floor(v);

/** A center line with the offset to the ribbon's edge at each point (flat lists). */
export interface CenterLine {
  readonly x: number[];
  readonly y: number[];
  readonly ox: number[];
  readonly oy: number[];
}

/**
 * The center line of link `k` of `model` in world px (container px, y up from `height`), from its
 * source to its target (the base of its arrowhead), with the offsets to its edges.
 */
export function centerLine(model: SankeyModel, k: number, height: number): CenterLine {
  const g = model.graph.links[k]!;
  const h = g.width / 2;
  const { rect, horizontal } = model;
  const line: CenterLine = { x: [], y: [], ox: [], oy: [] };
  // Flow frame → world: flow x runs along the screen x (horizontal) or down the screen (vertical).
  const push = (fx: number, fy: number, ofx: number, ofy: number): void => {
    line.x.push(rect.x + (horizontal ? fx : fy));
    line.y.push(height - rect.y - (horizontal ? fy : fx));
    line.ox.push(horizontal ? ofx : ofy);
    line.oy.push(-(horizontal ? ofy : ofx));
  };
  const arrowlen = model.calc.arrowlen;
  if (g.path) {
    for (const s of loopRoute(g.path, arrowlen)) push(s.x, s.y, s.nx * h, s.ny * h);
    return line;
  }
  const x0 = g.source.x1;
  const y0 = g.y0;
  const y1 = g.y1;
  const xe = g.target.x0 - arrowLength(x0, g.target.x0, arrowlen);
  const c1 = x0 + CURVATURE * (xe - x0);
  const c2 = x0 + (1 - CURVATURE) * (xe - x0);
  const steps = y0 === y1 ? 1 : 32;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // Bands keep their thickness across the flow (see `bandOutline`).
    push(cubic(x0, c1, c2, xe, t), cubic(y0, y0, y1, y1, t), 0, h);
  }
  return line;
}

/**
 * Resample `line` at `n` points evenly spaced by arc length into `out` from index `at` (x, y and
 * the edge offset per point); returns the line's length.
 */
export function resample(line: CenterLine, n: number, out: Float32Array, at = 0): number {
  const m = line.x.length;
  const run = new Float64Array(Math.max(1, m));
  for (let i = 1; i < m; i++) {
    run[i] = run[i - 1]! + Math.hypot(line.x[i]! - line.x[i - 1]!, line.y[i]! - line.y[i - 1]!);
  }
  const length = run[m - 1] ?? 0;
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const s = n > 1 ? (length * i) / (n - 1) : 0;
    while (seg < m - 2 && run[seg + 1]! < s) seg++;
    const next = Math.min(seg + 1, m - 1);
    const span = run[next]! - run[seg]!;
    const f = span > 0 ? Math.min(1, Math.max(0, (s - run[seg]!) / span)) : 0;
    const o = at + i * 4;
    const lists = [line.x, line.y, line.ox, line.oy];
    for (let c = 0; c < 4; c++) {
      const a = lists[c]![seg] ?? 0;
      out[o + c] = a + ((lists[c]![next] ?? a) - a) * f;
    }
  }
  return length;
}

/** Particles on a link `length` × `width` px: `density` per 100 px for every 10 px of width. */
export function particleCount(density: number, length: number, width: number): number {
  if (!(density > 0) || !(length > 0)) return 0;
  const n = Math.round(((density * length) / 100) * Math.max(1, width / 10));
  return Math.min(MAX_PER_LINK, Math.max(1, n));
}

/** Phase (0…1 along the link) and lane (−1…1 across it) of particle `j` of link `k` (R2). */
export function particleSeed(k: number, j: number): [number, number] {
  const n = j + 1 + k * 7919;
  return [fract(0.5 + R2_A * n), 2 * fract(0.5 + R2_B * n) - 1];
}

const num = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

/** The defaulted `link.flow` container (empty when unset). */
function flowOf(model: SankeyModel): Record<string, unknown> {
  const link = (model.trace['link'] ?? {}) as Record<string, unknown>;
  return (link['flow'] ?? {}) as Record<string, unknown>;
}

/**
 * Instance attributes: `iMotion` = link slot, phase, rate (links per second) and lane (−1…1
 * across); `iStyle` = diameter and link length (px); `iColor`.
 */
const VERTEX_SHADER = /* glsl */ `
${SCREEN_GLSL}

uniform highp sampler2D uPath;
uniform float uTime;

in vec4 iMotion;
in vec2 iStyle;
in vec4 iColor;

out vec2 vPx;
flat out float vRadius;
flat out vec4 vColor;

const int S = ${SAMPLES};

vec4 pathAt(int k) {
  int w = textureSize(uPath, 0).x;
  return texelFetch(uPath, ivec2(k % w, k / w), 0);
}

void main() {
  float u = fract(iMotion.y + uTime * iMotion.z);
  float f = u * float(S - 1);
  int i = min(int(f), S - 2);
  int k = int(iMotion.x + 0.5) * S + i;
  vec4 p = mix(pathAt(k), pathAt(k + 1), f - float(i));
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(p.xy + p.zw * iMotion.w, 0.0, 1.0);
  vRadius = 0.5 * iStyle.x;
  vPx = (position.xy * 2.0 - 1.0) * (vRadius + hcAAWidth());
  gl_Position = hcOffsetClip(clip, vPx);
  float s = u * iStyle.y;
  float fade = clamp(min(s, iStyle.y - s) / max(iStyle.x, 1.0), 0.0, 1.0);
  vColor = vec4(iColor.rgb, iColor.a * fade);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
${SCREEN_GLSL}

in vec2 vPx;
flat in float vRadius;
flat in vec4 vColor;

out highp vec4 fragColor;

void main() {
  float alpha = vColor.a * clamp((vRadius - length(vPx)) / hcAAWidth() + 0.5, 0.0, 1.0);
  if (alpha <= 0.0) discard;
  fragColor = vec4(vColor.rgb, alpha);
}
`;

/** Per link: the rate its particles move at and its phase offset (continuity across rebuilds). */
interface LinkMotion {
  rate: number;
  offset: number;
}

/**
 * The particles of one sankey trace, drawn into `mesh` (the view's placeholder, see `plot.ts`):
 * one instanced draw, animated by a time uniform (see the module comment).
 */
export class FlowParticles {
  readonly #context: PrimitiveContext;
  readonly #mesh: Mesh;
  readonly #viewport = createViewportUniforms();
  readonly #time: IUniform<number> = { value: 0 };
  readonly #path: IUniform<DataTexture | null> = { value: null };
  readonly #material: ShaderMaterial;
  #geometry: { geometry: InstancedBufferGeometry; release(): void } | undefined;
  #motion = new InstancedBufferAttribute(new Float32Array(0), 4);
  #style = new InstancedBufferAttribute(new Float32Array(0), 2);
  #color = new InstancedBufferAttribute(new Float32Array(0), 4);
  #capacity = -1;
  #count = 0;
  /** Whether some particle moves (a link with particles and a speed). */
  #moving = false;
  /** Link (position) of every particle, for recoloring. */
  #linkOf = new Uint32Array(0);
  #state: FlowState | undefined;
  #links: LinkMotion[] = [];
  /** Clock: seconds counted until `#since` (a `performance.now()`, −1 while stopped). */
  #clock = 0;
  #since = -1;
  /** `link.flow.time`, when set. */
  #frozen: number | undefined;
  #frame = 0;
  #onScreen = true;
  #observer: IntersectionObserver | undefined;
  readonly #query: MediaQueryList | undefined;
  #disposed = false;

  constructor(context: PrimitiveContext, mesh: Mesh) {
    this.#context = context;
    this.#mesh = mesh;
    this.#material = createPrimitiveMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: { ...this.#viewport, uPath: this.#path, uTime: this.#time },
    });
    this.#material.side = DoubleSide;
    mesh.material = this.#material;
    // Positions come from the path texture: three's bounds would be wrong.
    mesh.frustumCulled = false;
    mesh.onBeforeRender = (renderer) => {
      syncViewportUniforms(this.#viewport, renderer);
      this.#time.value = this.time();
      this.#observe(presentedCanvas(renderer));
    };
    try {
      this.#query = globalThis.matchMedia?.(QUERY);
      this.#query?.addEventListener?.('change', this.#sync);
    } catch {
      this.#query = undefined;
    }
  }

  /** Number of particles drawn. */
  get count(): number {
    return this.#count;
  }

  /** Whether the clock is running (animation frames are requested). */
  get running(): boolean {
    return this.#since >= 0;
  }

  /** The animation time in seconds: `link.flow.time` when set, else the clock. */
  time(now = performance.now()): number {
    return this.#frozen ?? this.#clockAt(now);
  }

  update(state: FlowState): void {
    if (this.#disposed) return;
    const previous = this.#state;
    this.#state = state;
    const time = flowOf(state.model)['time'];
    this.#frozen = typeof time === 'number' && Number.isFinite(time) ? time : undefined;
    if (previous?.model !== state.model || previous.height !== state.height) this.#build(state);
    this.#recolor(state);
    this.#sync();
    this.#context.invalidate();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#sync();
    this.#observer?.disconnect();
    this.#query?.removeEventListener?.('change', this.#sync);
    this.#path.value?.dispose();
    this.#geometry?.release();
    this.#material.dispose();
    this.#mesh.removeFromParent();
  }

  #clockAt(now: number): number {
    return this.#since < 0 ? this.#clock : this.#clock + (now - this.#since) / 1000;
  }

  /** Lay the particles out on the links of `state.model`. */
  #build({ model, height }: FlowState): void {
    const flow = flowOf(model);
    const n = model.links.length;
    const rows = Math.max(1, Math.ceil((n * SAMPLES) / TEX_WIDTH));
    let texture = this.#path.value;
    if (!texture || texture.image.height !== rows) {
      texture?.dispose();
      texture = new DataTexture(
        new Float32Array(TEX_WIDTH * rows * 4),
        TEX_WIDTH,
        rows,
        RGBAFormat,
        FloatType,
      );
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      this.#path.value = texture;
    }
    const paths = texture.image.data as Float32Array;
    const now = this.time();
    const lengths: number[] = [];
    const counts: number[] = [];
    let total = 0;
    model.links.forEach((l, k) => {
      const length = resample(centerLine(model, k, height), SAMPLES, paths, k * SAMPLES * 4);
      const density = num(pick(flow['density'], l.link.index), DFLT.density);
      const count = particleCount(density, length, model.graph.links[k]!.width);
      lengths.push(length);
      counts.push(count);
      total += count;
    });
    texture.needsUpdate = true;

    if (total > this.#capacity)
      this.#allocate(Math.max(64, total, Math.ceil(this.#capacity * 1.5)));
    const motion = this.#motion.array as Float32Array;
    const style = this.#style.array as Float32Array;
    this.#linkOf = new Uint32Array(total);
    const links: LinkMotion[] = [];
    let p = 0;
    this.#moving = false;
    model.links.forEach((l, k) => {
      const idx = l.link.index;
      const length = lengths[k]!;
      const width = model.graph.links[k]!.width;
      const speed = num(pick(flow['speed'], idx), DFLT.speed);
      const size = Math.max(0, num(pick(flow['size'], idx), DFLT.size));
      const rate = length > 0 ? speed / length : 0;
      // Keep the particles where they are when the rate changes: same phase at the time `now`.
      const before = this.#links[k];
      const offset = before ? fract(before.offset + now * (before.rate - rate)) : 0;
      links.push({ rate, offset });
      if (rate > 0 && counts[k]! > 0) this.#moving = true;
      // Lanes keep whole particles inside the ribbon.
      const spread = width > size ? 1 - size / width : 0;
      for (let j = 0; j < counts[k]!; j++, p++) {
        const [phase, lane] = particleSeed(k, j);
        motion[p * 4] = k;
        motion[p * 4 + 1] = fract(phase + offset);
        motion[p * 4 + 2] = rate;
        motion[p * 4 + 3] = lane * spread;
        style[p * 2] = size;
        style[p * 2 + 1] = length;
        this.#linkOf[p] = k;
      }
    });
    this.#links = links;
    this.#count = total;
    this.#geometry!.geometry.instanceCount = total;
    this.#motion.needsUpdate = true;
    this.#style.needsUpdate = true;
    this.#mesh.visible = total > 0;
  }

  /** Particle colors: `flow.color` (default: the link color, opaque) × `flow.opacity`, dimmed. */
  #recolor({ model, lit }: FlowState): void {
    const flow = flowOf(model);
    const opacity = Math.min(1, Math.max(0, num(flow['opacity'], DFLT.opacity)));
    const colors = model.links.map((l, k): RGBA => {
      const c = rgba(pick(flow['color'], l.link.index), [l.color[0], l.color[1], l.color[2], 1]);
      const dim = lit.size > 0 && !lit.has(k) ? DIM : 1;
      return [c[0], c[1], c[2], c[3] * opacity * dim];
    });
    const out = this.#color.array as Float32Array;
    for (let p = 0; p < this.#count; p++) out.set(colors[this.#linkOf[p]!]!, p * 4);
    this.#color.needsUpdate = true;
  }

  /** Room for `capacity` particles. */
  #allocate(capacity: number): void {
    this.#geometry?.release();
    const g = acquireInstancedGeometry(
      this.#context.resources,
      UNIT_QUAD_KEY,
      createUnitQuadTemplate,
    );
    const attribute = (size: number): InstancedBufferAttribute =>
      new InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(
        DynamicDrawUsage,
      );
    this.#motion = attribute(4);
    this.#style = attribute(2);
    this.#color = attribute(4);
    g.geometry.setAttribute('iMotion', this.#motion);
    g.geometry.setAttribute('iStyle', this.#style);
    g.geometry.setAttribute('iColor', this.#color);
    this.#geometry = g;
    this.#mesh.geometry = g.geometry;
    this.#capacity = capacity;
  }

  /** Watch whether the canvas is on screen (once it is known, from the first frame). */
  #observe(canvas: HTMLCanvasElement): void {
    if (this.#observer || this.#disposed || typeof IntersectionObserver !== 'function') return;
    this.#observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      this.#onScreen = last.isIntersecting;
      this.#sync();
    });
    try {
      this.#observer.observe(canvas);
    } catch {
      // Not an element (a custom renderer's `OffscreenCanvas`): taken as on screen.
    }
  }

  /** Start or stop the clock (and the frame requests) as the conditions for motion change. */
  readonly #sync = (): void => {
    const setting = this.#state?.reducedMotion;
    const reduced = typeof setting === 'boolean' ? setting : this.#query?.matches === true;
    const run =
      !this.#disposed &&
      this.#frozen === undefined &&
      this.#moving &&
      this.#onScreen &&
      !reduced &&
      typeof requestAnimationFrame === 'function';
    if (run === this.#since >= 0) return;
    const now = performance.now();
    if (run) {
      this.#since = now;
      this.#frame = requestAnimationFrame(this.#tick);
    } else {
      this.#clock = this.#clockAt(now);
      this.#since = -1;
      if (this.#frame) cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
    this.#context.invalidate();
  };

  readonly #tick = (): void => {
    this.#frame = 0;
    if (this.#since < 0) return;
    this.#context.invalidate();
    this.#frame = requestAnimationFrame(this.#tick);
  };
}

/** Create the particles of a sankey trace, drawn into `mesh`. */
export function createFlowParticles(context: PrimitiveContext, mesh: Mesh): FlowParticles {
  return new FlowParticles(context, mesh);
}
