/**
 * Materials and lighting attributes of 3D traces and scenes (plan E8.7).
 *
 * ## Per trace (`surface`, `mesh3d`, `cone`, `streamtube`, `isosurface`, `volume`)
 *
 * - `lighting` / `lightposition`: Plotly's attributes, with plotly.js' defaults per trace type
 *   ({@link SCENE_LIGHTING_DEFAULTS}: `surface` has no normal epsilons and its light sits at
 *   `(10, 1e4, 0)`; `mesh3d`, `cone` and `streamtube` light from `(1e5, 1e5, 0)`; `isosurface` and
 *   `volume` default `facenormalsepsilon` to 0).
 * - `material` (Holochart extension): `type` (`'plotly'`, Plotly's lighting model, the default;
 *   `'flat'`, unlit; or a three.js material: `'basic'`, `'lambert'`, `'phong'`, `'standard'`,
 *   `'physical'`, `'toon'`, `'matcap'`), the three.js parameters in Plotly's lowercase style
 *   (`roughness`, `metalness`, `emissiveintensity` → `emissiveIntensity`, …), `steps` (toon
 *   bands), `matcap` (an image URL) and the shadow flags `castshadow` / `receiveshadow`.
 *
 * A trace module spreads {@link sceneLightingAttributes} and {@link sceneMaterialAttributes} into
 * its schema, calls {@link supplySceneLightingDefaults} from `supplyDefaults`, and gives the mesh
 * primitive the fields {@link sceneMeshLighting} returns:
 *
 * ```ts
 * schema: attr.object({ ...sceneLightingAttributes('mesh3d'), ...sceneMaterialAttributes, … }),
 * supplyDefaults(traceIn, traceOut, ctx) { …; supplySceneLightingDefaults(ctx); },
 * // in the view:
 * mesh.update({ positions, …, ...sceneMeshLighting(ctx.trace, () => ctx.invalidate?.()) });
 * scene.useLightRig(mesh); // the scene's `lighting` rig (see `scene.ts`)
 * ```
 *
 * ## Per scene (`layout.sceneN.lighting`, Holochart extension)
 *
 * {@link sceneLightRigAttributes}: the scene's lights, a render `LightRig` (`createLightRig`):
 * `ambient`, `directional[]` (`color`, `intensity`, `position`, `space`, `castshadow`),
 * `hemisphere`, `environment` (`'studio'`, `'city'` or an image URL), `environmentintensity` and
 * `shadows` (`ground` plane, `extent`, `mapsize`, `opacity`). Unset (the default), meshes drawn
 * with Plotly's model keep their own `lightposition` light, as in Plotly, and three.js material
 * types are lit by the render default rig (Plotly's default light). Set (in the figure or the
 * template's `layout.scene`, which applies to every scene), the rig lights every mesh of the
 * scene: Plotly's model then scales the rig's lights by the trace's `lighting` coefficients.
 * {@link supplySceneLightingLayout} defaults it; {@link sceneLightingSpec} converts it for render.
 */
import {
  attr,
  coerceContainer,
  isPlainObject,
  LIT_MATERIAL_TYPES,
  litMaterialAttributes,
  toRGBA,
  type FullTrace,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import type {
  DirectionalLightSpec,
  LightingSpec,
  MeshData,
  MeshLighting,
  MeshMaterialSpec,
  MeshMaterialType,
  RGBA,
  Vec3,
} from '@mk7s/holochart-render';
import { SRGBColorSpace, TextureLoader, type Texture } from 'three';

/** Trace types with Plotly `lighting` / `lightposition` attributes. @experimental */
export type SceneLightingTrace =
  'surface' | 'mesh3d' | 'cone' | 'streamtube' | 'isosurface' | 'volume';

/** Plotly's `lighting` / `lightposition` defaults of one trace type. @experimental */
export interface SceneLightingDefaults {
  /** `lighting` defaults; the normal epsilons are declared only when given. */
  readonly lighting: Readonly<Partial<MeshLighting>>;
  readonly lightposition: Readonly<Vec3>;
}

const LIGHTING_BASE = { ambient: 0.8, diffuse: 0.8, specular: 0.05, roughness: 0.5, fresnel: 0.2 };
const MESH_DEFAULTS: SceneLightingDefaults = {
  lighting: { ...LIGHTING_BASE, vertexnormalsepsilon: 1e-12, facenormalsepsilon: 1e-6 },
  lightposition: [1e5, 1e5, 0],
};
const VOLUME_DEFAULTS: SceneLightingDefaults = {
  lighting: { ...LIGHTING_BASE, vertexnormalsepsilon: 1e-12, facenormalsepsilon: 0 },
  lightposition: [1e5, 1e5, 0],
};

/** plotly.js' `lighting` / `lightposition` defaults per trace type. @internal */
export const SCENE_LIGHTING_DEFAULTS: Readonly<Record<SceneLightingTrace, SceneLightingDefaults>> =
  {
    surface: { lighting: LIGHTING_BASE, lightposition: [10, 1e4, 0] },
    mesh3d: MESH_DEFAULTS,
    cone: MESH_DEFAULTS,
    streamtube: MESH_DEFAULTS,
    isosurface: VOLUME_DEFAULTS,
    volume: VOLUME_DEFAULTS,
  };

/** The `lighting` coefficients, in order. */
const LIGHTING_KEYS: readonly (keyof MeshLighting)[] = [
  'ambient',
  'diffuse',
  'specular',
  'roughness',
  'fresnel',
  'vertexnormalsepsilon',
  'facenormalsepsilon',
];

/** Declare one `lighting` coefficient (when `dflts` has a default for it). */
function lightingCoefficient(
  out: Record<string, ReturnType<typeof attr.number>>,
  dflts: Readonly<Partial<MeshLighting>>,
  key: keyof MeshLighting,
  max: number,
  description: string,
): void {
  const dflt = dflts[key];
  if (dflt === undefined) return;
  out[key] = attr.number({ min: 0, max, dflt, editType: 'calc', description });
}

/**
 * Plotly's `lighting` and `lightposition` trace attributes with the defaults of `defaults` (a
 * trace type of {@link SCENE_LIGHTING_DEFAULTS} or custom defaults). Spread into a trace schema.
 * @experimental
 */
export function sceneLightingAttributes(defaults: SceneLightingTrace | SceneLightingDefaults) {
  const d = typeof defaults === 'string' ? SCENE_LIGHTING_DEFAULTS[defaults] : defaults;
  const lighting: Record<string, ReturnType<typeof attr.number>> = {};
  lightingCoefficient(
    lighting,
    d.lighting,
    'ambient',
    1,
    'Ambient light: the share of the color shown whatever the direction of the light.',
  );
  lightingCoefficient(
    lighting,
    d.lighting,
    'diffuse',
    1,
    'Diffuse light: the share of the color lit by the light (Lambert).',
  );
  lightingCoefficient(
    lighting,
    d.lighting,
    'specular',
    2,
    'Specular highlights: the light reflected toward the eye.',
  );
  lightingCoefficient(
    lighting,
    d.lighting,
    'roughness',
    1,
    'Roughness of the surface: the spread of the specular highlights.',
  );
  lightingCoefficient(
    lighting,
    d.lighting,
    'fresnel',
    5,
    'Fresnel reflection: how much more light surfaces reflect at grazing angles.',
  );
  lightingCoefficient(
    lighting,
    d.lighting,
    'vertexnormalsepsilon',
    1,
    'Vertex normals ignore triangle normals shorter than this (tiny triangles do not skew smooth shading).',
  );
  lightingCoefficient(
    lighting,
    d.lighting,
    'facenormalsepsilon',
    1,
    'Triangles whose normal is shorter than this get no normal in flat shading (degenerate triangles).',
  );
  const axis = (i: 0 | 1 | 2, name: string) =>
    attr.number({
      min: -1e5,
      max: 1e5,
      dflt: d.lightposition[i],
      editType: 'calc',
      description: `${name} of the light, in clip space (moves with the view; ±1 is the edge of the view, 1e5 far away).`,
    });
  return {
    lighting: attr.object(lighting, {
      editType: 'calc',
      description:
        "Plotly's lighting model: coefficients of the ambient, diffuse and specular light. With `scene.lighting`, they scale the scene's lights.",
    }),
    lightposition: attr.object(
      { x: axis(0, 'x'), y: axis(1, 'y'), z: axis(2, 'z') },
      {
        editType: 'calc',
        description:
          "Position of the light (Plotly's model, without `scene.lighting`), in clip space: it moves with the view.",
      },
    ),
  };
}

/** `material.type` values (core's, shared with extruded 2D traces). @internal */
export const SCENE_MATERIAL_TYPES: readonly MeshMaterialType[] = LIT_MATERIAL_TYPES;

/** Material attribute → three.js material property (only where the names differ). */
const THREE_PARAM_NAMES: Readonly<Record<string, string>> = {
  emissiveintensity: 'emissiveIntensity',
  clearcoatroughness: 'clearcoatRoughness',
  sheencolor: 'sheenColor',
  sheenroughness: 'sheenRoughness',
  envmapintensity: 'envMapIntensity',
};

/**
 * The `material` trace attribute (Holochart extension, E8.7): core's `litMaterialAttributes`,
 * shared with extruded 2D traces. Spread into a trace schema. Unset parameters keep the three.js
 * material's defaults (seeded from Plotly's `lighting`: `roughness`, and `shininess` /
 * `specular` for `phong`).
 * @experimental
 */
export const sceneMaterialAttributes = /* @__PURE__ */ (() => ({
  material: litMaterialAttributes(
    'The material of the surface (Holochart extension). Plotly figures keep the default, `plotly`.',
  ),
}))();

/**
 * Coerce `lighting`, `lightposition` and `material` (call from a 3D trace's `supplyDefaults`).
 * @experimental
 */
export function supplySceneLightingDefaults(ctx: TraceDefaultsContext): void {
  ctx.coerceContainer('lighting');
  ctx.coerceContainer('lightposition');
  if (ctx.coerce<string>('material.type') === undefined) return;
  ctx.coerceContainer('material');
}

const textures = new Map<string, { texture: Texture; listeners: Set<() => void> }>();

/** A matcap image, loaded once per URL; `onLoad` is called when it arrives. */
function sceneMatcapTexture(url: string, onLoad?: () => void): Texture {
  let entry = textures.get(url);
  if (!entry) {
    const listeners = new Set<() => void>();
    const texture = new TextureLoader().load(url, () => {
      for (const fn of listeners) fn();
      listeners.clear();
    });
    texture.colorSpace = SRGBColorSpace;
    entry = { texture, listeners };
    textures.set(url, entry);
  }
  if (onLoad && !entry.texture.image) entry.listeners.add(onLoad);
  return entry.texture;
}

function vec3(v: unknown, fallback: Readonly<Vec3>): Vec3 {
  const o = isPlainObject(v) ? v : {};
  const n = (k: string, i: number): number =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) ? o[k] : fallback[i]!;
  return [n('x', 0), n('y', 1), n('z', 2)];
}

/** The material spec of a defaulted trace (null: Plotly's model). @internal */
export function sceneMaterialSpec(
  trace: Readonly<Record<string, unknown>>,
  onTextureLoad?: () => void,
): MeshMaterialSpec | null {
  const m = trace['material'];
  if (!isPlainObject(m)) return null;
  const type = m['type'] as MeshMaterialType | undefined;
  if (!type || type === 'plotly') return null;
  const spec: MeshMaterialSpec = { type };
  for (const [key, value] of Object.entries(m)) {
    if (key === 'type' || key === 'castshadow' || key === 'receiveshadow' || value === undefined) {
      continue;
    }
    if (key === 'matcap') {
      if (typeof value === 'string' && value)
        spec.matcap = sceneMatcapTexture(value, onTextureLoad);
      continue;
    }
    const name = THREE_PARAM_NAMES[key] ?? key;
    if (typeof value === 'string') {
      const rgba = toRGBA(value);
      if (rgba) spec[name] = rgba;
    } else spec[name] = value;
  }
  return spec;
}

/**
 * The mesh primitive's lighting fields of a defaulted trace: Plotly's `lighting` /
 * `lightposition`, `material` (null for Plotly's model) and the shadow flags. `onTextureLoad` is
 * called when a `material.matcap` image has loaded (request a frame).
 * @experimental
 */
export function sceneMeshLighting(
  trace: Readonly<FullTrace | Record<string, unknown>>,
  onTextureLoad?: () => void,
): Pick<MeshData, 'lighting' | 'lightposition' | 'material' | 'castShadow' | 'receiveShadow'> {
  const t = trace as Record<string, unknown>;
  const l = isPlainObject(t['lighting']) ? t['lighting'] : {};
  const lighting: Partial<MeshLighting> = {};
  for (const key of LIGHTING_KEYS) {
    const v = l[key];
    if (typeof v === 'number') lighting[key] = v;
  }
  const m = isPlainObject(t['material']) ? t['material'] : {};
  return {
    lighting,
    lightposition: vec3(t['lightposition'], SCENE_LIGHTING_DEFAULTS.mesh3d.lightposition),
    material: sceneMaterialSpec(t, onTextureLoad),
    castShadow: m['castshadow'] === true,
    receiveShadow: m['receiveshadow'] === true,
  };
}

// ---------------------------------------------------------------------------------------------
// `layout.sceneN.lighting`
// ---------------------------------------------------------------------------------------------

const intensity = (dflt: number, description: string) =>
  attr.number({ min: 0, dflt, editType: 'plot', description });

const lightVector = (description: string) =>
  attr.object(
    {
      x: attr.number({ editType: 'plot', description: 'x component.' }),
      y: attr.number({ editType: 'plot', description: 'y component.' }),
      z: attr.number({ editType: 'plot', description: 'z component.' }),
    },
    { editType: 'plot', description },
  );

/** `layout.sceneN.lighting` (Holochart extension): the scene's light rig. @internal */
export const sceneLightRigAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ambient: attr.object(
        {
          color: attr.color({ dflt: '#fff', editType: 'plot', description: 'Ambient color.' }),
          intensity: intensity(0.8, 'Ambient intensity (1: the full color).'),
        },
        { editType: 'plot', description: 'Light reaching every surface from every direction.' },
      ),
      directional: attr.items(
        {
          visible: attr.boolean({
            dflt: true,
            editType: 'plot',
            description: 'Whether this light shines.',
          }),
          color: attr.color({ dflt: '#fff', editType: 'plot', description: 'Light color.' }),
          intensity: intensity(0.8, 'Light intensity (1: the full color).'),
          position: lightVector(
            'Where the light shines from (see `space`). Default `(1, 1, 1)` (`(1e5, 1e5, 0)` in clip space).',
          ),
          space: attr.enumerated({
            values: ['scene', 'camera', 'clip'],
            dflt: 'scene',
            editType: 'plot',
            description:
              "`scene`: a direction in scene units, fixed to the data (the light shines from `position` toward the scene's center). `camera`: a direction in view space (x right, y up, z toward the viewer), moving with the view. `clip`: Plotly's `lightposition` space, moving with the view.",
          }),
          castshadow: attr.boolean({
            dflt: false,
            editType: 'plot',
            description:
              'Cast shadows (from traces with `material.castshadow`, onto three.js material types with `material.receiveshadow` and the ground plane).',
          }),
        },
        {
          itemName: 'light',
          editType: 'plot',
          description:
            "Directional lights (like the sun). Default: one light at Plotly's default `lightposition` (clip space `(1e5, 1e5, 0)`); `[]` for none.",
        },
      ),
      hemisphere: attr.object(
        {
          skycolor: attr.color({
            dflt: '#fff',
            editType: 'plot',
            description: 'Color from above.',
          }),
          groundcolor: attr.color({
            dflt: '#4d4d4d',
            editType: 'plot',
            description: 'Color from below.',
          }),
          intensity: intensity(
            0.5,
            'Intensity. The hemisphere light is on when `hemisphere` is given.',
          ),
        },
        {
          editType: 'plot',
          description:
            "Sky and ground light blended by the surfaces' orientation to the scene's z axis.",
        },
      ),
      environment: attr.string({
        editType: 'plot',
        description:
          "Image-based lighting and reflections for the `standard`, `physical`, `phong` and `basic` material types: `'studio'`, `'city'` (built-in rooms) or the URL of an equirectangular image.",
      }),
      environmentintensity: intensity(1, "Strength of the environment's light."),
      shadows: attr.object(
        {
          ground: attr.boolean({
            dflt: false,
            editType: 'plot',
            description: "A ground plane catching shadows, below the scene's axis box.",
          }),
          extent: attr.number({
            min: 0,
            editType: 'plot',
            description:
              'Half-size of the shadowed region, scene units. Default: large enough for the axis box.',
          }),
          mapsize: attr.integer({
            min: 64,
            max: 8192,
            dflt: 1024,
            editType: 'plot',
            description: 'Shadow map size, px.',
          }),
          opacity: attr.number({
            min: 0,
            max: 1,
            dflt: 0.3,
            editType: 'plot',
            description: "Darkness of the ground plane's shadows.",
          }),
        },
        { editType: 'plot', description: 'Shadows of lights with `castshadow`.' },
      ),
    },
    {
      editType: 'plot',
      description:
        "The scene's lights (Holochart extension). Unset, traces are lit as in Plotly (each by its `lightposition`); set, these lights light every trace of the scene (Plotly's model scales them by the trace's `lighting`).",
    },
  ))();

/**
 * Default `scene.lighting` when the figure or the template gives it (else it stays unset: Plotly's
 * per-trace lights). `directional` defaults to one Plotly light only when not given; `hemisphere`
 * is kept only when given. Called from the scene defaults.
 */
export function supplySceneLightingLayout(
  input: Readonly<Record<string, unknown>>,
  template: Readonly<Record<string, unknown>> | undefined,
  out: Record<string, unknown>,
): void {
  const lIn = isPlainObject(input['lighting']) ? input['lighting'] : undefined;
  const lT = isPlainObject(template?.['lighting']) ? template['lighting'] : undefined;
  if (!lIn && !lT) return;
  const full = coerceContainer(sceneLightRigAttributes, lIn, {}, { template: lT });
  const given = (key: string): boolean => lIn?.[key] != null || lT?.[key] != null;
  if (!given('directional')) {
    full['directional'] = [
      coerceContainer(
        sceneLightRigAttributes.children.directional.item,
        { space: 'clip', position: { x: 1e5, y: 1e5, z: 0 } },
        {},
      ),
    ];
  }
  if (!given('hemisphere')) delete full['hemisphere'];
  out['lighting'] = full;
}

function rgba(v: unknown): RGBA | undefined {
  return typeof v === 'string' ? (toRGBA(v) ?? undefined) : undefined;
}

/**
 * The render `LightingSpec` of a defaulted `scene.lighting` (null when unset), for a scene whose
 * axis box has the aspect ratio `aspect` (scene units; places the ground plane and sizes the
 * shadowed region).
 * @internal
 */
export function sceneLightingSpec(
  lighting: unknown,
  aspect: Readonly<Vec3> = [1, 1, 1],
): LightingSpec | null {
  if (!isPlainObject(lighting)) return null;
  const obj = (k: string): Record<string, unknown> =>
    isPlainObject(lighting[k]) ? lighting[k] : {};
  const num = (o: Record<string, unknown>, k: string, d: number): number =>
    typeof o[k] === 'number' ? o[k] : d;
  const ambient = obj('ambient');
  const lights = Array.isArray(lighting['directional']) ? lighting['directional'] : [];
  const directional: DirectionalLightSpec[] = [];
  let shadows = false;
  for (const light of lights) {
    if (!isPlainObject(light) || light['visible'] === false) continue;
    const space = (light['space'] as DirectionalLightSpec['space']) ?? 'scene';
    const p = isPlainObject(light['position']) ? light['position'] : {};
    const given = ['x', 'y', 'z'].some((k) => typeof p[k] === 'number');
    const spec: DirectionalLightSpec = {
      color: rgba(light['color']),
      intensity: num(light, 'intensity', 0.8),
      space,
      castShadow: light['castshadow'] === true,
    };
    if (given) spec.position = vec3(p, [0, 0, 0]);
    shadows ||= spec.castShadow === true;
    directional.push(spec);
  }
  const out: LightingSpec = {
    ambient: { color: rgba(ambient['color']), intensity: num(ambient, 'intensity', 0.8) },
    directional,
    environmentIntensity: num(lighting, 'environmentintensity', 1),
  };
  if (isPlainObject(lighting['hemisphere'])) {
    const h = obj('hemisphere');
    out.hemisphere = {
      skyColor: rgba(h['skycolor']),
      groundColor: rgba(h['groundcolor']),
      intensity: num(h, 'intensity', 0.5),
      up: [0, 0, 1],
    };
  }
  const env = lighting['environment'];
  if (typeof env === 'string' && env) out.environment = env;
  const s = obj('shadows');
  const [ax, ay, az] = aspect;
  const extent = num(s, 'extent', (Math.hypot(ax, ay, az) / 2) * 1.25);
  if (shadows || s['ground'] === true) {
    out.shadows = {
      ground: s['ground'] === true ? -az / 2 - 1e-3 : false,
      extent,
      mapSize: num(s, 'mapsize', 1024),
      opacity: num(s, 'opacity', 0.3),
      up: [0, 0, 1],
    };
  }
  return out;
}
