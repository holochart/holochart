// Ambient troika types must also reach programs that compile these sources indirectly (examples).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./troika-three-text.d.ts" />
/**
 * Text primitive (plan E2.9, ADR-005): batched SDF labels via troika-three-text.
 *
 * ## Design
 *
 * - **One draw call** (two with outlines): all labels are members of a troika `BatchedText`, which
 *   packs every member's matrix, color, and opacity into a float data texture and draws all glyphs
 *   as one instanced mesh. `BatchedText` is marked experimental upstream and needs WebGL2 (three
 *   0.186 is WebGL2-only). The alternative — one `Text` mesh per label — would make draw calls grow
 *   with the label count, which `types.ts` forbids.
 * - **Pooled members, minimal re-typesetting**: each label is backed by a troika `Text` member.
 *   Members are matched to labels by their layout key (text + font + size + wrap + anchors, see
 *   {@link assignLabelSlots}), so only labels whose layout actually changed are re-typeset; labels
 *   that merely move, recolor, or swap positions (panning tick labels) reuse their glyphs. Members no
 *   longer needed go to a pool for reuse.
 * - **Positions** are in data space and mapped through the {@link DataTransform} on the CPU in
 *   float64 (RTC: `world = (data − origin)·scale + (offset + origin·scale)`), then uploaded as
 *   float32 member matrices. `setTransform` therefore costs O(labels) CPU for positions plus the
 *   per-frame data-texture refresh troika does anyway; it never re-typesets.
 * - **Billboard / screen-size**: in `billboard` mode, or with `sizing: 'screen'`, member rotations
 *   and scales are recomputed in `onBeforeRender` from the camera (O(labels) per rendered frame;
 *   skipped when an orthographic camera's px scale is unchanged).
 *
 * ## Colors
 *
 * Inputs are sRGB 0–1 RGBA like every primitive. troika's shader goes through three's output color
 * conversion, and `BatchedText` packs colors as bytes; {@link batchedColorChannel} compensates so
 * the rendered color matches the CSS color (≤ 1.5/255 per channel for sRGB ≥ 0.2; coarser near
 * black because troika packs 8-bit linear values).
 *
 * ## Fonts
 *
 * Families resolve to font files through `registerFont` (text-fonts.ts). Unregistered families use
 * troika's default font: `configureText({ defaultFontURL })` or, if unset, troika's CDN fallback.
 * Visual tests need a vendored font (e.g. Inter, OFL) so rendering is offline and deterministic.
 */
import { BatchedText, Text, configureTextBuilder, preloadFont } from 'troika-three-text';
import {
  Color,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import type { DataTransform, Primitive, PrimitiveContext, ViewportSize } from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import { computeOrigin, effectiveTransform, type Vec3 } from './common.ts';
import {
  resolveFontURL,
  normalizeFontStyle,
  normalizeFontWeight,
  type TextFontStyle,
  type TextFontWeight,
} from './text-fonts.ts';
import {
  assignLabelSlots,
  batchedColorChannel,
  clampAlpha,
  computeLabelPlacement,
  resolveTextLabel,
  worldPerPixel,
  type FontURLResolver,
  type LabelPlacement,
  type ResolvedTextLabel,
  type TextLabel,
  type TextMode,
  type TextSizing,
  type TextStyle,
} from './text-layout.ts';
import { getDefaultFontMetricsOracle, type FontMetricsOracle } from './text-metrics.ts';

export type {
  TextAnchorX,
  TextAnchorY,
  TextLabel,
  TextMode,
  TextOutline,
  TextOverflow,
  TextSizing,
  TextStyle,
} from './text-layout.ts';
export { TEXT_DEFAULT_FONT } from './text-layout.ts';

/** Data for {@link TextPrimitive}. */
export interface TextData {
  /** The labels. Replacing the array re-resolves all labels but re-typesets only changed ones. */
  labels: readonly TextLabel[];
  /** Defaults for every label (each label may override any field). */
  style: TextStyle;
  /** Default `fixed`. */
  mode: TextMode;
  /** Default `screen`. */
  sizing: TextSizing;
}

export interface TextPrimitiveOptions {
  /** Oracle used for ellipsis truncation. Default: the shared default oracle. */
  metrics?: FontMetricsOracle;
  /** Family → font URL resolution. Default: the `registerFont` registry. */
  resolveFont?: FontURLResolver;
  /** Max idle troika members kept for reuse. Default 256. */
  poolSize?: number;
}

/** Global text-rendering configuration (wraps troika's `configureTextBuilder`). */
export interface TextConfig {
  /**
   * Font file (TTF/OTF/WOFF, not WOFF2) used when a family is not registered. Unset → troika's
   * CDN-hosted fallback, which is not suitable for offline/deterministic tests: vendor a font file
   * (e.g. Inter, OFL-licensed) and point this at it.
   */
  defaultFontURL?: string;
  /** Location of troika's unicode fallback-font data (default: CDN). */
  unicodeFontsURL?: string;
  /** Typeset in a web worker (default true). Disable under CSPs that forbid blob workers. */
  useWorker?: boolean;
  /** SDF glyph resolution, a power of two (default 64). */
  sdfGlyphSize?: number;
}

/**
 * Configure text rendering globally. Must run before the first label is typeset (troika ignores
 * later calls and warns).
 */
export function configureText(config: TextConfig): void {
  const out: Parameters<typeof configureTextBuilder>[0] = {};
  if (config.defaultFontURL !== undefined) out.defaultFontURL = config.defaultFontURL;
  if (config.unicodeFontsURL !== undefined) out.unicodeFontsURL = config.unicodeFontsURL;
  if (config.useWorker !== undefined) out.useWorker = config.useWorker;
  if (config.sdfGlyphSize !== undefined) out.sdfGlyphSize = config.sdfGlyphSize;
  configureTextBuilder(out);
}

/**
 * Load a font and pre-generate glyph SDFs (e.g. digits for tick labels) so the first frame with
 * text does not stall. Resolves the family through the font registry.
 */
export function preloadTextFont(options: {
  family?: string;
  weight?: TextFontWeight;
  style?: TextFontStyle;
  characters?: string | string[];
}): Promise<void> {
  const font =
    options.family !== undefined
      ? (resolveFontURL(
          options.family,
          normalizeFontWeight(options.weight),
          normalizeFontStyle(options.style),
        ) ?? null)
      : null;
  return new Promise((resolve) => {
    preloadFont({ font, characters: options.characters ?? ' ' }, () => resolve());
  });
}

interface Member {
  text: Text;
  key: string;
  color: Color;
  outlineColor: Color;
}

const DEFAULT_POOL_SIZE = 256;

const tmpBase = new Vector3();
const tmpView = new Vector3();
const tmpScale = new Vector3();
const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpParentQuat = new Quaternion();
const IDENTITY_QUAT = new Quaternion();

/**
 * Batched label set. Create with {@link createTextPrimitive}; add `object` to a scene.
 *
 * `ready` resolves once every typesetting triggered so far has finished (a fresh promise after each
 * update that re-typesets), which visual tests await before capturing.
 */
export class TextPrimitive implements Primitive<TextData> {
  readonly object: Object3D;

  private readonly context: PrimitiveContext;
  private readonly batch: BatchedText;
  private readonly baseMaterial: MeshBasicMaterial;
  private readonly metrics: FontMetricsOracle;
  private readonly resolveFont: FontURLResolver;
  private readonly poolSize: number;

  private data: TextData = { labels: [], style: {}, mode: 'fixed', sizing: 'screen' };
  private resolved: ResolvedTextLabel[] = [];
  private members: Member[] = [];
  private pool: Member[] = [];
  private origin: Vec3 = [0, 0, 0];
  /** RTC-encoded label positions (data − origin), 3 per label, float64. */
  private local = new Float64Array(0);
  /** World positions (before offsets/billboarding), 3 per label, float64. */
  private world = new Float64Array(0);
  private transform: DataTransform = { ...IDENTITY_TRANSFORM };
  private viewport: ViewportSize = { width: 0, height: 0, pixelRatio: 1 };
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;

  /** Placement must be recomputed on the next frame (per-frame modes). */
  private placementDirty = true;
  private lastFrame = -1;
  private lastCamera: Camera | null = null;
  private lastUniformScale = NaN;
  private readonly placement: LabelPlacement;

  constructor(context: PrimitiveContext, options: TextPrimitiveOptions = {}) {
    this.context = context;
    this.metrics = options.metrics ?? getDefaultFontMetricsOracle();
    this.resolveFont = options.resolveFont ?? resolveFontURL;
    this.poolSize = Math.max(0, options.poolSize ?? DEFAULT_POOL_SIZE);

    // Straight-alpha blending, no depth writes (anti-aliased glyph edges must not punch holes),
    // no tone mapping: consistent with createPrimitiveMaterial in common.ts.
    this.baseMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const batch = new BatchedText();
    batch.material = this.baseMaterial;
    batch.name = 'holochart:text';
    batch.visible = false;
    this.batch = batch;
    this.object = batch;

    const renderBatch = batch.onBeforeRender;
    batch.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      this.beforeRender(renderer, camera);
      renderBatch.call(batch, renderer, scene, camera, geometry, material, group);
    };

    this.placement = {
      position: new Vector3(),
      quaternion: new Quaternion(),
      scale: new Vector3(1, 1, 1),
    };
  }

  /** Resolves when all typesetting requested so far has completed and been packed. */
  get ready(): Promise<void> {
    return this.pending;
  }

  /** Same as {@link ready}, as a method. */
  whenReady(): Promise<void> {
    return this.pending;
  }

  /** Number of pooled (idle) troika members, for debugging and tests. */
  get pooledCount(): number {
    return this.pool.length;
  }

  update(patch: Partial<TextData>): void {
    if (this.disposed) return;
    const prev = this.data;
    const next: TextData = { ...prev, ...patch };
    this.data = next;

    let needsSync = false;
    if (patch.labels !== undefined || patch.style !== undefined) {
      needsSync = this.syncLabels(next);
      this.updatePositions();
    }
    if (next.mode !== prev.mode || next.sizing !== prev.sizing) this.placementDirty = true;
    // Per-frame modes may place labels anywhere; bounds-based culling would lag a frame behind.
    this.batch.frustumCulled = !this.perFrame();
    this.applyStaticPlacement();

    if (needsSync) this.startSync();
    this.context.invalidate();
  }

  setTransform(transform: DataTransform): void {
    if (this.disposed) return;
    this.transform = { ...transform };
    this.updateWorld();
    this.applyStaticPlacement();
    this.context.invalidate();
  }

  setViewport(size: ViewportSize): void {
    this.viewport = { ...size };
    this.placementDirty = true;
    this.context.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of this.members) {
      this.batch.removeText(m.text);
      m.text.dispose();
    }
    for (const m of this.pool) m.text.dispose();
    this.members = [];
    this.pool = [];
    this.batch.dispose();
    // Disposing the base material also disposes troika's derived (and outline) materials.
    this.baseMaterial.dispose();
  }

  /** Resolve labels, reuse/pool members, and apply layout + paint. Returns true if a sync is due. */
  private syncLabels(data: TextData): boolean {
    const labels = data.labels;
    const resolved = labels.map((label) =>
      resolveTextLabel(label, data.style, this.metrics, this.resolveFont),
    );
    const candidates = this.members.concat(this.pool);
    const { slot, resync } = assignLabelSlots(
      candidates.map((m) => m.key),
      resolved.map((r) => r.key),
    );

    let needsSync = false;
    const nextMembers: Member[] = new Array<Member>(resolved.length);
    for (let i = 0; i < resolved.length; i++) {
      const s = slot[i]!;
      const member = s >= 0 ? candidates[s]! : this.createMember();
      const r = resolved[i]!;
      if (resync[i]) {
        applyLayout(member.text, r);
        member.key = r.key;
        needsSync = true;
      }
      applyPaint(member, r);
      nextMembers[i] = member;
    }

    const active = new Set(nextMembers);
    const wasActive = new Set(this.members);
    for (const m of nextMembers) {
      if (!wasActive.has(m)) {
        this.batch.addText(m.text);
        needsSync = true;
      }
    }
    const pool: Member[] = [];
    for (const m of candidates) {
      if (active.has(m)) continue;
      if (wasActive.has(m)) {
        this.batch.removeText(m.text);
        needsSync = true;
      }
      if (pool.length < this.poolSize) pool.push(m);
      else m.text.dispose();
    }

    this.members = nextMembers;
    this.pool = pool;
    this.resolved = resolved;
    this.batch.visible = nextMembers.length > 0;
    this.placementDirty = true;
    return needsSync;
  }

  private createMember(): Member {
    const text = new Text();
    const color = new Color();
    const outlineColor = new Color();
    text.color = color;
    text.outlineColor = outlineColor;
    return { text, key: '\u0000new', color, outlineColor };
  }

  /** Recompute the RTC origin and origin-relative (float64) positions from the labels. */
  private updatePositions(): void {
    const labels = this.data.labels;
    const n = labels.length;
    if (this.local.length !== n * 3) {
      this.local = new Float64Array(n * 3);
      this.world = new Float64Array(n * 3);
    }
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const zs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const label = labels[i]!;
      xs[i] = label.x;
      ys[i] = label.y;
      zs[i] = label.z ?? 0;
    }
    const origin = computeOrigin(xs, ys, zs);
    this.origin = origin;
    const local = this.local;
    for (let i = 0; i < n; i++) {
      local[i * 3] = xs[i]! - origin[0];
      local[i * 3 + 1] = ys[i]! - origin[1];
      local[i * 3 + 2] = zs[i]! - origin[2];
    }
    this.updateWorld();
  }

  /** World positions from RTC-local ones: O(labels), no allocation, no re-typesetting. */
  private updateWorld(): void {
    const { local, world } = this;
    const { scale, offset } = effectiveTransform(this.transform, this.origin);
    for (let i = 0; i < local.length; i += 3) {
      world[i] = local[i]! * scale[0] + offset[0];
      world[i + 1] = local[i + 1]! * scale[1] + offset[1];
      world[i + 2] = local[i + 2]! * scale[2] + offset[2];
    }
    this.placementDirty = true;
  }

  private perFrame(): boolean {
    return this.data.mode === 'billboard' || this.data.sizing === 'screen';
  }

  /** Fixed orientation + world sizing: placement is static, apply it now. */
  private applyStaticPlacement(): void {
    if (this.perFrame()) return;
    this.placeAll(IDENTITY_QUAT, null, 1);
    this.placementDirty = false;
  }

  /**
   * Write every member's local matrix. `perspective` is the view matrix (camera ⋅ batch world) used
   * to get each label's depth; `null` means the uniform `unitScale` applies to all labels.
   */
  private placeAll(
    orientation: Readonly<Quaternion>,
    perspective: { view: Matrix4; projection: ArrayLike<number>; parentScale: number } | null,
    unitScale: number,
  ): void {
    const { members, resolved, world, placement } = this;
    const height = this.viewport.height;
    for (let i = 0; i < members.length; i++) {
      const text = members[i]!.text;
      const r = resolved[i]!;
      tmpBase.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!);
      let s = unitScale;
      if (perspective) {
        const viewZ = tmpView.copy(tmpBase).applyMatrix4(perspective.view).z;
        s = worldPerPixel(perspective.projection, viewZ, height) / perspective.parentScale;
      }
      if (!r.visible || !(s > 0) || !Number.isFinite(s)) {
        // Degenerate matrix: the member's glyphs collapse to a point and produce no fragments.
        text.position.copy(tmpBase);
        text.scale.setScalar(0);
      } else {
        computeLabelPlacement(placement, tmpBase, r.offsetX, r.offsetY, r.rotation, orientation, s);
        text.position.copy(placement.position);
        text.quaternion.copy(placement.quaternion);
        text.scale.copy(placement.scale);
      }
      text.updateMatrix();
    }
  }

  /** Per-frame billboard / screen-size placement (called for each material pass). */
  private beforeRender(renderer: WebGLRenderer, camera: Camera): void {
    if (!this.perFrame() || this.members.length === 0) return;
    const frame = renderer.info.render.frame;
    if (frame === this.lastFrame && camera === this.lastCamera && !this.placementDirty) return;
    this.lastFrame = frame;
    this.lastCamera = camera;

    const batch = this.batch;
    const parentScale = batch.matrixWorld.getMaxScaleOnAxis() || 1;
    let orientation: Quaternion = IDENTITY_QUAT;
    if (this.data.mode === 'billboard') {
      batch.matrixWorld.decompose(tmpView, tmpParentQuat, tmpScale);
      camera.getWorldQuaternion(tmpQuat);
      orientation = tmpParentQuat.invert().multiply(tmpQuat);
    }

    const projection = camera.projectionMatrix.elements;
    const screen = this.data.sizing === 'screen';
    const isPerspective = projection[11] !== 0;
    if (screen && isPerspective) {
      tmpMatrix.multiplyMatrices(camera.matrixWorldInverse, batch.matrixWorld);
      this.placeAll(orientation, { view: tmpMatrix, projection, parentScale }, 1);
    } else {
      let s = 1;
      if (screen) {
        const px = worldPerPixel(projection, -1, this.viewport.height);
        s = Number.isFinite(px) ? px / parentScale : 1;
      }
      // Orthographic fixed-orientation: nothing depends on the camera pose, only on the px scale.
      if (this.data.mode === 'fixed' && !this.placementDirty && s === this.lastUniformScale) return;
      this.lastUniformScale = s;
      this.placeAll(orientation, null, s);
    }
    this.placementDirty = false;
  }

  private startSync(): void {
    const batch = this.batch;
    const done = new Promise<void>((resolve) => batch.sync(resolve));
    void done.then(() => {
      if (!this.disposed) this.context.invalidate();
    });
    this.pending = Promise.all([this.pending, done]).then(() => undefined);
  }
}

/** Copy resolved layout props onto a troika member (setters flag a re-typeset on change). */
function applyLayout(text: Text, r: ResolvedTextLabel): void {
  const p = r.layout;
  text.text = p.text;
  text.font = p.font;
  text.fontSize = p.fontSize > 0 ? p.fontSize : 1e-6;
  text.fontWeight = p.fontWeight;
  text.fontStyle = p.fontStyle;
  text.lineHeight = p.lineHeight;
  text.maxWidth = p.maxWidth;
  text.whiteSpace = p.whiteSpace;
  text.overflowWrap = 'normal';
  text.anchorX = p.anchorX;
  text.anchorY = p.anchorY;
  text.textAlign = p.textAlign;
}

/** Colors, opacity, outline: read by BatchedText every frame, never re-typeset. */
function applyPaint(member: Member, r: ResolvedTextLabel): void {
  const text = member.text;
  const [cr, cg, cb, ca] = r.color;
  member.color.setRGB(
    batchedColorChannel(cr),
    batchedColorChannel(cg),
    batchedColorChannel(cb),
    SRGBColorSpace,
  );
  text.fillOpacity = clampAlpha(ca);
  const o = r.outline;
  if (o) {
    const [or, og, ob, oa] = o.color;
    member.outlineColor.setRGB(
      batchedColorChannel(or),
      batchedColorChannel(og),
      batchedColorChannel(ob),
      SRGBColorSpace,
    );
    text.outlineWidth = Math.max(0, o.width);
    text.outlineOpacity = clampAlpha(oa);
    text.outlineBlur = Math.max(0, o.blur ?? 0);
    text.outlineOffsetX = o.offsetX ?? 0;
    text.outlineOffsetY = o.offsetY ?? 0;
  } else {
    text.outlineWidth = 0;
    text.outlineBlur = 0;
    text.outlineOffsetX = 0;
    text.outlineOffsetY = 0;
  }
}

/** Create a {@link TextPrimitive} and apply initial data. */
export function createTextPrimitive(
  context: PrimitiveContext,
  data: Partial<TextData> = {},
  options: TextPrimitiveOptions = {},
): TextPrimitive {
  const primitive = new TextPrimitive(context, options);
  primitive.update(data);
  return primitive;
}
