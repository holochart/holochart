/**
 * Lighting for 3D meshes (plan E2.11, E8.7).
 *
 * ## Plotly's model (the default material)
 *
 * gl-mesh3d and gl-surface3d light a fragment with
 * `min(ambient + diffuse · max(N·L, 0), 1) · color + specular · cookTorrance(L, V, N, roughness,
 * fresnel)`, computed on sRGB values (as Plotly does), two-sided. Plotly's `lightposition` is given
 * in clip space and un-projected through the camera, so the light moves with the view (default
 * `(1e5, 1e5, 0)`: far to the upper right of the screen). {@link PLOTLY_LIGHTING} holds Plotly's
 * `lighting` defaults; {@link resolveMeshLighting} clamps values to Plotly's attribute ranges.
 *
 * ## Light rigs (`scene.lighting`)
 *
 * A {@link LightRig} is the scene's lights: ambient, directional lights (in scene, camera or
 * Plotly's clip space, optionally casting shadows), a hemisphere light, an environment map
 * (`'studio'`, `'city'`, an image URL or a texture) and an optional shadow-catching ground plane.
 * Its {@link LightRig.object} holds matching three.js lights, which light the three.js material
 * types (`lambert`, `standard`, …); meshes drawn with Plotly's model read the same lights through
 * {@link computeViewLights} when the rig is set on them (the trace's `lighting` coefficients then
 * scale the rig's lights). Intensities are in Plotly's units: 1 is the full color (three.js lights
 * get `π ×` since r155's physically based light units divide by π).
 */
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FrontSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  Vector4,
  type Camera,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import type { Vec3 } from '../precision.ts';
import type { RGBA } from '../types.ts';

/** Plotly's `lighting` attributes (surface, mesh3d, isosurface, …). */
export interface MeshLighting {
  /** Ambient light, 0–1. Plotly default 0.8. */
  ambient: number;
  /** Diffuse (Lambert) light, 0–1. Plotly default 0.8. */
  diffuse: number;
  /** Specular light, 0–2. Plotly default 0.05. */
  specular: number;
  /** Beckmann roughness of the specular highlight, 0–1. Plotly default 0.5. */
  roughness: number;
  /** Fresnel exponent (reflection at grazing angles), 0–5. Plotly default 0.2. */
  fresnel: number;
  /** Faces whose squared normal length is at most this get no normal (flat shading). */
  facenormalsepsilon: number;
  /** Vertex normal contributions and sums at most this are dropped (smooth shading). */
  vertexnormalsepsilon: number;
}

export const PLOTLY_LIGHTING: Readonly<MeshLighting> = Object.freeze({
  ambient: 0.8,
  diffuse: 0.8,
  specular: 0.05,
  roughness: 0.5,
  fresnel: 0.2,
  facenormalsepsilon: 1e-6,
  vertexnormalsepsilon: 1e-12,
});

/** Plotly's `lightposition` default (clip space). */
export const PLOTLY_LIGHTPOSITION: Readonly<Vec3> = Object.freeze([1e5, 1e5, 0]) as Vec3;

const RANGES: Record<keyof MeshLighting, [number, number]> = {
  ambient: [0, 1],
  diffuse: [0, 1],
  specular: [0, 2],
  roughness: [0, 1],
  fresnel: [0, 5],
  facenormalsepsilon: [0, 1],
  vertexnormalsepsilon: [0, 1],
};

/** Plotly's defaults for missing or non-finite values, clamped to Plotly's attribute ranges. */
export function resolveMeshLighting(lighting?: Partial<MeshLighting> | null): MeshLighting {
  const out = { ...PLOTLY_LIGHTING };
  for (const key of Object.keys(RANGES) as (keyof MeshLighting)[]) {
    const v = lighting?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = Math.min(RANGES[key][1], Math.max(RANGES[key][0], v));
    }
  }
  return out;
}

/** Phong shininess with the highlight width of a Beckmann `roughness` (`2 / r² - 2`). */
export function shininessFromRoughness(roughness: number): number {
  const r = Math.max(roughness, 0.01);
  return 2 / (r * r) - 2;
}

/**
 * Un-project a Plotly `lightposition` (clip space) into view space through the camera's inverse
 * projection (column-major), as gl-mesh3d does. Writes `[x, y, z, 1]`, or a direction `[x, y, z,
 * 0]` when the point is at infinity.
 */
export function clipToView(
  clip: Readonly<Vec3>,
  projectionInverse: ArrayLike<number>,
  out: [number, number, number, number] = [0, 0, 0, 0],
): [number, number, number, number] {
  const e = projectionInverse;
  const [x, y, z] = clip;
  const w = e[3]! * x + e[7]! * y + e[11]! * z + e[15]!;
  const px = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
  const py = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
  const pz = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  if (Math.abs(w) < 1e-12) {
    const l = Math.hypot(px, py, pz) || 1;
    out[0] = px / l;
    out[1] = py / l;
    out[2] = pz / l;
    out[3] = 0;
  } else {
    out[0] = px / w;
    out[1] = py / w;
    out[2] = pz / w;
    out[3] = 1;
  }
  return out;
}

/** Where a directional light's `position` is given. */
export type LightSpace = 'scene' | 'camera' | 'clip';

/** One directional light of `scene.lighting`. */
export interface DirectionalLightSpec {
  /** sRGB. Default white. */
  color?: RGBA;
  /** Default 1 (Plotly units: 1 = full color). */
  intensity?: number;
  /**
   * Where the light shines from. `'scene'` (default): a point in scene space, shining toward the
   * scene's center; `'camera'`: a direction in view space (x right, y up, z toward the viewer),
   * moving with the camera; `'clip'`: Plotly's `lightposition` (clip space, un-projected).
   * Default `[1, 1, 1]` (scene), `[1, 1, 1]` (camera), `[1e5, 1e5, 0]` (clip).
   */
  position?: Vec3;
  space?: LightSpace;
  /** Cast shadows (three.js material types receive them, and the ground plane). Default false. */
  castShadow?: boolean;
}

/** `scene.lighting` (E8.7). Colors are sRGB 0–1 RGBA (parsed by the caller). */
export interface LightingSpec {
  ambient?: { color?: RGBA; intensity?: number } | null;
  directional?: readonly DirectionalLightSpec[] | null;
  hemisphere?: { skyColor?: RGBA; groundColor?: RGBA; intensity?: number; up?: Vec3 } | null;
  /**
   * Image-based lighting for the `standard` / `physical` (and `phong` / `basic` reflections)
   * material types: a built-in room (`'studio'`, `'city'`), an equirectangular image URL, or a
   * texture (e.g. an HDR loaded with three's `HDRLoader`). Plotly's model ignores it.
   */
  environment?: 'studio' | 'city' | string | Texture | null;
  /** Scales the environment's light. Default 1. */
  environmentIntensity?: number;
  /** Shadow maps of `castShadow` lights. */
  shadows?: {
    /**
     * A ground plane catching shadows: `true` at `-extent` along `up`, or its offset along `up`.
     */
    ground?: boolean | number;
    /** Half-size of the shadowed region (scene units, around the scene's center). Default 2. */
    extent?: number;
    /** Shadow map size in px. Default 1024. */
    mapSize?: number;
    /** Darkness of the ground's shadow, 0–1. Default 0.3. */
    opacity?: number;
    /** Scene up. Default `[0, 0, 1]` (Plotly scenes are z-up). */
    up?: Vec3;
  } | null;
}

/**
 * The rig used for three.js material types when a figure has no `scene.lighting`: Plotly's
 * default light (`lightposition` `(1e5, 1e5, 0)`, moving with the view) with Plotly's default
 * ambient and diffuse strengths.
 */
export const DEFAULT_LIGHTING: Readonly<LightingSpec> = Object.freeze({
  ambient: { intensity: 0.8 },
  directional: [{ position: [1e5, 1e5, 0] as Vec3, space: 'clip' as const, intensity: 0.8 }],
});

const WHITE: RGBA = [1, 1, 1, 1];

/** Lights in view space, as the Plotly shader reads them (see `mesh.glsl.ts`). */
export interface ViewLights {
  count: number;
  /** 4 floats per light: view-space position (w = 1) or direction toward the light (w = 0). */
  position: Float32Array;
  /** 3 floats per light: sRGB color × intensity. */
  color: Float32Array;
  ambient: [number, number, number];
  hemiSky: [number, number, number];
  hemiGround: [number, number, number];
  /** View-space up of the hemisphere light. */
  hemiUp: [number, number, number];
}

export function createViewLights(): ViewLights {
  return {
    count: 0,
    position: new Float32Array(0),
    color: new Float32Array(0),
    ambient: [0, 0, 0],
    hemiSky: [0, 0, 0],
    hemiGround: [0, 0, 0],
    hemiUp: [0, 0, 1],
  };
}

const v4: [number, number, number, number] = [0, 0, 0, 0];

function scaled(c: RGBA | undefined, k: number, out: number[]): void {
  const col = c ?? WHITE;
  out[0] = col[0] * k;
  out[1] = col[1] * k;
  out[2] = col[2] * k;
}

function num(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** View-space direction or position of a directional light (see {@link DirectionalLightSpec}). */
export function lightViewPosition(
  light: DirectionalLightSpec,
  camera: Camera,
  out: [number, number, number, number] = [0, 0, 0, 0],
): [number, number, number, number] {
  const space = light.space ?? 'scene';
  if (space === 'clip') {
    return clipToView(
      light.position ?? PLOTLY_LIGHTPOSITION,
      camera.projectionMatrixInverse.elements,
      out,
    );
  }
  const p = light.position ?? [1, 1, 1];
  let [x, y, z] = p;
  if (space === 'scene') {
    // Direction toward the light, rotated into view space.
    const e = camera.matrixWorldInverse.elements;
    [x, y, z] = [
      e[0]! * p[0] + e[4]! * p[1] + e[8]! * p[2],
      e[1]! * p[0] + e[5]! * p[1] + e[9]! * p[2],
      e[2]! * p[0] + e[6]! * p[1] + e[10]! * p[2],
    ];
  }
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  out[3] = 0;
  return out;
}

/**
 * The lights of `spec` in view space for the Plotly shader, scaled by the trace's `lighting`:
 * ambient and hemisphere light by `ambient`; directional lights keep their color (the shader
 * multiplies diffuse and specular). Without a spec: Plotly's single white light at
 * `lightposition` and a white ambient light.
 */
export function computeViewLights(
  spec: Readonly<LightingSpec> | null,
  lightposition: Readonly<Vec3>,
  lighting: Readonly<MeshLighting>,
  camera: Camera,
  out: ViewLights = createViewLights(),
): ViewLights {
  const lights: readonly DirectionalLightSpec[] = spec
    ? (spec.directional ?? [])
    : [{ position: [...lightposition] as Vec3, space: 'clip' }];
  if (out.position.length !== lights.length * 4) {
    out.position = new Float32Array(lights.length * 4);
    out.color = new Float32Array(lights.length * 3);
  }
  out.count = lights.length;
  const c = [0, 0, 0];
  lights.forEach((light, i) => {
    out.position.set(lightViewPosition(light, camera, v4), i * 4);
    scaled(light.color, num(light.intensity, 1), c);
    out.color.set(c, i * 3);
  });
  const ambient = spec ? spec.ambient : { intensity: 1 };
  scaled(ambient?.color, ambient ? num(ambient.intensity, 1) * lighting.ambient : 0, out.ambient);
  const hemi = spec?.hemisphere;
  const hk = hemi ? num(hemi.intensity, 1) * lighting.ambient : 0;
  scaled(hemi?.skyColor, hk, out.hemiSky);
  scaled(hemi?.groundColor ?? [0.3, 0.3, 0.3, 1], hk, out.hemiGround);
  const up = hemi?.up ?? [0, 0, 1];
  const e = camera.matrixWorldInverse.elements;
  const ux = e[0]! * up[0] + e[4]! * up[1] + e[8]! * up[2];
  const uy = e[1]! * up[0] + e[5]! * up[1] + e[9]! * up[2];
  const uz = e[2]! * up[0] + e[6]! * up[1] + e[10]! * up[2];
  const ul = Math.hypot(ux, uy, uz) || 1;
  out.hemiUp[0] = ux / ul;
  out.hemiUp[1] = uy / ul;
  out.hemiUp[2] = uz / ul;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Light rig (three.js lights for the three.js material types)
// ---------------------------------------------------------------------------------------------

function setColor(target: Color, c: RGBA | undefined): void {
  const col = c ?? WHITE;
  target.setRGB(col[0], col[1], col[2], SRGBColorSpace);
}

/** A built-in environment room, rendered into a PMREM once per renderer. */
function roomScene(kind: 'studio' | 'city'): Scene {
  const scene = new Scene();
  const box = new BoxGeometry();
  const add = (color: number, intensity: number, pos: Vec3, size: Vec3, side = 0): void => {
    const material = new MeshBasicMaterial({ side: side ? BackSide : FrontSide });
    material.color.setHex(color).multiplyScalar(intensity);
    const mesh = new Mesh(box, material);
    mesh.position.set(...pos);
    mesh.scale.set(...size);
    scene.add(mesh);
  };
  if (kind === 'studio') {
    // A grey room with a large soft box above and two side panels (z-up).
    add(0x8c8c8c, 0.6, [0, 0, 0], [12, 12, 8], 1);
    add(0xffffff, 6, [0, 0, 3.9], [6, 6, 0.1]);
    add(0xffffff, 3, [5.9, -2, 0.5], [0.1, 4, 3]);
    add(0xfff4e6, 2, [-5.9, 2, 0.5], [0.1, 4, 3]);
  } else {
    // Sky above, warm ground, a low sun and a few "buildings".
    add(0x9ec5ff, 1.4, [0, 0, 0], [40, 40, 20], 1);
    add(0x5c5044, 0.5, [0, 0, -9.9], [40, 40, 0.2]);
    add(0xfff1d6, 30, [12, -14, 3], [3, 3, 3]);
    add(0x404550, 0.4, [-12, 6, -6], [5, 5, 8]);
    add(0x505560, 0.4, [8, 12, -5], [6, 4, 10]);
  }
  return scene;
}

function disposeScene(scene: Scene): void {
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) (mesh.material as MeshBasicMaterial).dispose();
  });
  (scene.children[0] as Mesh | undefined)?.geometry.dispose();
}

const UP = new Vector3(0, 0, 1);
const tmp = new Vector3();
const tmp4 = new Vector4();

/**
 * The lights of `scene.lighting` for a 3D scene. Add {@link object} to the scene, call
 * {@link attach} once with the renderer (shadow maps, environment), and {@link setCamera} with the
 * scene's camera (lights in camera or clip space follow it). Set the rig on meshes drawn with
 * Plotly's model (`MeshPrimitive.setLightRig`) so they use the same lights.
 */
export class LightRig {
  /** three.js lights (and the ground plane): add to the scene. */
  readonly object: Group;
  #spec: LightingSpec;
  #camera: Camera | null = null;
  #ambient = new AmbientLight();
  #hemi = new HemisphereLight();
  #lights: DirectionalLight[] = [];
  #ground: Mesh<PlaneGeometry, ShadowMaterial> | null = null;
  #renderer: WebGLRenderer | null = null;
  #scene: Scene | null = null;
  #envTarget: WebGLRenderTarget | null = null;
  #envTexture: Texture | null = null;
  #invalidate: () => void = () => {};

  constructor(spec: LightingSpec = DEFAULT_LIGHTING) {
    // Camera-attached lights follow the camera before three.js collects the lights of a frame.
    const group = new Group();
    const update = group.updateMatrixWorld.bind(group);
    group.updateMatrixWorld = (force?: boolean) => {
      this.#sync();
      update(force);
    };
    group.name = 'holochart:light-rig';
    this.object = group;
    this.#spec = spec;
    this.update(spec);
  }

  /** The current spec. */
  get spec(): Readonly<LightingSpec> {
    return this.#spec;
  }

  /** The camera that camera- and clip-space lights follow. */
  setCamera(camera: Camera | null): void {
    this.#camera = camera;
  }

  /** Replace the lights. */
  update(spec: LightingSpec): void {
    this.#spec = spec;
    const g = this.object;
    const k = Math.PI;
    setColor(this.#ambient.color, spec.ambient?.color);
    this.#ambient.intensity = spec.ambient ? num(spec.ambient.intensity, 1) * k : 0;
    if (spec.ambient) g.add(this.#ambient);
    else this.#ambient.removeFromParent();
    const hemi = spec.hemisphere;
    if (hemi) {
      setColor(this.#hemi.color, hemi.skyColor);
      setColor(this.#hemi.groundColor, hemi.groundColor ?? [0.3, 0.3, 0.3, 1]);
      this.#hemi.intensity = num(hemi.intensity, 1) * k;
      this.#hemi.position.set(...(hemi.up ?? [0, 0, 1]));
      g.add(this.#hemi);
    } else this.#hemi.removeFromParent();
    const specs = spec.directional ?? [];
    const shadows = spec.shadows;
    const extent = num(shadows?.extent, 2);
    while (this.#lights.length > specs.length) {
      const light = this.#lights.pop()!;
      light.removeFromParent();
      light.dispose();
    }
    specs.forEach((s, i) => {
      const light = (this.#lights[i] ??= new DirectionalLight());
      setColor(light.color, s.color);
      light.intensity = num(s.intensity, 1) * k;
      light.castShadow = s.castShadow === true;
      if (light.castShadow) {
        const cam = light.shadow.camera;
        cam.left = cam.bottom = -extent;
        cam.right = cam.top = extent;
        cam.near = 0.01;
        cam.far = extent * 8;
        cam.updateProjectionMatrix();
        light.shadow.mapSize.setScalar(num(shadows?.mapSize, 1024));
        light.shadow.bias = -0.0005;
      }
      g.add(light);
    });
    const ground = shadows?.ground;
    if (ground !== undefined && ground !== false) {
      const up = tmp.set(...(shadows?.up ?? [0, 0, 1])).normalize();
      const mesh = (this.#ground ??= new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial()));
      mesh.material.opacity = num(shadows?.opacity, 0.3);
      mesh.receiveShadow = true;
      mesh.scale.setScalar(extent * 4);
      mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, up));
      mesh.position.copy(up).multiplyScalar(typeof ground === 'number' ? ground : -extent);
      g.add(mesh);
    } else this.#ground?.removeFromParent();
    this.#sync();
    if (this.#renderer) this.#applyRenderer();
  }

  /**
   * Bind to the renderer and scene: enables shadow maps when a light casts shadows and sets the
   * scene's environment. `invalidate` is called when an environment image has loaded.
   */
  attach(renderer: WebGLRenderer, scene: Scene, invalidate?: () => void): void {
    this.#renderer = renderer;
    this.#scene = scene;
    if (invalidate) this.#invalidate = invalidate;
    this.#applyRenderer();
  }

  /**
   * Draw again what only existed on the GPU, after the WebGL context was lost and restored: the
   * generated environment (`'studio'`, `'city'`) is a render target, which three.js cannot
   * upload again as it does buffers and textures.
   */
  restore(): void {
    if (!this.#renderer || !this.#envTarget) return;
    // Its GL objects went with the old context: there is nothing to delete.
    this.#envTarget = null;
    this.#applyRenderer();
  }

  /** The scene's environment texture (or null), once available. */
  get environment(): Texture | null {
    return this.#envTarget?.texture ?? this.#envTexture;
  }

  dispose(): void {
    this.#clearEnvironment();
    for (const light of this.#lights) light.dispose();
    this.#lights = [];
    this.#ground?.geometry.dispose();
    this.#ground?.material.dispose();
    this.object.removeFromParent();
    this.object.clear();
    this.#renderer = null;
    this.#scene = null;
  }

  #applyRenderer(): void {
    const renderer = this.#renderer!;
    if (this.#lights.some((l) => l.castShadow)) renderer.shadowMap.enabled = true;
    this.#clearEnvironment();
    const env = this.#spec.environment;
    const scene = this.#scene!;
    scene.environmentIntensity = num(this.#spec.environmentIntensity, 1);
    if (env === 'studio' || env === 'city') {
      const pmrem = new PMREMGenerator(renderer);
      const room = roomScene(env);
      this.#envTarget = pmrem.fromScene(room, 0.04);
      disposeScene(room);
      pmrem.dispose();
      scene.environment = this.#envTarget.texture;
    } else if (env instanceof Texture) {
      scene.environment = env;
    } else if (typeof env === 'string' && env) {
      const texture = new TextureLoader().load(env, () => this.#invalidate());
      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = SRGBColorSpace;
      this.#envTexture = texture;
      scene.environment = texture;
    }
  }

  #clearEnvironment(): void {
    if (this.#scene && this.#scene.environment === this.environment) this.#scene.environment = null;
    this.#envTarget?.dispose();
    this.#envTexture?.dispose();
    this.#envTarget = null;
    this.#envTexture = null;
  }

  /** Place the three.js lights: scene-space lights at their position, others from the camera. */
  #sync(): void {
    const specs = this.#spec.directional ?? [];
    const camera = this.#camera;
    const distance = num(this.#spec.shadows?.extent, 2) * 4;
    specs.forEach((s, i) => {
      const light = this.#lights[i];
      if (!light) return;
      const space = s.space ?? 'scene';
      if (space === 'scene' || !camera) {
        const p: Vec3 = space === 'clip' ? [1, 1, 1] : (s.position ?? [1, 1, 1]);
        tmp.set(p[0], p[1], p[2]);
      } else {
        camera.updateMatrixWorld();
        const [x, y, z, w] = lightViewPosition(s, camera, v4);
        // Direction toward the light in world space (from the scene's center for positions).
        tmp4.set(x, y, z, w).applyMatrix4(camera.matrixWorld);
        tmp.set(tmp4.x, tmp4.y, tmp4.z);
      }
      if (tmp.lengthSq() === 0) tmp.set(0, 0, 1);
      light.position.copy(tmp.normalize().multiplyScalar(distance));
    });
  }
}

/** Create a {@link LightRig} (default: {@link DEFAULT_LIGHTING}). */
export function createLightRig(spec?: LightingSpec): LightRig {
  return new LightRig(spec);
}
