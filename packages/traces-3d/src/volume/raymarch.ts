/**
 * The ray-marched volume primitive (`volume` with `render: 'raymarch'`, a Holochart extension,
 * plan E14.7): the grid's values in a 3D texture, drawn by marching rays through the grid's box in
 * a fragment shader and compositing the transfer function front to back (`transfer.ts`).
 *
 * - **Geometry**: a unit cube (the box of the grid in normalized coordinates `L ∈ [0, 1]³`), its
 *   back faces drawn (so rays start even with the camera inside the box). The object's matrix maps
 *   `L` to scene units (float64 on the CPU, like the mesh primitive). Per fragment, the ray from
 *   the camera (perspective) or along the view direction (orthographic) is cut by the box, itself
 *   cut by the scene's axis ranges (`clip`).
 * - **Sampling**: steps of `step` grid cells (in index space, so rays through fine and coarse axes
 *   sample each cell alike), a per-pixel jitter of the start (a fixed hash of the pixel: no
 *   flicker, and images are deterministic) against wood-grain artifacts, early termination at 99 %
 *   opacity. Where a ray enters the drawn range (`isomin` / `isomax`, or the box), the entry is
 *   found by bisection (5 samples) and only the ray from there counts, so cuts are clean instead
 *   of noisy or stepped. Non-uniform grids map `L` to texture coordinates through a per-axis
 *   lookup table (1024 entries of the fractional grid index, interpolated), uniform grids
 *   directly.
 * - **Compositing**: the sample's value → the transfer table (color and one cell's opacity),
 *   opacity corrected for the step (`1 − (1 − a)^step`), accumulated front to back; samples
 *   outside `[isomin, isomax]` or missing are empty. The result is blended over the scene
 *   (straight alpha, no depth writes).
 * - **Shading** (`shading`): a headlight on the value gradient (central differences, 6 more
 *   samples), `min(1, ambient + diffuse · |N · V|)` with the trace's `lighting`.
 * - **Depth**: the box's back faces are depth tested, so opaque geometry in front of the volume
 *   hides it; opaque geometry *inside* the volume hides the whole ray behind it (the volume in
 *   front of it too): mixing both is approximate.
 */
import {
  fitsTexture,
  type DataTransform,
  type Primitive,
  type PrimitiveContext,
  type ViewportSize,
  type Vec3,
} from '@mk7s/holochart-render';
import {
  BackSide,
  BoxGeometry,
  Data3DTexture,
  DataTexture,
  FloatType,
  GLSL3,
  LinearFilter,
  Matrix4,
  Mesh,
  NearestFilter,
  NormalBlending,
  RedFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type IUniform,
} from 'three';
import { gridIndex, type IsoGrid } from '../isosurface/grid.ts';
import { buildTransferFunction, TRANSFER_SIZE, type TransferSpec } from './transfer.ts';

/** Entries of a non-uniform axis' lookup table. */
export const AXIS_TABLE_SIZE = 1024;

/** Most samples per ray. */
export const MAX_RAY_STEPS = 4096;

/** What {@link VolumeRayMarchPrimitive} draws. */
export interface RayMarchData {
  /** The grid (null or empty: nothing). */
  grid: IsoGrid | null;
  /** The transfer function (see `transfer.ts`); its domain is the texture's. */
  transfer: TransferSpec;
  /** The value range drawn. */
  isomin: number;
  isomax: number;
  /** Sample spacing, grid cells. */
  step: number;
  /** Gradient shading, and its `ambient` / `diffuse` coefficients. */
  shading: boolean;
  ambient: number;
  diffuse: number;
  /** Linear box outside which nothing is drawn (the scene's axis ranges), or null. */
  clip: { min: Vec3; max: Vec3 } | null;
}

/** The data of an empty volume. */
export function emptyRayMarchData(): RayMarchData {
  return {
    grid: null,
    transfer: { domain: [0, 1], mapping: null, opacity: 1, opacityscale: null },
    isomin: 0,
    isomax: 1,
    step: 0.5,
    shading: false,
    ambient: 0.8,
    diffuse: 0.8,
    clip: null,
  };
}

/**
 * The grid's values as texture bytes, x fastest, every axis ascending (see `transfer.ts` for the
 * packing).
 */
export function packVolume(grid: IsoGrid, domain: readonly [number, number]): Uint8Array {
  const nx = grid.xs.length;
  const ny = grid.ys.length;
  const nz = grid.zs.length;
  const out = new Uint8Array(nx * ny * nz);
  const [dx, dy, dz] = grid.descending;
  const values = grid.value;
  const lo = domain[0];
  const span = domain[1] - domain[0];
  const scale = span > 0 ? 254 / span : 0;
  let o = 0;
  for (let k = 0; k < nz; k++) {
    const kk = dz ? nz - 1 - k : k;
    for (let j = 0; j < ny; j++) {
      const jj = dy ? ny - 1 - j : j;
      const row = gridIndex(grid, 0, jj, kk);
      const si = grid.strides[0];
      for (let i = 0; i < nx; i++) {
        const ii = dx ? nx - 1 - i : i;
        const v = values[row + ii * si]!;
        out[o++] =
          v === v
            ? scale > 0
              ? 1 + Math.round(Math.min(254, Math.max(0, (v - lo) * scale)))
              : 128
            : 0;
      }
    }
  }
  return out;
}

/** Whether axis values are evenly spaced (to 1e-6 of their span). */
export function isUniformAxis(values: Float64Array): boolean {
  const n = values.length;
  if (n < 3) return true;
  const span = values[n - 1]! - values[0]!;
  const d = span / (n - 1);
  for (let i = 1; i < n - 1; i++) {
    if (Math.abs(values[i]! - (values[0]! + i * d)) > 1e-6 * Math.abs(span)) return false;
  }
  return true;
}

/**
 * The lookup table of an axis: at {@link AXIS_TABLE_SIZE} evenly spaced positions of its box
 * (normalized 0–1), the fractional grid index there, normalized by `n − 1`.
 */
export function axisTable(values: Float64Array, out: Float32Array, offset = 0): Float32Array {
  const n = values.length;
  const lo = values[0]!;
  const span = values[n - 1]! - lo;
  let seg = 0;
  for (let e = 0; e < AXIS_TABLE_SIZE; e++) {
    const v = lo + (e / (AXIS_TABLE_SIZE - 1)) * span;
    while (seg < n - 2 && values[seg + 1]! < v) seg++;
    const a = values[seg]!;
    const b = values[seg + 1] ?? a;
    const f = b > a ? Math.min(1, Math.max(0, (v - a) / (b - a))) : 0;
    out[offset + e] = n > 1 ? (seg + f) / (n - 1) : 0;
  }
  return out;
}

const VERTEX_SHADER = /* glsl */ `
out vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The ray-march fragment stage (see the module comment). Sample k, at `tNear + (k + jitter) · dt`,
 * stands for the ray from halfway after the previous sample to halfway to the next; where the ray
 * enters the drawn range (`hcInRange`: present and in `[isomin, isomax]`) or the box, the entry is
 * found by bisection and only the ray from there counts.
 */
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform sampler2D uTransfer;
uniform sampler2D uAxes;
uniform vec3 uCamera;
uniform vec3 uViewDir;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uCells;
uniform vec3 uSize;
uniform vec2 uIso;
uniform float uStep;
uniform vec2 uShade;
uniform vec3 uWorldScale;
in vec3 vLocal;
out highp vec4 fragColor;

#ifdef HC_NONUNIFORM
float hcAxis(float p, int row) {
  float f = clamp(p, 0.0, 1.0) * ${AXIS_TABLE_SIZE - 1}.0;
  int i0 = int(floor(f));
  int i1 = min(i0 + 1, ${AXIS_TABLE_SIZE - 1});
  float a = texelFetch(uAxes, ivec2(i0, row), 0).r;
  float b = texelFetch(uAxes, ivec2(i1, row), 0).r;
  return mix(a, b, f - float(i0));
}
#endif

vec3 hcTex(vec3 p) {
#ifdef HC_NONUNIFORM
  vec3 u = vec3(hcAxis(p.x, 0), hcAxis(p.y, 1), hcAxis(p.z, 2));
#else
  vec3 u = clamp(p, 0.0, 1.0);
#endif
  return (u * uCells + 0.5) / uSize;
}

float hcSample(vec3 p) {
  return texture(uVolume, hcTex(p)).r * 255.0;
}

bool hcInRange(vec3 p, out float v) {
  float s = hcSample(p);
  v = (s - 1.0) / 254.0;
  return s >= 0.5 && v >= uIso.x && v <= uIso.y;
}

void main() {
  vec3 ro;
  vec3 rd;
  if (isOrthographic) {
    rd = normalize(uViewDir);
    ro = vLocal;
  } else {
    ro = uCamera;
    rd = normalize(vLocal - uCamera);
  }
  vec3 inv = 1.0 / rd;
  vec3 ta = (uBoxMin - ro) * inv;
  vec3 tb = (uBoxMax - ro) * inv;
  vec3 tlo = min(ta, tb);
  vec3 thi = max(ta, tb);
  float tNear = max(max(tlo.x, tlo.y), tlo.z);
  float tFar = min(min(thi.x, thi.y), thi.z);
  if (!isOrthographic) tNear = max(tNear, 0.0);
  if (!(tFar > tNear)) discard;
  float dt = uStep / max(length(rd * uCells), 1e-6);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = tNear + jitter * dt;
  float tPrev = tNear;
  bool prevIn = false;
  vec4 acc = vec4(0.0);
  for (int n = 0; n < HC_MAX_STEPS; n++) {
    if (t > tFar || acc.a >= 0.99) break;
    vec3 p = ro + rd * t;
    float v;
    bool inside = hcInRange(p, v);
    if (inside) {
      float start = t - 0.5 * dt;
      if (!prevIn) {
        float a0 = tPrev;
        float b0 = t;
        float w;
        if (hcInRange(ro + rd * a0, w)) b0 = a0;
        else {
          for (int b = 0; b < 5; b++) {
            float m = 0.5 * (a0 + b0);
            if (hcInRange(ro + rd * m, w)) b0 = m;
            else a0 = m;
          }
        }
        start = b0;
      }
      float f = (min(t + 0.5 * dt, tFar) - start) / dt;
      vec4 c = texture(uTransfer, vec2((v * ${TRANSFER_SIZE - 1}.0 + 0.5) / ${TRANSFER_SIZE}.0, 0.5));
      float a = 1.0 - pow(max(1.0 - c.a, 0.0), uStep * max(f, 0.0));
      if (a > 0.0) {
        vec3 rgb = c.rgb;
#ifdef HC_SHADE
        vec3 e = 1.0 / uCells;
        vec3 g = vec3(
          hcSample(p + vec3(e.x, 0.0, 0.0)) - hcSample(p - vec3(e.x, 0.0, 0.0)),
          hcSample(p + vec3(0.0, e.y, 0.0)) - hcSample(p - vec3(0.0, e.y, 0.0)),
          hcSample(p + vec3(0.0, 0.0, e.z)) - hcSample(p - vec3(0.0, 0.0, e.z))
        ) * uCells / uWorldScale;
        float lambert = dot(g, g) > 0.0
          ? abs(dot(normalize(g), normalize(rd * uWorldScale)))
          : 1.0;
        rgb *= min(1.0, uShade.x + uShade.y * lambert);
#endif
        acc.rgb += (1.0 - acc.a) * a * rgb;
        acc.a += (1.0 - acc.a) * a;
      }
    }
    prevIn = inside;
    tPrev = t;
    t += dt;
  }
  if (acc.a <= 0.0) discard;
  fragColor = vec4(acc.rgb / acc.a, acc.a);
}
`;

interface RayMarchUniforms {
  [name: string]: IUniform;
  uVolume: IUniform<Data3DTexture | null>;
  uTransfer: IUniform<DataTexture | null>;
  uAxes: IUniform<DataTexture | null>;
  uCamera: IUniform<Vector3>;
  uViewDir: IUniform<Vector3>;
  uBoxMin: IUniform<Vector3>;
  uBoxMax: IUniform<Vector3>;
  uCells: IUniform<Vector3>;
  uSize: IUniform<Vector3>;
  uIso: IUniform<Vector2>;
  uStep: IUniform<number>;
  uShade: IUniform<Vector2>;
  uWorldScale: IUniform<Vector3>;
}

const inverse = new Matrix4();
const tmp = new Vector3();

/** See the module comment. */
export class VolumeRayMarchPrimitive implements Primitive<RayMarchData> {
  readonly object: Mesh;
  readonly #context: PrimitiveContext;
  #d: RayMarchData = emptyRayMarchData();
  readonly #uniforms: RayMarchUniforms;
  readonly #material: ShaderMaterial;
  #volume: Data3DTexture | null = null;
  /** The grid and domain the volume texture holds. */
  #packed: { grid: IsoGrid; domain: readonly [number, number] } | null = null;
  readonly #transfer: DataTexture;
  #axes: DataTexture | null = null;
  #transform: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

  constructor(context: PrimitiveContext, data?: Partial<RayMarchData>) {
    this.#context = context;
    this.#transfer = new DataTexture(new Uint8Array(TRANSFER_SIZE * 4), TRANSFER_SIZE, 1);
    this.#transfer.magFilter = LinearFilter;
    this.#transfer.minFilter = LinearFilter;
    this.#uniforms = {
      uVolume: { value: null },
      uTransfer: { value: this.#transfer },
      uAxes: { value: null },
      uCamera: { value: new Vector3() },
      uViewDir: { value: new Vector3(0, 0, -1) },
      uBoxMin: { value: new Vector3(0, 0, 0) },
      uBoxMax: { value: new Vector3(1, 1, 1) },
      uCells: { value: new Vector3(1, 1, 1) },
      uSize: { value: new Vector3(2, 2, 2) },
      uIso: { value: new Vector2(0, 1) },
      uStep: { value: 1 },
      uShade: { value: new Vector2(0.8, 0.8) },
      uWorldScale: { value: new Vector3(1, 1, 1) },
    };
    this.#material = new ShaderMaterial({
      name: 'holochart:volume',
      glslVersion: GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: this.#uniforms,
      defines: { HC_MAX_STEPS: 2 },
      blending: NormalBlending,
      transparent: true,
      depthWrite: false,
      side: BackSide,
    });
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.translate(0.5, 0.5, 0.5);
    this.object = new Mesh(geometry, this.#material);
    this.object.name = 'holochart:volume';
    this.object.visible = false;
    this.object.onBeforeRender = (_renderer, _scene, camera) => this.#beforeRender(camera);
    if (data) this.update(data);
  }

  /** The drawn data. */
  get data(): Readonly<RayMarchData> {
    return this.#d;
  }

  /** The material's defines (for tests): `HC_MAX_STEPS`, `HC_NONUNIFORM`, `HC_SHADE`. */
  get defines(): Readonly<Record<string, unknown>> {
    return this.#material.defines as Record<string, unknown>;
  }

  /** The transfer table as uploaded (for tests). */
  get transferTable(): Uint8Array {
    return this.#transfer.image.data as Uint8Array;
  }

  update(patch: Partial<RayMarchData>): void {
    this.#d = { ...this.#d, ...patch };
    const d = this.#d;
    const g = d.grid;
    // Ray marching needs a box: at least two points along every axis.
    const grid =
      g &&
      g.len > 0 &&
      g.xs.length > 1 &&
      g.ys.length > 1 &&
      g.zs.length > 1 &&
      // One texel per grid point.
      fitsTexture(this.#context.capabilities, 'volume grid', g.xs.length, g.ys.length, g.zs.length)
        ? g
        : null;
    const domain = d.transfer.domain;
    const packed = this.#packed;
    if (
      grid &&
      (!packed ||
        packed.grid !== grid ||
        packed.domain[0] !== domain[0] ||
        packed.domain[1] !== domain[1])
    ) {
      this.#upload(grid, domain);
    } else if (!grid && this.#volume) {
      this.#volume.dispose();
      this.#volume = null;
      this.#packed = null;
      this.#uniforms.uVolume.value = null;
    }
    buildTransferFunction(d.transfer, this.#transfer.image.data as Uint8Array);
    this.#transfer.needsUpdate = true;
    const u = this.#uniforms;
    const span = domain[1] - domain[0];
    const norm = (v: number) => (span > 0 ? (v - domain[0]) / span : 0.5);
    // A hair wider than the range: its ends are drawn despite the quantization.
    const eps = 0.5 / 254;
    u.uIso.value.set(norm(d.isomin) - eps, norm(d.isomax) + eps);
    u.uStep.value = Math.min(4, Math.max(0.05, d.step));
    u.uShade.value.set(d.ambient, d.diffuse);
    const defines = this.#material.defines as Record<string, unknown>;
    let dirty = false;
    if ('HC_SHADE' in defines !== d.shading) {
      if (d.shading) defines['HC_SHADE'] = '';
      else delete defines['HC_SHADE'];
      dirty = true;
    }
    if (grid) {
      const diag = Math.hypot(grid.xs.length, grid.ys.length, grid.zs.length);
      const steps = Math.min(MAX_RAY_STEPS, Math.ceil(diag / u.uStep.value) + 2);
      // Rounded up to a power of two: fewer recompiles while `step` changes.
      const max = 2 ** Math.ceil(Math.log2(steps));
      if (defines['HC_MAX_STEPS'] !== max) {
        defines['HC_MAX_STEPS'] = max;
        dirty = true;
      }
    }
    if (dirty) this.#material.needsUpdate = true;
    this.object.visible = grid !== null;
    this.#applyTransform();
    this.#context.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.#applyTransform();
    this.#context.invalidate();
  }

  setViewport(_size: ViewportSize): void {}

  dispose(): void {
    this.#volume?.dispose();
    this.#volume = null;
    this.#axes?.dispose();
    this.#axes = null;
    this.#transfer.dispose();
    this.#material.dispose();
    this.object.geometry.dispose();
    this.object.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------

  #upload(grid: IsoGrid, domain: readonly [number, number]): void {
    const nx = grid.xs.length;
    const ny = grid.ys.length;
    const nz = grid.zs.length;
    const bytes = packVolume(grid, domain);
    const same =
      this.#volume &&
      this.#volume.image.width === nx &&
      this.#volume.image.height === ny &&
      this.#volume.image.depth === nz;
    if (same) {
      (this.#volume!.image.data as Uint8Array).set(bytes);
      this.#volume!.needsUpdate = true;
    } else {
      this.#volume?.dispose();
      const texture = new Data3DTexture(bytes, nx, ny, nz);
      texture.format = RedFormat;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      this.#volume = texture;
    }
    this.#packed = { grid, domain: [domain[0], domain[1]] };
    const u = this.#uniforms;
    u.uVolume.value = this.#volume;
    u.uCells.value.set(nx - 1, ny - 1, nz - 1);
    u.uSize.value.set(nx, ny, nz);
    const axes = [grid.xs, grid.ys, grid.zs];
    const uniform = axes.every(isUniformAxis);
    const defines = this.#material.defines as Record<string, unknown>;
    if (uniform) {
      if ('HC_NONUNIFORM' in defines) {
        delete defines['HC_NONUNIFORM'];
        this.#material.needsUpdate = true;
      }
      this.#axes?.dispose();
      this.#axes = null;
      u.uAxes.value = null;
    } else {
      const table = new Float32Array(AXIS_TABLE_SIZE * 3);
      axes.forEach((values, a) => axisTable(values, table, a * AXIS_TABLE_SIZE));
      this.#axes?.dispose();
      const texture = new DataTexture(table, AXIS_TABLE_SIZE, 3, RedFormat, FloatType);
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.needsUpdate = true;
      this.#axes = texture;
      u.uAxes.value = texture;
      if (!('HC_NONUNIFORM' in defines)) {
        defines['HC_NONUNIFORM'] = '';
        this.#material.needsUpdate = true;
      }
    }
  }

  /** The grid's box → scene units (object matrix), and the clip box in `L`. */
  #applyTransform(): void {
    const grid = this.#d.grid;
    if (!grid || grid.len === 0) return;
    const t = this.#transform;
    const scale = [t.scaleX, t.scaleY, t.scaleZ ?? 1];
    const offset = [t.offsetX, t.offsetY, t.offsetZ ?? 0];
    const axes = [grid.xs, grid.ys, grid.zs];
    const lo = axes.map((v) => v[0]!);
    const span = axes.map((v) => v[v.length - 1]! - v[0]!);
    this.object.scale.set(span[0]! * scale[0]!, span[1]! * scale[1]!, span[2]! * scale[2]!);
    this.object.position.set(
      lo[0]! * scale[0]! + offset[0]!,
      lo[1]! * scale[1]! + offset[1]!,
      lo[2]! * scale[2]! + offset[2]!,
    );
    const u = this.#uniforms;
    u.uWorldScale.value.copy(this.object.scale);
    const clip = this.#d.clip;
    const box = (a: number, v: number): number => (span[a]! > 0 ? (v - lo[a]!) / span[a]! : 0);
    const min = [0, 1, 2].map((a) => Math.max(0, clip ? box(a, clip.min[a]!) : 0));
    const max = [0, 1, 2].map((a) => Math.min(1, clip ? box(a, clip.max[a]!) : 1));
    u.uBoxMin.value.set(min[0]!, min[1]!, min[2]!);
    u.uBoxMax.value.set(max[0]!, max[1]!, max[2]!);
  }

  /** The camera in `L` (position, and view direction for orthographic cameras). */
  #beforeRender(camera: Camera): void {
    this.object.updateMatrixWorld();
    inverse.copy(this.object.matrixWorld).invert();
    const u = this.#uniforms;
    tmp.setFromMatrixPosition(camera.matrixWorld);
    u.uCamera.value.copy(tmp).applyMatrix4(inverse);
    camera.getWorldDirection(tmp);
    u.uViewDir.value.copy(tmp).transformDirection(inverse);
  }
}
