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
 * Families resolve to font files through `registerFont` / `fonts.register` (text-fonts.ts).
 * Unregistered families use the app's `configureText({ defaultFontURL })` if set, else the built-in
 * default font (TeX Gyre Heros, shipped with the library): the face matching each label's weight
 * and style is loaded the first time a label needs it, and the primitive typesets only once the
 * faces its labels need have loaded ({@link TextPrimitive.ready} covers that too), so troika never
 * falls back to its CDN font for a whole label.
 *
 * Plotly's paint-level font attributes (E8.3): `textcase` and `variant` change the typeset text and
 * size (text-style.ts; small caps are approximated), `shadow` becomes the outline pass unless the
 * label has an explicit `outline`, and `lineposition` draws underlines/overlines/line-throughs as
 * one extra instanced draw call for the whole primitive (text-decoration.ts), created only once a
 * label is decorated. That module is loaded on demand like the engine (few charts underline text,
 * and it would otherwise add to every page's initial chunk).
 *
 * ## Rich text (E2.10)
 *
 * A label with `runs` (lines of styled runs, e.g. from core's `richTextLines`) is drawn as one
 * member per non-blank run, typeset with its origin on its baseline and placed relative to the
 * label anchor by text-runs.ts (measured with the metrics oracle, per face), rotating with the
 * label. Members stay pooled and keyed like plain labels, and each run's face (bold, italic) is
 * loaded only when some run uses it. Plain labels keep the single-member path unchanged.
 *
 * ## Lazy engine (plan E21.5)
 *
 * troika is loaded on demand (text-engine.ts): a primitive loads it when it first gets labels, so
 * charts without text never fetch it. Until it arrives, labels are only stored; `object` is a plain
 * `Object3D` root that the `BatchedText` joins on load (it forwards `renderOrder` to the batch, so
 * sorting is unchanged). {@link TextPrimitive.ready} covers the load too. Once loaded, later
 * primitives attach synchronously. Layout does not wait: the metrics oracle is synchronous.
 */
import type { BatchedText, Text, TroikaTextBuilderConfig } from 'troika-three-text';
import {
  Color,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type WebGLRenderer,
} from 'three';
import type { DataTransform, Primitive, PrimitiveContext, ViewportSize } from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import { computeOrigin, effectiveTransform, type Vec3 } from './common.ts';
import {
  defaultFontFacesPending,
  loadDefaultFontFaces,
  resolveDrawnFontURL,
  setDefaultFontFaces,
  setDefaultFontURL,
  type FontFamilyFaces,
  type TextFontRequest,
  type TextFontStyle,
  type TextFontWeight,
} from './text-fonts.ts';
import {
  assignLabelSlots,
  batchedColorChannel,
  clampAlpha,
  computeLabelPlacement,
  labelFontRequests,
  resolveTextLabelMembers,
  TEXT_DEFAULT_FONT,
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
import type { TextDecorationLayer } from './text-decoration.ts';
import {
  configureTextEngine,
  loadTextEngine,
  loadedTextEngine,
  type TextEngine,
} from './text-engine.ts';

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
export { preloadTextEngine } from './text-engine.ts';
export type {
  TextLink,
  TextRun,
  TextRunBase,
  TextRunLayout,
  TextRunLayoutItem,
  TextLinkPointerEvent,
  TextRunLines,
} from './text-runs.ts';
export {
  fadeTextRuns,
  handleTextLinkPointer,
  layoutTextRuns,
  openTextLink,
  scaleTextRuns,
  textLinkAt,
  textRunFont,
} from './text-runs.ts';

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
  /**
   * Family → font URL resolution. Default: the `registerFont` registry, else the built-in default
   * font ({@link resolveDrawnFontURL}), whose faces the primitive loads before typesetting. A custom
   * resolver loads nothing: `undefined` means troika's default font.
   */
  resolveFont?: FontURLResolver;
  /** Max idle troika members kept for reuse. Default 256. */
  poolSize?: number;
}

/** Global text-rendering configuration (wraps troika's `configureTextBuilder`). */
export interface TextConfig {
  /**
   * One font file (TTF/OTF/WOFF, not WOFF2) for every family that is not registered, at every
   * weight and style (troika never synthesizes bold or italic). Unset → the built-in default font,
   * TeX Gyre Heros, shipped with Holochart in four faces and loaded lazily. Also registered as a
   * CSS font face so layout measures unregistered families with this font (see `measurementFace`).
   */
  defaultFontURL?: string;
  /**
   * Self-hosted files for the built-in default font's faces, e.g. the OTF files shipped in
   * `@mk7s/holochart-render/fonts/` (with their license) served by the app: unregistered families
   * then draw from these URLs instead of the bundled `data:` chunks (ESM) or the files next to the
   * IIFE script, keeping bold and italic. Useful under a Content Security Policy without `data:`
   * or `blob:` sources, or to serve the fonts from a CDN. Ignored while `defaultFontURL` is set.
   */
  defaultFontFaces?: FontFamilyFaces;
  /**
   * Location of troika's unicode fallback-font data (default: CDN), used only for characters the
   * drawn font lacks (e.g. Cyrillic or CJK with the built-in default font).
   */
  unicodeFontsURL?: string;
  /** Typeset in a web worker (default true). Disable under CSPs that forbid blob workers. */
  useWorker?: boolean;
  /** SDF glyph resolution, a power of two (default 64). */
  sdfGlyphSize?: number;
}

/**
 * Configure text rendering globally. Must run before the first label is typeset (troika ignores
 * later calls and warns). Does not load the text engine: before it has loaded, the configuration is
 * kept and applied when it loads.
 */
export function configureText(config: TextConfig): void {
  const out: TroikaTextBuilderConfig = {};
  if (config.defaultFontURL !== undefined) out.defaultFontURL = config.defaultFontURL;
  if (config.unicodeFontsURL !== undefined) out.unicodeFontsURL = config.unicodeFontsURL;
  if (config.useWorker !== undefined) out.useWorker = config.useWorker;
  if (config.sdfGlyphSize !== undefined) out.sdfGlyphSize = config.sdfGlyphSize;
  configureTextEngine(out);
  // Tell the metrics oracle which files troika draws unregistered families with (E2.18).
  if (config.defaultFontURL !== undefined) setDefaultFontURL(config.defaultFontURL);
  if (config.defaultFontFaces !== undefined) setDefaultFontFaces(config.defaultFontFaces);
}

/**
 * Load a font and pre-generate glyph SDFs (e.g. digits for tick labels) so the first frame with
 * text does not stall. Resolves the family through the font registry, else the default font (no
 * family: the default font's face for the weight and style). Loads the text engine and the
 * default font face first if needed.
 */
export function preloadTextFont(options: {
  family?: string;
  weight?: TextFontWeight;
  style?: TextFontStyle;
  characters?: string | string[];
}): Promise<void> {
  const request: TextFontRequest = {
    family: options.family ?? TEXT_DEFAULT_FONT.family,
    weight: options.weight,
    style: options.style,
  };
  const characters = options.characters ?? ' ';
  const faces = loadDefaultFontFaces([request]) ?? Promise.resolve();
  return Promise.all([loadTextEngine(), faces]).then(
    ([engine]) =>
      new Promise((resolve) => {
        const font = resolveDrawnFontURL(request.family, request.weight, request.style) ?? null;
        engine.preloadFont({ font, characters }, () => resolve());
      }),
  );
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
 * update that re-typesets), including loading the text engine when the first labels arrive before
 * it has loaded, and the default font faces the labels need; visual tests and `chart.ready` await
 * it before capturing.
 */
export class TextPrimitive implements Primitive<TextData> {
  /**
   * Root to add to a scene: a plain `Object3D` holding the troika `BatchedText` once the text engine
   * has loaded. Its `renderOrder` is forwarded to the batch (a plain parent's order would not
   * affect its children's sorting, and a `Group`'s would sort them apart from sibling primitives).
   */
  readonly object: Object3D;

  private readonly context: PrimitiveContext;
  /** `null` until the text engine has loaded and labels exist (see {@link attachEngine}). */
  private batch: BatchedText | null = null;
  private engine: TextEngine | null = null;
  /** A text-engine load started by this primitive is in flight. */
  private attaching = false;
  /** Decoration lines (`font.lineposition`), created when a label is first decorated. */
  private decorations: TextDecorationLayer | null = null;
  /** The decoration module is being loaded for this primitive. */
  private loadingDecorations = false;
  private readonly baseMaterial: MeshBasicMaterial;
  private readonly metrics: FontMetricsOracle;
  private readonly resolveFont: FontURLResolver;
  /** The default resolver is in use: load the default font faces labels need before typesetting. */
  private readonly usesDefaultFont: boolean;
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
    this.resolveFont = options.resolveFont ?? resolveDrawnFontURL;
    this.usesDefaultFont = options.resolveFont === undefined;
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
    this.object = createTextRoot((order) => {
      if (this.batch) this.batch.renderOrder = order;
      if (this.decorations) this.decorations.mesh.renderOrder = order;
    });
    this.object.name = 'holochart:text';

    this.placement = {
      position: new Vector3(),
      quaternion: new Quaternion(),
      scale: new Vector3(1, 1, 1),
    };
  }

  /**
   * Resolves when all typesetting requested so far has completed and been packed, including
   * loading the text engine first if labels arrived before it had loaded, and the default font
   * faces the labels are drawn with.
   */
  get ready(): Promise<void> {
    return this.pending;
  }

  /** Same as {@link ready}, as a method. */
  whenReady(): Promise<void> {
    return this.pending;
  }

  /** Number of decoration lines drawn (`font.lineposition`), for debugging and tests. */
  get decorationCount(): number {
    return this.decorations?.instanceCount ?? 0;
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

    const batch = this.batch;
    if (!batch) {
      // Nothing is drawn before the engine is attached: keep the data, which install() applies in
      // full. No labels yet → don't load troika at all (charts without text never fetch it).
      if (next.labels.length > 0) this.attachEngine();
      return;
    }

    let needsSync = false;
    if (patch.labels !== undefined || patch.style !== undefined) {
      const fonts = this.missingFonts(next, true);
      if (fonts) {
        // A label needs a default font face that is still loading: keep drawing the previous
        // labels, and typeset the current ones once it has arrived.
        this.track(fonts.then(() => this.syncWhenFontsReady(batch)));
      } else {
        needsSync = this.syncLabels(batch, next);
        this.updatePositions();
      }
    }
    if (next.mode !== prev.mode || next.sizing !== prev.sizing) this.placementDirty = true;
    // Per-frame modes may place labels anywhere; bounds-based culling would lag a frame behind.
    batch.frustumCulled = !this.perFrame();
    this.applyStaticPlacement();

    if (patch.labels !== undefined || patch.style !== undefined || next.sizing !== prev.sizing) {
      this.updateDecorations(batch);
    }
    if (needsSync) this.startSync(batch);
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
    const batch = this.batch;
    for (const m of this.members) {
      batch?.removeText(m.text);
      m.text.dispose();
    }
    for (const m of this.pool) m.text.dispose();
    this.members = [];
    this.pool = [];
    if (batch) {
      this.object.remove(batch);
      batch.dispose();
    }
    this.decorations?.dispose();
    this.decorations = null;
    // Disposing the base material also disposes troika's derived (and outline) materials.
    this.baseMaterial.dispose();
  }

  /**
   * Make sure the text engine is attached: synchronously when it has already loaded (every
   * primitive after the first), else load it and attach on arrival. `pending` covers the load and
   * the typesetting that follows, so `ready` stays the single "labels are drawn" signal.
   */
  private attachEngine(): void {
    if (this.attaching) return;
    const loaded = loadedTextEngine();
    if (loaded) {
      this.install(loaded);
      return;
    }
    this.attaching = true;
    // Fetch the default font faces the labels need in parallel with the engine (install() waits).
    void this.missingFonts(this.data, true);
    const installed = loadTextEngine().then(
      (engine) => {
        this.attaching = false;
        return this.disposed ? undefined : this.install(engine);
      },
      (error: unknown) => {
        // Resolve `ready` anyway (the labels just stay undrawn) so charts and tests don't hang; the
        // next update with labels retries the load.
        this.attaching = false;
        reportEngineError(error);
      },
    );
    this.track(installed);
  }

  /** Make {@link ready} wait for `work` too. */
  private track(work: Promise<unknown>): void {
    this.pending = Promise.all([this.pending, work]).then(() => undefined);
  }

  /**
   * The default font faces the labels are drawn with that have not loaded yet: a promise for their
   * load (started here), or `null` when every label can be typeset now. Only labels with text
   * count, so an empty label never loads a face. `retryFailed` retries faces that failed before
   * (a new update); follow-up checks don't, so a failing face can't loop.
   */
  private missingFonts(data: TextData, retryFailed: boolean): Promise<void> | null {
    if (!this.usesDefaultFont || !defaultFontFacesPending(retryFailed)) return null;
    const requests = new Map<string, TextFontRequest>();
    for (const label of data.labels) {
      for (const r of labelFontRequests(label, data.style)) {
        requests.set(`${r.style}|${r.weight}|${r.family}`, r);
      }
    }
    return requests.size > 0 ? loadDefaultFontFaces(requests.values(), { retryFailed }) : null;
  }

  /**
   * Typeset the current labels once the default font faces they need have loaded (again if more
   * are needed by then). Returns when the typesetting has finished.
   */
  private syncWhenFontsReady(batch: BatchedText): Promise<void> {
    if (this.disposed || this.batch !== batch) return Promise.resolve();
    const fonts = this.missingFonts(this.data, false);
    if (fonts) return fonts.then(() => this.syncWhenFontsReady(batch));
    const needsSync = this.syncLabels(batch, this.data);
    this.updatePositions();
    batch.frustumCulled = !this.perFrame();
    this.applyStaticPlacement();
    this.updateDecorations(batch);
    this.context.invalidate();
    return needsSync ? this.startSync(batch) : Promise.resolve();
  }

  /**
   * Create the batch and apply the current data to it: the queued labels are typeset now, or once
   * the default font faces they need have loaded. Returns the typesetting promise (resolved when
   * there is nothing to typeset).
   */
  private install(engine: TextEngine): Promise<void> {
    this.engine = engine;
    const batch = new engine.BatchedText();
    batch.material = this.baseMaterial;
    batch.name = 'holochart:text-batch';
    batch.visible = false;
    batch.renderOrder = this.object.renderOrder;
    const renderBatch = batch.onBeforeRender;
    batch.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      this.beforeRender(batch, renderer, camera);
      renderBatch.call(batch, renderer, scene, camera, geometry, material, group);
    };
    this.batch = batch;
    this.object.add(batch);
    return this.syncWhenFontsReady(batch);
  }

  /** Resolve labels, reuse/pool members, and apply layout + paint. Returns true if a sync is due. */
  private syncLabels(batch: BatchedText, data: TextData): boolean {
    const labels = data.labels;
    // One member per plain label, one per run of a rich label (E2.10).
    const resolved: ResolvedTextLabel[] = [];
    for (let i = 0; i < labels.length; i++) {
      resolveTextLabelMembers(labels[i]!, data.style, this.metrics, this.resolveFont, i, resolved);
    }
    const candidates = this.members.concat(this.pool);
    const { slot, resync } = assignLabelSlots(
      candidates.map((m) => m.key),
      resolved.map((r) => r.key),
    );

    let needsSync = false;
    const nextMembers: Member[] = new Array<Member>(resolved.length);
    for (let i = 0; i < resolved.length; i++) {
      const s = slot[i]!;
      const member = s >= 0 ? candidates[s]! : this.createMember(this.engine!);
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
        batch.addText(m.text);
        needsSync = true;
      }
    }
    const pool: Member[] = [];
    for (const m of candidates) {
      if (active.has(m)) continue;
      if (wasActive.has(m)) {
        batch.removeText(m.text);
        needsSync = true;
      }
      if (pool.length < this.poolSize) pool.push(m);
      else m.text.dispose();
    }

    this.members = nextMembers;
    this.pool = pool;
    this.resolved = resolved;
    batch.visible = nextMembers.length > 0;
    this.placementDirty = true;
    return needsSync;
  }

  private createMember(engine: TextEngine): Member {
    const text = new engine.Text();
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
      const w = r.owner * 3;
      tmpBase.set(world[w]!, world[w + 1]!, world[w + 2]!);
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
        computeLabelPlacement(
          placement,
          tmpBase,
          r.offsetX,
          r.offsetY,
          r.rotation,
          orientation,
          s,
          r.localX,
          r.localY,
        );
        text.position.copy(placement.position);
        text.quaternion.copy(placement.quaternion);
        text.scale.copy(placement.scale);
      }
      text.updateMatrix();
    }
    this.placeDecorations();
  }

  /**
   * Rebuild the decoration lines from the members' current typeset layout (`textRenderInfo`), then
   * place them. Runs after label changes (decorations may toggle without re-typesetting) and after
   * every typesetting. Members still typesetting keep their previous layout until then, like their
   * glyphs. The layer is only created once some label is decorated.
   */
  private updateDecorations(batch: BatchedText): void {
    const { members, resolved } = this;
    let layer = this.decorations;
    const mod = decorationModule;
    if (!layer || !mod) {
      if (!resolved.some((r) => r.decoration)) return;
      if (!mod) {
        this.loadDecorations(batch);
        return;
      }
      layer = new mod.TextDecorationLayer(this.context.resources);
      layer.mesh.renderOrder = this.object.renderOrder;
      // Keep up with per-frame placement even if the decorations render before the batch.
      layer.mesh.onBeforeRender = (renderer, _scene, camera) =>
        this.beforeRender(batch, renderer, camera);
      this.decorations = layer;
      this.object.add(layer.mesh);
    }
    const minThickness = this.data.sizing === 'screen' ? 1 : 0;
    const rects: number[] = [];
    layer.begin();
    for (let i = 0; i < members.length; i++) {
      const r = resolved[i]!;
      const info = members[i]!.text.textRenderInfo;
      if (!r.decoration || !r.visible || !info || !typesetFor(info, r)) continue;
      rects.length = 0;
      const fontSize = r.layout.fontSize;
      mod.computeDecorationRects(
        info,
        r.layout.text,
        r.decoration,
        {
          fontSize,
          lineAdvance: fontSize * r.layout.lineHeight,
          minThickness,
        },
        rects,
      );
      layer.add(i, rects, r.color);
    }
    layer.end();
    layer.mesh.visible = layer.instanceCount > 0 && members.length > 0;
    this.placeDecorations();
  }

  /** Load the decoration module, then draw the decorations; `ready` waits for it. */
  private loadDecorations(batch: BatchedText): void {
    if (this.loadingDecorations) return;
    this.loadingDecorations = true;
    const loaded = loadDecorationModule().then(
      () => {
        this.loadingDecorations = false;
        if (this.disposed) return;
        this.updateDecorations(batch);
        this.context.invalidate();
      },
      (error: unknown) => {
        // Labels still draw; only their lines are missing. A later update retries.
        this.loadingDecorations = false;
        console.error('[holochart] could not load text decorations:', error);
      },
    );
    this.pending = Promise.all([this.pending, loaded]).then(() => undefined);
  }

  /** Copy member matrices into the decoration layer (after every member placement). */
  private placeDecorations(): void {
    const layer = this.decorations;
    if (!layer || layer.instanceCount === 0) return;
    const members = this.members;
    layer.place((owner) => members[owner]?.text.matrix.elements ?? null);
  }

  /** Per-frame billboard / screen-size placement (called for each material pass). */
  private beforeRender(batch: BatchedText, renderer: WebGLRenderer, camera: Camera): void {
    if (!this.perFrame() || this.members.length === 0) return;
    const frame = renderer.info.render.frame;
    if (frame === this.lastFrame && camera === this.lastCamera && !this.placementDirty) return;
    this.lastFrame = frame;
    this.lastCamera = camera;

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

  private startSync(batch: BatchedText): Promise<void> {
    const done = new Promise<void>((resolve) => batch.sync(resolve));
    void done.then(() => {
      if (this.disposed) return;
      // Typesetting finished: decorations follow the new glyph layout.
      if (this.decorations || this.resolved.some((r) => r.decoration)) {
        this.updateDecorations(batch);
      }
      this.context.invalidate();
    });
    this.pending = Promise.all([this.pending, done]).then(() => undefined);
    return done;
  }
}

/**
 * The primitive's scene root. `renderOrder` becomes an accessor that also sets the batch's order:
 * three sorts render items by their own `renderOrder` (a plain parent's is ignored), and callers
 * set it on `primitive.object` like on every other primitive.
 */
function createTextRoot(onRenderOrder: (order: number) => void): Object3D {
  const root = new Object3D();
  let order = root.renderOrder;
  Object.defineProperty(root, 'renderOrder', {
    configurable: true,
    enumerable: true,
    get: () => order,
    set: (value: number) => {
      order = value;
      onRenderOrder(value);
    },
  });
  return root;
}

type DecorationModule = typeof import('./text-decoration.ts');

let decorationModule: DecorationModule | null = null;
let decorationLoading: Promise<DecorationModule> | null = null;

/** Load text-decoration.ts once (shared by all primitives; a failed load is retried later). */
function loadDecorationModule(): Promise<DecorationModule> {
  decorationLoading ??= import('./text-decoration.ts').then(
    (mod) => (decorationModule = mod),
    (error: unknown) => {
      decorationLoading = null;
      throw error;
    },
  );
  return decorationLoading;
}

let engineErrorReported = false;

/** Report a failed text-engine load once (e.g. the lazy chunk could not be fetched). */
function reportEngineError(error: unknown): void {
  if (engineErrorReported) return;
  engineErrorReported = true;
  console.error('[holochart] could not load the SDF text engine (troika-three-text):', error);
}

/**
 * Whether a member's typeset layout belongs to its current label: while a re-typeset is in flight,
 * troika still holds the previous text's carets, which must not be decorated with the new text.
 * troika records the typeset request in `textRenderInfo.parameters` (not in our minimal typings);
 * when it is missing, the layout is trusted.
 */
function typesetFor(info: object, r: ResolvedTextLabel): boolean {
  const params = (info as { parameters?: { text?: unknown; fontSize?: unknown } }).parameters;
  if (!params) return true;
  const size = r.layout.fontSize > 0 ? r.layout.fontSize : 1e-6;
  return (
    params.text === r.layout.text &&
    (typeof params.fontSize !== 'number' || Math.abs(params.fontSize - size) <= size * 1e-6)
  );
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
