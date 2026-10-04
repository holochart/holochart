/**
 * Instanced cones (plan E14.5): every cone of a trace in one draw call, lit with Plotly's lighting
 * model and colored per cone through the colorscale.
 *
 * - **Geometry**: gl-cone3d's cone, 8 segments × (a side triangle + a base triangle) = 48 vertices
 *   ({@link coneTemplate}): length 1 along the axis, base radius 0.25, smooth side normals, a flat
 *   base. It is instanced by position (`aPos`, float32 relative to a float64 origin), vector
 *   (`aVec`, linear units) and value (`aValue`, the norm the colorscale maps).
 * - **Placement** (vertex shader, gl-cone3d's `getConePosition`): the cone vector in scene units is
 *   `d = scale · (u, v, w) · axis scales`, so a cone points along its data direction on any
 *   aspect ratio and keeps a round cross-section; the tip sits at `(1 − offset) · d` from the
 *   point and the base at `−offset · d`, with gl-cone3d's frame (`getOrthogonalVector`) around it.
 *   The data → scene transform is the object's matrix (float64 on the CPU, like the mesh
 *   primitive), so three.js' camera matrices and the GPU picker see the same geometry.
 * - **Shading**: the mesh primitive's fragment stage (Plotly's model, the shared colorscale LUT,
 *   the scene's light rig) from the lazily loaded mesh chunk (`loadMeshModule`). The primitive
 *   exists at once (a hidden placeholder the runtime can hold) and draws once the chunk has
 *   arrived; `ready` covers the load.
 * - **Translucency** (`opacity` < 1, colorscale alpha): no depth writes, and the instances are
 *   rewritten back to front when the view changes.
 * - **Picking** (E2.13): a `PickablePrimitive` whose ids are cone indices (`pickKind: 'point'`).
 */
import {
  acquireColorscaleTexture,
  effectiveTransform,
  loadMeshModule,
  type Colorscale,
  type ColorscaleInterpolation,
  type ColorscaleTextureHandle,
  type DataTransform,
  type LightRig,
  type MeshLighting,
  type MeshModule,
  type PickablePrimitive,
  type PickMaterialHandle,
  type PickRenderState,
  type Primitive,
  type PrimitiveContext,
  type ViewportSize,
  type Vec3,
} from '@mk7s/holochart-render';
import {
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  NoBlending,
  NormalBlending,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Camera,
  type IUniform,
} from 'three';

/** Instance values at least this large are gaps (hidden cones). */
const HIDDEN = 3.0e38;

/** Segments around a cone (gl-cone3d). */
const SEGMENTS = 8;

/** What {@link ConeSetPrimitive} draws. */
export interface ConeSetData {
  /** Positions (linear coordinates) and vectors (linear units), `count` of each. */
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
  u: ArrayLike<number>;
  v: ArrayLike<number>;
  w: ArrayLike<number>;
  count: number;
  /** Colorscale values, one per cone (the norms). */
  values: ArrayLike<number>;
  colorscale: Colorscale;
  interpolation: ColorscaleInterpolation;
  cmin: number;
  cmax: number;
  reversescale: boolean;
  opacity: number;
  /** Cone vector = `scale · (u, v, w)` (Plotly's `vectorScale · coneScale`). */
  scale: number;
  /** The point's position along the cone, from the tail (0) to the tip (1). */
  offset: number;
  lighting: Partial<MeshLighting>;
  /** Plotly's `lightposition` (clip space). */
  lightposition: Vec3;
}

const GRAY: Colorscale = [
  [0, [0, 0, 0, 1]],
  [1, [1, 1, 1, 1]],
];

/** The data of an empty cone set. */
export function emptyConeData(): ConeSetData {
  const none = new Float64Array(0);
  return {
    x: none,
    y: none,
    z: none,
    u: none,
    v: none,
    w: none,
    count: 0,
    values: none,
    colorscale: GRAY,
    interpolation: 'rgb',
    cmin: 0,
    cmax: 1,
    reversescale: false,
    opacity: 1,
    scale: 1,
    offset: 0.25,
    lighting: {},
    lightposition: [1e5, 1e5, 0],
  };
}

/**
 * The cone template (gl-cone3d): per segment the side triangle (tip, next rim point, rim point)
 * and the base triangle (center, rim point, next rim point). Positions are (radial x, radial y,
 * distance from the base along the axis); normals in the same frame.
 */
export function coneTemplate(): { position: Float32Array; normal: Float32Array } {
  const position: number[] = [];
  const normal: number[] = [];
  const k = 0.25;
  const side = (a: number) => {
    const l = Math.hypot(1, k);
    return [Math.cos(a) / l, Math.sin(a) / l, k / l];
  };
  const rim = (a: number) => [Math.cos(a) * k, Math.sin(a) * k, 0];
  for (let s = 0; s < SEGMENTS; s++) {
    const a = (2 * Math.PI * s) / SEGMENTS;
    const b = (2 * Math.PI * (s + 1)) / SEGMENTS;
    position.push(0, 0, 1, ...rim(b), ...rim(a));
    normal.push(...side(a), ...side(b), ...side(a));
    position.push(0, 0, 0, ...rim(a), ...rim(b));
    normal.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
  }
  return { position: new Float32Array(position), normal: new Float32Array(normal) };
}

/**
 * Vertex stage: place the template along each instance's vector (see the module comment). The
 * varyings are the mesh fragment shader's.
 */
export const CONE_VERTEX_SHADER = /* glsl */ `
precision highp float;
precision highp int;

in vec3 aPos;
in vec3 aVec;
in float aValue;
in float aIndex;
uniform vec3 uWorldScale;
uniform float uConeScale;
uniform float uOffset;
#ifdef HC_INTENSITY
out float vValue;
#endif
out vec3 vLocal;
out vec3 vViewPos;
out vec3 vNormal;
#ifdef PICKING
uniform uint uPickBase;
flat out uint vPickId;
#endif

// gl-cone3d's getOrthogonalVector.
vec3 hcOrthogonal(vec3 v) {
  if (v.x * v.x > v.z * v.z || v.y * v.y > v.z * v.z) return normalize(vec3(-v.y, v.x, 0.0));
  return normalize(vec3(0.0, v.z, -v.y));
}

void main() {
  vec3 d = uConeScale * aVec * uWorldScale;
  float len = length(d);
  if (!(len > 0.0) || len > 1.0e30 || abs(aPos.x) > 1.0e37 || abs(aPos.y) > 1.0e37
      || abs(aPos.z) > 1.0e37) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 axis = d / len;
  vec3 u = hcOrthogonal(d);
  vec3 v = normalize(cross(u, d));
  vec3 offset = (position.z - uOffset) * d + len * (position.x * u + position.y * v);
  vec3 local = aPos + offset / uWorldScale;
  vec4 mv = modelViewMatrix * vec4(local, 1.0);
  vLocal = local;
  vViewPos = mv.xyz;
  vNormal = mat3(viewMatrix) * (normal.x * u + normal.y * v + normal.z * axis);
#ifdef HC_INTENSITY
  vValue = aValue;
#endif
  gl_Position = projectionMatrix * mv;
#ifdef PICKING
  vPickId = uPickBase + uint(aIndex + 0.5);
#endif
}
`;

interface ConeUniforms {
  [name: string]: IUniform;
  uWorldScale: IUniform<Vector3>;
  uConeScale: IUniform<number>;
  uOffset: IUniform<number>;
  uColor: IUniform<Vector4>;
  uOpacity: IUniform<number>;
  uClipMin: IUniform<Vector3>;
  uClipMax: IUniform<Vector3>;
  uLut: IUniform<unknown>;
  uCRange: IUniform<Vector3>;
  uK: IUniform<Vector4>;
  uAmbient: IUniform<Vector3>;
  uHemiSky: IUniform<Vector3>;
  uHemiGround: IUniform<Vector3>;
  uHemiUp: IUniform<Vector3>;
  uLightPos: IUniform<Float32Array>;
  uLightColor: IUniform<Float32Array>;
}

/** Instance attributes: name, floats per cone. */
const ATTRIBUTES = [
  ['aPos', 3],
  ['aVec', 3],
  ['aValue', 1],
  ['aIndex', 1],
] as const;

function centerOf(values: ArrayLike<number>, count: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < count; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? (lo + hi) / 2 : 0;
}

const modelView = new Matrix4();

/** See the module comment. */
export class ConeSetPrimitive implements Primitive<ConeSetData>, PickablePrimitive {
  readonly object: Mesh;
  readonly pickKind = 'point' as const;
  readonly #context: PrimitiveContext;
  #d: ConeSetData = emptyConeData();
  #mod: MeshModule | null = null;
  #material: ShaderMaterial | null = null;
  readonly #uniforms: ConeUniforms;
  #geometry: InstancedBufferGeometry;
  /** Instance data in input order (float32; `aPos` relative to {@link #origin}). */
  #source: Record<string, Float32Array> = {};
  #capacity = 0;
  #origin: Vec3 = [0, 0, 0];
  #valueOrigin = 0;
  #transform: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  #lut: ColorscaleTextureHandle | null = null;
  #lutKey: { scale: Colorscale; space: ColorscaleInterpolation } | null = null;
  #rig: LightRig | null = null;
  #view: ReturnType<MeshModule['createViewLights']> | null = null;
  #translucent = false;
  /** Instances are in sorted order (translucent), with the view row they were sorted for. */
  #sorted = false;
  readonly #sortedView = [NaN, NaN, NaN, NaN];
  #order: Uint32Array | null = null;
  readonly #ready: Promise<void>;
  #disposed = false;

  constructor(context: PrimitiveContext, data?: Partial<ConeSetData>) {
    this.#context = context;
    this.#uniforms = {
      uWorldScale: { value: new Vector3(1, 1, 1) },
      uConeScale: { value: 1 },
      uOffset: { value: 0.25 },
      uColor: { value: new Vector4(1, 1, 1, 1) },
      uOpacity: { value: 1 },
      uClipMin: { value: new Vector3() },
      uClipMax: { value: new Vector3() },
      uLut: { value: null },
      uCRange: { value: new Vector3(0, 1, 0) },
      uK: { value: new Vector4() },
      uAmbient: { value: new Vector3() },
      uHemiSky: { value: new Vector3() },
      uHemiGround: { value: new Vector3() },
      uHemiUp: { value: new Vector3(0, 0, 1) },
      uLightPos: { value: new Float32Array(0) },
      uLightColor: { value: new Float32Array(0) },
    };
    this.#geometry = this.#createGeometry(0);
    this.object = new Mesh(this.#geometry);
    this.object.name = 'holochart:cones';
    this.object.visible = false;
    this.object.frustumCulled = false;
    this.object.onBeforeRender = (_renderer, _scene, camera) => this.#beforeRender(camera);
    if (data) this.update(data);
    this.#ready = loadMeshModule().then(
      (mod) => {
        if (this.#disposed) return;
        this.#attach(mod);
        this.#context.invalidate();
      },
      (error: unknown) => {
        console.error('[holochart] could not load the cone shaders:', error);
      },
    );
  }

  /** Resolves once the shaders have loaded (or failed to). */
  get ready(): Promise<void> {
    return this.#ready;
  }

  /** The drawn data. */
  get data(): Readonly<ConeSetData> {
    return this.#d;
  }

  /** Whether the cones draw translucent (no depth writes, sorted back to front). */
  get translucent(): boolean {
    return this.#translucent;
  }

  /** Instance data as uploaded (for tests): `aPos`, `aVec`, `aValue`, `aIndex`. */
  get instances(): Readonly<Record<string, Float32Array>> {
    const out: Record<string, Float32Array> = {};
    for (const [name] of ATTRIBUTES) {
      const a = this.#geometry.getAttribute(name) as InstancedBufferAttribute | undefined;
      if (a) out[name] = a.array as Float32Array;
    }
    return out;
  }

  /** The float64 origin of `aPos`. */
  get origin(): Readonly<Vec3> {
    return this.#origin;
  }

  get pickCount(): number {
    return this.#material ? this.#d.count : 0;
  }

  update(patch: Partial<ConeSetData>): void {
    if (this.#disposed) return;
    this.#d = { ...this.#d, ...patch };
    const instances = ['x', 'y', 'z', 'u', 'v', 'w', 'count', 'values'].some((k) => k in patch);
    if (instances) this.#writeInstances();
    this.#updateUniforms();
    this.#context.invalidate();
  }

  /** Light with a scene's rig (`scene.lighting`) instead of `lightposition` (null: Plotly's). */
  setLightRig(rig: LightRig | null): void {
    this.#rig = rig;
    this.#context.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.#applyTransform();
    this.#context.invalidate();
  }

  setViewport(_size: ViewportSize): void {}

  /** The pick variant: the same vertex stage, writing cone indices. */
  createPickMaterial(): PickMaterialHandle {
    const mod = this.#mod;
    if (!mod) throw new Error('[holochart] the cone shaders have not loaded yet');
    const uniforms = { ...this.#uniforms, uPickBase: { value: 0 } };
    const material = new ShaderMaterial({
      name: 'holochart:cones:pick',
      glslVersion: GLSL3,
      vertexShader: CONE_VERTEX_SHADER,
      fragmentShader: mod.MESH_FRAGMENT_SHADER,
      uniforms,
      defines: { PICKING: '', HC_LIGHTS: 0 },
      blending: NoBlending,
      side: DoubleSide,
    });
    return {
      material,
      prepare: (state: Readonly<PickRenderState>): void => {
        uniforms.uPickBase.value = state.base;
        const source = this.#material;
        material.depthTest = true;
        material.depthWrite = source?.depthWrite ?? true;
        material.transparent = source?.transparent ?? false;
      },
      dispose: () => material.dispose(),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lut?.release();
    this.#lut = null;
    this.#material?.dispose();
    this.#geometry.dispose();
    this.object.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------

  #attach(mod: MeshModule): void {
    this.#mod = mod;
    this.#view = mod.createViewLights();
    this.#material = new ShaderMaterial({
      name: 'holochart:cones',
      glslVersion: GLSL3,
      vertexShader: CONE_VERTEX_SHADER,
      fragmentShader: mod.MESH_FRAGMENT_SHADER,
      uniforms: this.#uniforms,
      defines: { HC_LIGHTS: 1, HC_INTENSITY: '' },
      blending: NormalBlending,
      side: DoubleSide,
    });
    this.object.material = this.#material;
    this.#updateUniforms();
  }

  #createGeometry(capacity: number): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();
    const t = coneTemplate();
    geometry.setAttribute('position', new Float32BufferAttribute(t.position, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(t.normal, 3));
    for (const [name, size] of ATTRIBUTES) {
      const a = new InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * size), size);
      a.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, a);
    }
    geometry.instanceCount = 0;
    return geometry;
  }

  /** Pack the instances (input order) and upload them (in draw order). */
  #writeInstances(): void {
    const d = this.#d;
    const n = Math.max(0, Math.min(d.count, d.x.length, d.y.length, d.z.length));
    if (n > this.#capacity || n < this.#capacity / 4) {
      this.#geometry.dispose();
      this.#geometry = this.#createGeometry(n);
      this.object.geometry = this.#geometry;
      this.#capacity = Math.max(1, n);
    }
    const o: Vec3 = [centerOf(d.x, n), centerOf(d.y, n), centerOf(d.z, n)];
    this.#origin = o;
    this.#valueOrigin = centerOf(d.values, n);
    const pos = new Float32Array(n * 3);
    const vec = new Float32Array(n * 3);
    const value = new Float32Array(n);
    const index = new Float32Array(n);
    const cols = [d.x, d.y, d.z];
    const comps = [d.u, d.v, d.w];
    for (let i = 0; i < n; i++) {
      const finite = cols.every((c) => Number.isFinite(c[i]));
      // A vector with a missing component draws nothing (a zero vector).
      const vector = comps.every((c) => Number.isFinite(c[i]));
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = finite ? cols[k]![i]! - o[k]! : HIDDEN;
        vec[i * 3 + k] = vector ? comps[k]![i]! : 0;
      }
      const v = d.values[i];
      value[i] = v !== undefined && Number.isFinite(v) ? v - this.#valueOrigin : HIDDEN;
      index[i] = i;
    }
    this.#source = { aPos: pos, aVec: vec, aValue: value, aIndex: index };
    this.#geometry.instanceCount = n;
    this.#sorted = false;
    this.#sortedView[0] = NaN;
    this.#order = null;
    this.#upload(null);
    this.#applyTransform();
  }

  /** Write the instances into the attributes, in `order` (null: input order). */
  #upload(order: Uint32Array | null): void {
    const n = this.#geometry.instanceCount;
    for (const [name, size] of ATTRIBUTES) {
      const attribute = this.#geometry.getAttribute(name) as InstancedBufferAttribute;
      const out = attribute.array as Float32Array;
      const src = this.#source[name]!;
      if (!order) out.set(src.subarray(0, n * size));
      else {
        for (let i = 0; i < n; i++) {
          const j = order[i]!;
          for (let c = 0; c < size; c++) out[i * size + c] = src[j * size + c]!;
        }
      }
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, n * size);
      attribute.needsUpdate = true;
    }
  }

  /** Uniforms, defines and blending (cheap; after every update). */
  #updateUniforms(): void {
    const d = this.#d;
    const u = this.#uniforms;
    u.uOpacity.value = Math.min(1, Math.max(0, d.opacity));
    u.uConeScale.value = d.scale;
    u.uOffset.value = d.offset;
    const l = this.#mod?.resolveMeshLighting(d.lighting);
    if (l) u.uK.value.set(l.diffuse, l.specular, Math.max(l.roughness, 1e-3), l.fresnel);
    const key = this.#lutKey;
    if (!key || key.scale !== d.colorscale || key.space !== d.interpolation) {
      const next = acquireColorscaleTexture(this.#context.resources, d.colorscale, d.interpolation);
      this.#lut?.release();
      this.#lut = next;
      this.#lutKey = { scale: d.colorscale, space: d.interpolation };
      u.uLut.value = next.texture;
    }
    const vo = this.#valueOrigin;
    u.uCRange.value.set(d.cmin - vo, d.cmax - vo, d.reversescale ? 1 : 0);
    const translucent = d.opacity < 1 || d.colorscale.some((stop) => stop[1][3] < 1);
    if (this.#translucent && !translucent && this.#sorted) {
      this.#upload(null);
      this.#sorted = false;
    }
    this.#translucent = translucent;
    const m = this.#material;
    if (!m) return;
    m.transparent = translucent;
    m.depthWrite = !translucent;
    this.object.visible = this.#geometry.instanceCount > 0;
  }

  #applyTransform(): void {
    const { scale, offset } = effectiveTransform(this.#transform, this.#origin);
    this.object.scale.set(scale[0], scale[1], scale[2]);
    this.object.position.set(offset[0], offset[1], offset[2]);
    this.#uniforms.uWorldScale.value.set(scale[0], scale[1], scale[2]);
    this.#sortedView[0] = NaN;
  }

  #beforeRender(camera: Camera): void {
    const mod = this.#mod;
    const view = this.#view;
    const u = this.#uniforms;
    if (!mod || !view) return;
    const lights = mod.computeViewLights(
      this.#rig?.spec ?? null,
      this.#d.lightposition,
      mod.resolveMeshLighting(this.#d.lighting),
      camera,
      view,
    );
    u.uLightPos.value = lights.position;
    u.uLightColor.value = lights.color;
    u.uAmbient.value.fromArray(lights.ambient);
    u.uHemiSky.value.fromArray(lights.hemiSky);
    u.uHemiGround.value.fromArray(lights.hemiGround);
    u.uHemiUp.value.fromArray(lights.hemiUp);
    const defines = this.#material?.defines as Record<string, unknown> | undefined;
    if (defines && defines['HC_LIGHTS'] !== lights.count) {
      defines['HC_LIGHTS'] = lights.count;
      this.#material!.needsUpdate = true;
    }
    if (!this.#translucent || this.#geometry.instanceCount < 2) return;
    // Back to front by the view depth of the cone positions, when the view changed.
    this.object.updateMatrixWorld();
    modelView.multiplyMatrices(camera.matrixWorldInverse, this.object.matrixWorld);
    const e = modelView.elements;
    const last = this.#sortedView;
    if (last[0] === e[2] && last[1] === e[6] && last[2] === e[10] && last[3] === e[14]) return;
    last[0] = e[2]!;
    last[1] = e[6]!;
    last[2] = e[10]!;
    last[3] = e[14]!;
    const n = this.#geometry.instanceCount;
    const centers = this.#source['aPos']!.subarray(0, n * 3);
    this.#order = mod.sortTrianglesByDepth(centers, e, this.#order ?? undefined);
    this.#upload(this.#order);
    this.#sorted = true;
  }
}
