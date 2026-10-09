/**
 * Instanced 3D bars (plan E14.9): every bar of a trace in one draw call, lit like the other 3D
 * meshes, with the box edges drawn in the faces.
 *
 * - **Geometry**: a unit box template ({@link boxTemplate}: 6 faces × 4 vertices with face normals,
 *   36 indices, counter-clockwise outside) instanced per bar by its min corner (`aPos`, float32
 *   relative to a float64 origin), its size (`aSize`, linear units, ≥ 0) and color (`color`,
 *   RGBA: straight sRGB for Plotly's model, linear for three.js materials), plus its index for
 *   picking. The data → scene transform is the object's matrix (float64 on the CPU, like the mesh
 *   primitive), so box faces stay axis-aligned and their normals exact on any aspect ratio.
 * - **Shading**: `material.type` `'plotly'` (default) and `'flat'` draw with the mesh primitive's
 *   fragment stage (Plotly's model, the scene's light rig) from the lazily loaded mesh chunk
 *   (`loadMeshModule`); three.js material types (`'standard'`, `'physical'`, …) are the mesh
 *   chunk's three.js materials with the instancing spliced into their shaders (`onBeforeCompile`),
 *   lit by the rig's lights (they receive shadows; bars cast none). The primitive exists at once
 *   (a hidden placeholder) and draws once the chunk has arrived; `ready` covers the load.
 * - **Edges** (`marker.line`): in the fragment stage, not as lines: each face knows its position in
 *   the box (`vBox`, 0–1 across the face), and the fragments within half the edge width (screen
 *   px, from the derivatives) of a face border take the edge color. Two faces meet at every visible
 *   edge, so it is the full width there (half at silhouettes); hidden edges are hidden with their
 *   faces, and edges never z-fight the faces.
 * - **Translucency** (`opacity` < 1, colors with alpha): front faces only, no depth writes, and the
 *   instances rewritten back to front (by box center) when the view changes.
 * - **Picking** (E2.13): a `PickablePrimitive` whose ids are bar indices (`pickKind: 'point'`).
 */
import {
  effectiveTransform,
  loadMeshModule,
  type DataTransform,
  type LightRig,
  type MeshLighting,
  type MeshMaterialSpec,
  type MeshModule,
  type PickablePrimitive,
  type PickMaterialHandle,
  type PickRenderState,
  type Primitive,
  type PrimitiveContext,
  type RGBA,
  type ViewportSize,
  type Vec3,
} from '@mk7s/holochart-render';
import {
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  FrontSide,
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
  type Material,
  type WebGLRenderer,
} from 'three';

/** Instance sizes at least this large mark gaps (hidden bars). */
const HIDDEN = 3.0e38;

/** What {@link Bar3DPrimitive} draws. */
export interface Bar3DData {
  /** Min corner (linear coordinates) and size (linear units, ≥ 0) of each bar, `count` each. */
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
  dx: ArrayLike<number>;
  dy: ArrayLike<number>;
  dz: ArrayLike<number>;
  count: number;
  /** One straight sRGB color, or 4 floats per bar. */
  color: RGBA | Float32Array;
  /** Multiplies alpha. */
  opacity: number;
  /** Edge color (sRGB, straight alpha) and width in CSS px (0: none). */
  edgeColor: RGBA;
  edgeWidth: number;
  lighting: Partial<MeshLighting>;
  /** Plotly's `lightposition` (clip space). */
  lightposition: Vec3;
  /** `trace.material` (null: Plotly's model). */
  material: MeshMaterialSpec | null;
  receiveShadow: boolean;
}

/** The data of an empty bar set. */
export function emptyBar3DData(): Bar3DData {
  const none = new Float64Array(0);
  return {
    x: none,
    y: none,
    z: none,
    dx: none,
    dy: none,
    dz: none,
    count: 0,
    color: [0.5, 0.5, 0.5, 1],
    opacity: 1,
    edgeColor: [0, 0, 0, 1],
    edgeWidth: 0,
    lighting: {},
    lightposition: [1e5, 1e5, 0],
    material: null,
    receiveShadow: false,
  };
}

/**
 * The unit box `[0, 1]³`: per face (axis `a`, side `s`) four corners counter-clockwise seen from
 * outside, with the face normal, and two triangles.
 */
export function boxTemplate(): { position: Float32Array; normal: Float32Array; index: number[] } {
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    for (const s of [0, 1]) {
      const base = position.length / 3;
      // e_u × e_v = e_a: counter-clockwise seen from +a; reversed for the −a face.
      const order = s ? corners : [...corners].reverse();
      for (const [cu, cv] of order) {
        const p = [0, 0, 0];
        const n = [0, 0, 0];
        p[a] = s;
        p[u] = cu!;
        p[v] = cv!;
        n[a] = s ? 1 : -1;
        position.push(...p);
        normal.push(...n);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { position: new Float32Array(position), normal: new Float32Array(normal), index };
}

/**
 * Vertex stage of Plotly's model (and of picking): place the template in each instance's box.
 * The varyings are the mesh fragment shader's, plus `vBox` for the edges.
 */
export const BAR3D_VERTEX_SHADER = /* glsl */ `
precision highp float;
precision highp int;

in vec3 aPos;
in vec3 aSize;
in vec4 color;
in float aIndex;
out vec4 vColor;
out vec3 vLocal;
out vec3 vViewPos;
out vec3 vNormal;
out vec3 vBox;
#ifdef PICKING
uniform uint uPickBase;
flat out uint vPickId;
#endif

void main() {
  if (aSize.x > 1.0e37) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 local = aPos + position * aSize;
  vec4 mv = modelViewMatrix * vec4(local, 1.0);
  vLocal = local;
  vViewPos = mv.xyz;
  vNormal = normalMatrix * normal;
  vColor = color;
  // Position across the face; the face's own axis is constant (no edge along it).
  vBox = mix(position, vec3(0.5), abs(normal));
  gl_Position = projectionMatrix * mv;
#ifdef PICKING
  vPickId = uPickBase + uint(aIndex + 0.5);
#endif
}
`;

/** Edge coverage of a fragment from `vBox` (see the module comment); declarations. */
const EDGE_DECL = /* glsl */ `
uniform vec4 uEdgeColor;
uniform float uEdgeWidth;
float hcEdgeAxis(float c) {
  float g = length(vec2(dFdx(c), dFdy(c)));
  return min(c, 1.0 - c) / max(g, 1.0e-6);
}
float hcEdge(vec3 box) {
  float d = min(hcEdgeAxis(box.x), min(hcEdgeAxis(box.y), hcEdgeAxis(box.z)));
  return uEdgeWidth > 0.0 ? clamp(0.5 * uEdgeWidth - d + 0.5, 0.0, 1.0) * uEdgeColor.a : 0.0;
}
`;

/** The mesh fragment shader with the edges after lighting. */
function barFragmentShader(mod: MeshModule): string {
  return mod.MESH_FRAGMENT_SHADER.replace(
    '// @mesh-fragment-decl',
    `in vec3 vBox;\n${EDGE_DECL}`,
  ).replace('// @mesh-lit', '  color.rgb = mix(color.rgb, uEdgeColor.rgb, hcEdge(vBox));');
}

/** Splice the instancing and the edges into a three.js material's shaders. */
function instanceThreeMaterial(material: Material, uniforms: BarUniforms): void {
  const inner = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    inner(shader, renderer);
    shader.uniforms['uEdgeColor'] = uniforms.uEdgeLinear;
    shader.uniforms['uEdgeWidth'] = uniforms.uEdgeWidth;
    shader.vertexShader =
      'attribute vec3 aPos;\nattribute vec3 aSize;\nvarying vec3 vBox;\n' +
      shader.vertexShader
        .replace(
          'void main() {',
          'void main() {\n\tif (aSize.x > 1.0e37) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }',
        )
        .replace(
          '#include <begin_vertex>',
          'vec3 transformed = aPos + position * aSize;\nvBox = mix(position, vec3(0.5), abs(normal));',
        );
    shader.fragmentShader =
      `varying vec3 vBox;\n${EDGE_DECL}\n` +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'outgoingLight = mix(outgoingLight, uEdgeColor.rgb, hcEdge(vBox));\n#include <opaque_fragment>',
      );
  };
  material.customProgramCacheKey = () => 'holochart-bar3d';
}

interface BarUniforms {
  [name: string]: IUniform;
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
  uEdgeColor: IUniform<Vector4>;
  /** The edge color in linear RGB (three.js materials). */
  uEdgeLinear: IUniform<Vector4>;
  /** Device px. */
  uEdgeWidth: IUniform<number>;
}

/** Instance attributes: name, floats per bar. */
const ATTRIBUTES = [
  ['aPos', 3],
  ['aSize', 3],
  ['color', 4],
  ['aIndex', 1],
] as const;

/** sRGB → linear, one channel. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function centerOf(lo: ArrayLike<number>, size: ArrayLike<number>, count: number): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const a = lo[i]!;
    const b = a + size[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a < min) min = a;
    if (b > max) max = b;
  }
  return min <= max ? (min + max) / 2 : 0;
}

const modelView = new Matrix4();

/** See the module comment. */
export class Bar3DPrimitive implements Primitive<Bar3DData>, PickablePrimitive {
  readonly object: Mesh;
  readonly pickKind = 'point' as const;
  readonly #context: PrimitiveContext;
  #d: Bar3DData = emptyBar3DData();
  #mod: MeshModule | null = null;
  #material: Material | null = null;
  /** The material's kind: `plotly` (also `flat`) or a three.js type, and its spec. */
  #materialKey = '';
  readonly #uniforms: BarUniforms;
  #geometry: InstancedBufferGeometry;
  /** Instance data in input order (float32; `aPos` relative to {@link #origin}). */
  #source: Record<string, Float32Array> = {};
  #centers = new Float32Array(0);
  #capacity = 0;
  #origin: Vec3 = [0, 0, 0];
  #transform: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  #rig: LightRig | null = null;
  #view: ReturnType<MeshModule['createViewLights']> | null = null;
  #translucent = false;
  /** Instances are in sorted order (translucent), with the view row they were sorted for. */
  #sorted = false;
  readonly #sortedView = [NaN, NaN, NaN, NaN];
  #order: Uint32Array | null = null;
  readonly #ready: Promise<void>;
  #disposed = false;

  constructor(context: PrimitiveContext, data?: Partial<Bar3DData>) {
    this.#context = context;
    this.#uniforms = {
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
      uEdgeColor: { value: new Vector4(0, 0, 0, 1) },
      uEdgeLinear: { value: new Vector4(0, 0, 0, 1) },
      uEdgeWidth: { value: 0 },
    };
    this.#geometry = this.#createGeometry(0);
    this.object = new Mesh(this.#geometry);
    this.object.name = 'holochart:bar3d';
    this.object.visible = false;
    this.object.frustumCulled = false;
    this.object.onBeforeRender = (renderer, _scene, camera) => this.#beforeRender(renderer, camera);
    if (data) this.update(data);
    this.#ready = loadMeshModule().then(
      (mod) => {
        if (this.#disposed) return;
        this.#mod = mod;
        this.#view = mod.createViewLights();
        this.#syncMaterial();
        this.#context.invalidate();
      },
      (error: unknown) => {
        console.error('[holochart] could not load the bar3d shaders:', error);
      },
    );
  }

  /** Resolves once the shaders have loaded (or failed to). */
  get ready(): Promise<void> {
    return this.#ready;
  }

  /** The drawn data. */
  get data(): Readonly<Bar3DData> {
    return this.#d;
  }

  /** Whether the bars draw translucent (no depth writes, sorted back to front). */
  get translucent(): boolean {
    return this.#translucent;
  }

  /** The material in use (null until the shaders have loaded). */
  get material(): Material | null {
    return this.#material;
  }

  /** Instance data as uploaded (for tests): `aPos`, `aSize`, `color`, `aIndex`. */
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

  update(patch: Partial<Bar3DData>): void {
    if (this.#disposed) return;
    const prevLinear = this.#linearColors();
    this.#d = { ...this.#d, ...patch };
    const instances =
      ['x', 'y', 'z', 'dx', 'dy', 'dz', 'count', 'color'].some((k) => k in patch) ||
      prevLinear !== this.#linearColors();
    if (instances) this.#writeInstances();
    this.#syncMaterial();
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

  /** The pick variant: the same vertex stage, writing bar indices. */
  createPickMaterial(): PickMaterialHandle {
    const mod = this.#mod;
    if (!mod) throw new Error('[holochart] the bar3d shaders have not loaded yet');
    const uniforms = { ...this.#uniforms, uPickBase: { value: 0 } };
    const material = new ShaderMaterial({
      name: 'holochart:bar3d:pick',
      glslVersion: GLSL3,
      vertexShader: BAR3D_VERTEX_SHADER,
      fragmentShader: barFragmentShader(mod),
      uniforms,
      defines: { PICKING: '', HC_LIGHTS: 0, HC_COLOR: '' },
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
    this.#disposeMaterial();
    this.#geometry.dispose();
    this.object.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------

  /** Whether colors are uploaded linear (three.js material types). */
  #linearColors(): boolean {
    const type = this.#d.material?.type;
    return type !== undefined && type !== 'plotly' && type !== 'flat';
  }

  #disposeMaterial(): void {
    const m = this.#material;
    if (!m) return;
    (m.userData['gradient'] as { dispose(): void } | undefined)?.dispose();
    m.dispose();
    this.#material = null;
  }

  /** (Re)create the material when its type or three.js parameters changed. */
  #syncMaterial(): void {
    const mod = this.#mod;
    if (!mod) return;
    const spec = this.#d.material;
    const three = this.#linearColors();
    const key = three
      ? `three:${JSON.stringify(spec, (k, v: unknown) => (k === 'matcap' ? (v as { uuid?: string } | null)?.uuid : v))}`
      : `plotly:${spec?.type === 'flat' ? 'flat' : ''}`;
    if (key === this.#materialKey && this.#material) return;
    this.#disposeMaterial();
    this.#materialKey = key;
    if (three && spec) {
      const material = mod.createThreeMaterial(spec, mod.resolveMeshLighting(this.#d.lighting), {
        uClipMin: this.#uniforms.uClipMin,
        uClipMax: this.#uniforms.uClipMax,
      });
      (material as Material & { vertexColors: boolean }).vertexColors = true;
      instanceThreeMaterial(material, this.#uniforms);
      this.#material = material;
    } else {
      this.#material = new ShaderMaterial({
        name: 'holochart:bar3d',
        glslVersion: GLSL3,
        vertexShader: BAR3D_VERTEX_SHADER,
        fragmentShader: barFragmentShader(mod),
        uniforms: this.#uniforms,
        defines: {
          HC_LIGHTS: 1,
          HC_COLOR: '',
          ...(spec?.type === 'flat' ? { HC_UNLIT: '' } : {}),
        },
        blending: NormalBlending,
      });
    }
    this.object.material = this.#material;
    this.object.receiveShadow = three && this.#d.receiveShadow;
    this.#updateUniforms();
  }

  #createGeometry(capacity: number): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();
    const t = boxTemplate();
    geometry.setAttribute('position', new Float32BufferAttribute(t.position, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(t.normal, 3));
    geometry.setIndex(t.index);
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
    const cols = [d.x, d.y, d.z];
    const sizes = [d.dx, d.dy, d.dz];
    const n = Math.max(0, Math.min(d.count, ...cols.map((c) => c.length)));
    if (n > this.#capacity || n < this.#capacity / 4) {
      this.#geometry.dispose();
      this.#geometry = this.#createGeometry(n);
      this.object.geometry = this.#geometry;
      this.#capacity = Math.max(1, n);
    }
    const o: Vec3 = [0, 1, 2].map((k) => centerOf(cols[k]!, sizes[k]!, n)) as Vec3;
    this.#origin = o;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n * 3);
    const color = new Float32Array(n * 4);
    const index = new Float32Array(n);
    const centers = new Float32Array(n * 3);
    const linear = this.#linearColors();
    const one = d.color instanceof Float32Array ? null : d.color;
    for (let i = 0; i < n; i++) {
      let visible = true;
      for (let k = 0; k < 3; k++) {
        const lo = cols[k]![i]!;
        const s = sizes[k]![i]!;
        if (!Number.isFinite(lo) || !Number.isFinite(s) || s < 0) visible = false;
      }
      // Zero-height bars draw nothing (as in 2D).
      if (!(sizes[2]![i]! > 0)) visible = false;
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = visible ? cols[k]![i]! - o[k]! : 0;
        size[i * 3 + k] = visible ? sizes[k]![i]! : HIDDEN;
        centers[i * 3 + k] = visible ? pos[i * 3 + k]! + size[i * 3 + k]! / 2 : 0;
      }
      for (let c = 0; c < 4; c++) {
        const v = one ? one[c]! : (d.color as Float32Array)[i * 4 + c]!;
        color[i * 4 + c] = linear && c < 3 ? srgbToLinear(v) : v;
      }
      index[i] = i;
    }
    this.#source = { aPos: pos, aSize: size, color, aIndex: index };
    this.#centers = centers;
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

  /** Uniforms, blending and sides (cheap; after every update). */
  #updateUniforms(): void {
    const d = this.#d;
    const u = this.#uniforms;
    const opacity = Math.min(1, Math.max(0, d.opacity));
    u.uOpacity.value = opacity;
    const l = this.#mod?.resolveMeshLighting(d.lighting);
    if (l) u.uK.value.set(l.diffuse, l.specular, Math.max(l.roughness, 1e-3), l.fresnel);
    const [r, g, b, a] = d.edgeColor;
    u.uEdgeColor.value.set(r, g, b, a);
    u.uEdgeLinear.value.set(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a);
    const alpha = (c: RGBA | Float32Array): boolean => {
      if (!(c instanceof Float32Array)) return c[3] < 1;
      for (let i = 3; i < c.length; i += 4) if (c[i]! < 1) return true;
      return false;
    };
    const translucent = opacity < 1 || alpha(d.color);
    if (this.#translucent && !translucent && this.#sorted) {
      this.#upload(null);
      this.#sorted = false;
    }
    this.#translucent = translucent;
    const m = this.#material;
    if (!m) return;
    m.transparent = translucent;
    m.depthWrite = !translucent;
    const side = translucent ? FrontSide : DoubleSide;
    if (m.side !== side) {
      m.side = side;
      m.needsUpdate = true;
    }
    if (!(m instanceof ShaderMaterial)) m.opacity = opacity;
    this.object.visible = this.#geometry.instanceCount > 0;
  }

  #applyTransform(): void {
    const { scale, offset } = effectiveTransform(this.#transform, this.#origin);
    this.object.scale.set(scale[0], scale[1], scale[2]);
    this.object.position.set(offset[0], offset[1], offset[2]);
    this.#sortedView[0] = NaN;
  }

  #beforeRender(renderer: WebGLRenderer, camera: Camera): void {
    const mod = this.#mod;
    const view = this.#view;
    const u = this.#uniforms;
    if (!mod || !view) return;
    u.uEdgeWidth.value = this.#d.edgeWidth * renderer.getPixelRatio();
    if (this.#material instanceof ShaderMaterial) {
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
      const defines = this.#material.defines as Record<string, unknown>;
      if (defines['HC_LIGHTS'] !== lights.count) {
        defines['HC_LIGHTS'] = lights.count;
        this.#material.needsUpdate = true;
      }
    }
    if (!this.#translucent || this.#geometry.instanceCount < 2) return;
    // Back to front by the view depth of the box centers, when the view changed.
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
    this.#order = mod.sortTrianglesByDepth(
      this.#centers.subarray(0, n * 3),
      e,
      this.#order ?? undefined,
    );
    this.#upload(this.#order);
    this.#sorted = true;
  }
}
