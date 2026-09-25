/**
 * Scatter-plot-matrix markers (plan E10.9, E16.3): many marker draws over the same points, each
 * pairing two shared columns as x and y.
 *
 * A splom of `d` dimensions draws up to `d²` cells, each a scatter of one dimension against
 * another. Uploading an x/y buffer per cell would cost `d²` uploads of `n` points; here every
 * dimension is **one** float32 column buffer (RTC-encoded against its own origin, E16.4), uploaded
 * once, and every cell is an instanced draw whose geometry references two of those columns as its
 * `aX` / `aY` attributes. Per-point style (size, fill or colorscale value, line, symbol / opacity /
 * angle) is the same in every cell, so it is uploaded once too and shared: restyling or selecting
 * points (opacity) updates one set of buffers for the whole matrix.
 *
 * - {@link MarkerMatrix} owns the columns and the shared style. The style lives in an internal
 *   {@link MarkerSet} that is never drawn (it only keeps the style attributes, color mode, colorscale
 *   texture and shader specialization in sync, exactly as for scatter markers).
 * - {@link MarkerMatrixCell} is one draw: a primitive to add to the cell's (scissored) viewport,
 *   with its own transform and viewport uniforms. Its shader is the marker shader with `aPos`
 *   assembled from `aX` / `aY`, so it renders exactly like a `MarkerSet`.
 *
 * GPU buffers are shared between geometries, so disposal is careful: a cell's geometry is released
 * without its shared attributes while another drawn cell still uses them; the last drawn cell
 * frees them (a later cell uploads them again).
 */
import {
  BufferAttribute,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  ShaderMaterial,
  StaticDrawUsage,
  Vector2,
  Vector3,
  type IUniform,
} from 'three';
import { syncViewportUniforms } from '../primitives/common.ts';
import { HIDDEN_POSITION, rtcAxisOrigin, rtcOffset } from '../precision.ts';
import {
  IDENTITY_TRANSFORM,
  type DataTransform,
  type Primitive,
  type PrimitiveContext,
  type ViewportSize,
} from '../types.ts';
import { MARKER_FRAGMENT, MARKER_VERTEX } from './markers.glsl.ts';
import { MarkerSet, type MarkerData, type MarkerSetOptions } from './markers.ts';

/** Per-point style shared by every cell (everything of {@link MarkerData} but positions). */
export type MarkerMatrixStyle = Omit<MarkerData, 'x' | 'y' | 'z' | 'origin'>;

/** Style attributes the cells read from the shared style set. */
const STYLE_ATTRIBUTES = ['aSize', 'aFill', 'aValue', 'aLine', 'aStyle'] as const;

/** The marker vertex shader reading `aX` / `aY` columns instead of an interleaved `aPos`. */
export const MARKER_MATRIX_VERTEX: string = (() => {
  const decl = /^in vec3 aPos;.*$/m;
  if (!decl.test(MARKER_VERTEX)) throw new Error('marker shader: aPos declaration not found');
  return MARKER_VERTEX.replace(
    decl,
    'in float aX;       // RTC-encoded column values (HIDDEN sentinel for gaps)\nin float aY;\n#define aPos vec3(aX, aY, 0.0)',
  );
})();

interface Column {
  attribute: InstancedBufferAttribute;
  origin: number;
}

/**
 * The shared columns and style of a scatter plot matrix. Create cells with {@link createCell}; add
 * each to its viewport. Disposing the matrix disposes its remaining cells.
 */
export class MarkerMatrix {
  readonly #context: PrimitiveContext;
  readonly #options: MarkerSetOptions;
  /** Never drawn: holds the shared style attributes, color mode and specialization defines. */
  readonly #style: MarkerSet;
  #columns: Column[] = [];
  #count = 0;
  #uploads = 0;
  readonly #cells = new Set<MarkerMatrixCell>();
  #disposed = false;

  constructor(
    context: PrimitiveContext,
    columns: readonly ArrayLike<number>[] = [],
    style: Partial<MarkerMatrixStyle> = {},
    options: MarkerSetOptions = {},
  ) {
    this.#context = context;
    this.#options = options;
    this.#style = new MarkerSet(context, {}, options);
    this.setColumns(columns);
    this.update(style);
  }

  /** Points per column (the shortest column's length). */
  get count(): number {
    return this.#count;
  }

  get columnCount(): number {
    return this.#columns.length;
  }

  /** Column buffers written so far (one per column per data change): for tests and debugging. */
  get columnUploads(): number {
    return this.#uploads;
  }

  /** Live cells. */
  get cells(): ReadonlySet<MarkerMatrixCell> {
    return this.#cells;
  }

  /** Whether fill colors come from the colorscale (see {@link MarkerSet.colorscaleMode}). */
  get colorscaleMode(): boolean {
    return this.#style.colorscaleMode;
  }

  /** The shared attribute of column `i` and its float64 RTC origin. */
  column(i: number): { readonly attribute: InstancedBufferAttribute; readonly origin: number } {
    const c = this.#columns[i];
    if (!c) throw new RangeError(`no column ${i} (of ${this.#columns.length})`);
    return c;
  }

  /**
   * Replace every column (data space, float64 recommended): each is encoded and uploaded once,
   * whatever the number of cells using it. The point count is the shortest column's length.
   */
  setColumns(columns: readonly ArrayLike<number>[]): void {
    this.#assertAlive();
    const count = columns.length === 0 ? 0 : Math.min(...columns.map((c) => c.length));
    const next: Column[] = [];
    columns.forEach((values, i) => {
      const old = this.#columns[i];
      const origin = rtcAxisOrigin(values, count);
      let attribute = old?.attribute;
      if (!attribute || attribute.count !== Math.max(1, count)) {
        attribute = new InstancedBufferAttribute(new Float32Array(Math.max(1, count)), 1);
        attribute.setUsage(StaticDrawUsage);
      }
      const out = attribute.array as Float32Array;
      for (let k = 0; k < count; k++) {
        const v = values[k]!;
        out[k] = Number.isFinite(v) ? v - origin : HIDDEN_POSITION;
      }
      attribute.needsUpdate = true;
      this.#uploads++;
      next.push({ attribute, origin });
    });
    this.#columns = next;
    this.#count = count;
    // The style set only needs the point count from positions (it is never drawn).
    const first = columns[0] ?? new Float64Array(0);
    this.#style.update({ x: first, y: first });
    this.#relink();
  }

  /** Update the shared per-point style (like {@link MarkerSet.update} without positions). */
  update(style: Partial<MarkerMatrixStyle>): void {
    this.#assertAlive();
    const data = { ...style } as Partial<MarkerData>;
    delete data.x;
    delete data.y;
    delete data.z;
    delete data.origin;
    this.#style.update(data);
    this.#relink();
  }

  /** A draw of column `x` against column `y`: add it to its viewport (it is a primitive). */
  createCell(x: number, y: number, options: { renderOrder?: number } = {}): MarkerMatrixCell {
    this.#assertAlive();
    const cell = new MarkerMatrixCell(this, this.#internals, x, y, options);
    this.#cells.add(cell);
    return cell;
  }

  /** Dispose every cell, the columns and the shared style. */
  dispose(): void {
    if (this.#disposed) return;
    for (const cell of [...this.#cells]) cell.dispose();
    this.#disposed = true;
    this.#style.dispose();
    this.#columns = [];
  }

  // ---- internals shared with cells -------------------------------------------------------------

  readonly #internals: MatrixInternals = {
    style: () => this.#style,
    columns: () => this.#columns,
    count: () => this.#count,
    options: () => this.#options,
    context: () => this.#context,
    liveAttributes: () => this.#liveAttributes(),
    removeCell: (cell) => {
      this.#cells.delete(cell);
    },
    otherDrawnCell: (cell) => [...this.#cells].some((c) => c !== cell && c.drawn),
  };

  #liveAttributes(): Set<BufferAttribute> {
    const live = new Set<BufferAttribute>();
    const g = this.#style.geometry;
    for (const name of Object.keys(g.attributes)) live.add(g.getAttribute(name) as BufferAttribute);
    const index = g.getIndex();
    if (index) live.add(index);
    for (const c of this.#columns) live.add(c.attribute);
    return live;
  }

  /**
   * Point every cell at the current buffers. Attributes that went out of use (a reallocated column
   * or style buffer) stay attached to the old geometries the cells release, which frees them.
   */
  #relink(): void {
    for (const cell of this.#cells) cell.relink();
  }

  #assertAlive(): void {
    if (this.#disposed) throw new Error('MarkerMatrix has been disposed');
  }
}

/** What a cell needs from its matrix (kept off the public API). */
interface MatrixInternals {
  style(): MarkerSet;
  columns(): readonly Column[];
  count(): number;
  options(): MarkerSetOptions;
  context(): PrimitiveContext;
  liveAttributes(): Set<BufferAttribute>;
  removeCell(cell: MarkerMatrixCell): void;
  otherDrawnCell(cell: MarkerMatrixCell): boolean;
}

interface CellUniforms {
  [name: string]: IUniform;
  uScale: IUniform<Vector3>;
  uOffset: IUniform<Vector3>;
  uResolution: IUniform<Vector2>;
  uPixelRatio: IUniform<number>;
}

/** Column indices of a cell (the data of its {@link Primitive.update}). */
export interface MarkerMatrixCellData {
  /** Column drawn along x. */
  x: number;
  /** Column drawn along y. */
  y: number;
}

/** One cell of a {@link MarkerMatrix}: an instanced draw of two shared columns. */
export class MarkerMatrixCell implements Primitive<MarkerMatrixCellData> {
  readonly object: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly material: ShaderMaterial;
  readonly matrix: MarkerMatrix;
  readonly #m: MatrixInternals;
  readonly #uniforms: CellUniforms;
  #x: number;
  #y: number;
  #transform: DataTransform = { ...IDENTITY_TRANSFORM };
  #drawn = false;
  #disposed = false;

  /** @internal Use {@link MarkerMatrix.createCell}. */
  constructor(
    matrix: MarkerMatrix,
    internals: MatrixInternals,
    x: number,
    y: number,
    options: { renderOrder?: number },
  ) {
    this.matrix = matrix;
    this.#m = internals;
    this.#x = x;
    this.#y = y;
    const style = internals.style();
    const shared = style.material.uniforms;
    this.#uniforms = {
      // Style uniforms are the style set's own objects, so its updates reach every cell.
      ...shared,
      uScale: { value: new Vector3(1, 1, 1) },
      uOffset: { value: new Vector3() },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: 1 },
    };
    const setOptions = internals.options();
    this.material = new ShaderMaterial({
      name: 'holochart:markers:matrix',
      glslVersion: GLSL3,
      vertexShader: MARKER_MATRIX_VERTEX,
      fragmentShader: MARKER_FRAGMENT,
      uniforms: this.#uniforms,
      transparent: true,
      blending: NormalBlending,
      depthTest: setOptions.depthTest ?? true,
      depthWrite: setOptions.depthWrite ?? false,
      defines: { ...(style.material.defines as Record<string, string>) },
    });
    this.object = new Mesh(this.#build(), this.material);
    this.object.name = 'holochart:markers:matrix';
    this.object.frustumCulled = false;
    this.object.onBeforeRender = (renderer) => {
      this.#drawn = true;
      syncViewportUniforms(this.#uniforms, renderer);
      this.#syncDefines();
    };
    const order = options.renderOrder ?? setOptions.renderOrder;
    if (order !== undefined) this.object.renderOrder = order;
    this.#applyTransform();
  }

  /** Columns drawn along x and y. */
  get columns(): Readonly<MarkerMatrixCellData> {
    return { x: this.#x, y: this.#y };
  }

  /** Whether the cell has been rendered at least once (it then holds GPU buffers). */
  get drawn(): boolean {
    return this.#drawn;
  }

  get geometry(): InstancedBufferGeometry {
    return this.object.geometry;
  }

  /** Point the cell at other columns. */
  update(data: Partial<MarkerMatrixCellData>): void {
    this.#assertAlive();
    if (data.x !== undefined) this.#x = data.x;
    if (data.y !== undefined) this.#y = data.y;
    this.relink();
    this.#applyTransform();
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.#applyTransform();
    this.#m.context().invalidate();
  }

  setViewport(size: ViewportSize): void {
    this.#uniforms.uResolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
    this.#uniforms.uPixelRatio.value = size.pixelRatio > 0 ? size.pixelRatio : 1;
  }

  /** @internal Re-reference the matrix' current buffers (after a column or style reallocation). */
  relink(): void {
    if (this.#disposed) return;
    this.#syncDefines();
    const old = this.object.geometry;
    const next = this.#build();
    if (sameAttributes(old, next)) {
      old.instanceCount = next.instanceCount;
      return;
    }
    this.object.geometry = next;
    this.#release(old, true);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.object.removeFromParent();
    // Free the shared buffers with the last drawn cell (a cell never drawn holds none).
    this.#release(this.object.geometry, this.#m.otherDrawnCell(this));
    this.material.dispose();
    this.#m.removeCell(this);
  }

  #build(): InstancedBufferGeometry {
    const src = this.#m.style().geometry;
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', src.getAttribute('position'));
    g.setIndex(src.getIndex());
    for (const name of STYLE_ATTRIBUTES) {
      const a = src.getAttribute(name) as BufferAttribute | undefined;
      if (a) g.setAttribute(name, a);
    }
    const columns = this.#m.columns();
    const x = columns[this.#x];
    const y = columns[this.#y];
    if (x && y) {
      g.setAttribute('aX', x.attribute);
      g.setAttribute('aY', y.attribute);
      g.instanceCount = this.#m.count();
    } else {
      // A missing column draws nothing (the attributes still need to exist for the program).
      const empty = columns[0]?.attribute ?? new InstancedBufferAttribute(new Float32Array(1), 1);
      g.setAttribute('aX', empty);
      g.setAttribute('aY', empty);
      g.instanceCount = 0;
    }
    return g;
  }

  /**
   * Dispose a geometry this cell no longer uses. With `keepShared`, attributes still in use by the
   * matrix are detached first so disposing it does not free their GPU buffers (retired ones are
   * freed).
   */
  #release(geometry: InstancedBufferGeometry, keepShared: boolean): void {
    if (keepShared) {
      const live = this.#m.liveAttributes();
      for (const name of Object.keys(geometry.attributes)) {
        const a = geometry.getAttribute(name) as BufferAttribute;
        if (live.has(a)) geometry.deleteAttribute(name);
      }
      const index = geometry.getIndex();
      if (index && live.has(index)) geometry.setIndex(null);
    }
    geometry.dispose();
  }

  #syncDefines(): void {
    const source = this.#m.style().material.defines as Record<string, string>;
    const defines = this.material.defines as Record<string, string>;
    let changed = false;
    for (const name of Object.keys(defines)) {
      if (!(name in source)) {
        delete defines[name];
        changed = true;
      }
    }
    for (const [name, value] of Object.entries(source)) {
      if (defines[name] === value) continue;
      defines[name] = value;
      changed = true;
    }
    if (changed) this.material.needsUpdate = true;
  }

  #applyTransform(): void {
    const t = this.#transform;
    const columns = this.#m.columns();
    const ox = columns[this.#x]?.origin ?? 0;
    const oy = columns[this.#y]?.origin ?? 0;
    this.#uniforms.uScale.value.set(t.scaleX, t.scaleY, 1);
    this.#uniforms.uOffset.value.set(
      rtcOffset(t.offsetX, ox, t.scaleX),
      rtcOffset(t.offsetY, oy, t.scaleY),
      0,
    );
  }

  #assertAlive(): void {
    if (this.#disposed) throw new Error('MarkerMatrixCell has been disposed');
  }
}

function sameAttributes(a: InstancedBufferGeometry, b: InstancedBufferGeometry): boolean {
  if (a.getIndex() !== b.getIndex()) return false;
  const names = Object.keys(b.attributes);
  if (Object.keys(a.attributes).length !== names.length) return false;
  return names.every((n) => a.getAttribute(n) === b.getAttribute(n));
}

/** Create a scatter-plot-matrix marker store (plan E10.9); see {@link MarkerMatrix}. */
export function createMarkerMatrix(
  context: PrimitiveContext,
  columns: readonly ArrayLike<number>[] = [],
  style: Partial<MarkerMatrixStyle> = {},
  options: MarkerSetOptions = {},
): MarkerMatrix {
  return new MarkerMatrix(context, columns, style, options);
}
