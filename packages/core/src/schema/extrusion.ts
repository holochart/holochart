/**
 * Extrusion attributes of 2D traces (plan E8.9, E9.10) and the lit `material` attribute set shared
 * with the 3D traces (E8.7), defined once here so every trace that can be extruded declares them
 * with one spread:
 *
 * ```ts
 * schema: attr.object({ ...ownAttributes, ...extrusionAttributes }),
 * supplyDefaults(traceIn, traceOut, ctx) { …; supplyExtrusionDefaults(ctx); },
 * ```
 *
 * or, for a module whose schema must stay without them (the `basic` bundle's traces: 2.5D is a
 * full-bundle feature, like 3D), with {@link withExtrusion} where the full bundle registers it.
 *
 * - `depth` (default 0: flat, nothing changes): how far the shapes stand out of the plot plane
 *   toward the viewer — CSS px, a percentage string of each shape's own width (`'60%'`; bars: the
 *   bar width), or one number per item. Visible in perspective under `layout.view3d`; in the flat
 *   view the extruded shapes are drawn lit, seen from the front (their bevels shade the edges).
 * - `bevel.size` (px) / `bevel.segments`: rounds the front edges and the side edges.
 * - `material`: {@link litMaterialAttributes} — Plotly's lighting model (`'plotly'`, default), unlit
 *   (`'flat'`) or a three.js material type with its parameters.
 */
import { attr } from './attr.ts';
import type { ObjectNode } from './types.ts';

/**
 * `material.type` values (E8.7): Plotly's lighting model, unlit, or a three.js material.
 * @internal
 */
export const LIT_MATERIAL_TYPES = [
  'plotly',
  'flat',
  'basic',
  'lambert',
  'phong',
  'standard',
  'physical',
  'toon',
  'matcap',
] as const;

const unit = (description: string) =>
  attr.number({ min: 0, max: 1, editType: 'calc', description });
const positive = (description: string) => attr.number({ min: 0, editType: 'calc', description });
const colorParam = (description: string) => attr.color({ editType: 'calc', description });

/**
 * The `material` attribute (Holochart extension, E8.7): shared by the 3D traces
 * (`sceneMaterialAttributes`) and extruded 2D traces ({@link extrusionAttributes}). `description`
 * describes the container. Unset parameters keep the three.js material's defaults.
 * @experimental
 */
export function litMaterialAttributes(description: string) {
  return attr.object(
    {
      type: attr.enumerated({
        values: LIT_MATERIAL_TYPES,
        dflt: 'plotly',
        editType: 'calc',
        description:
          "How surfaces are shaded. `plotly`: Plotly's lighting model. `flat`: unlit, colors as given. `basic`, `lambert`, `phong`, `standard`, `physical`, `toon`, `matcap`: the three.js material of that name, lit by the lights of the scene (`scene.lighting`) or of the 2.5D view.",
      }),
      roughness: unit('Surface roughness (`standard`, `physical`). Default: `lighting.roughness`.'),
      metalness: unit('How metallic the surface is (`standard`, `physical`). Default 0.'),
      shininess: positive(
        'Sharpness of the highlights (`phong`). Default: from `lighting.roughness`.',
      ),
      specular: colorParam('Color of the highlights (`phong`). Default: `lighting.specular` gray.'),
      emissive: colorParam('Color the surface emits regardless of the lights. Default black.'),
      emissiveintensity: positive('Strength of `emissive`. Default 1.'),
      reflectivity: unit(
        'How much the environment is reflected (`basic`, `lambert`, `phong`, `physical`).',
      ),
      envmapintensity: positive(
        "Strength of the environment's light (`standard`, `physical`). Default 1.",
      ),
      clearcoat: unit('A clear lacquer layer (`physical`). Default 0.'),
      clearcoatroughness: unit('Roughness of the clear coat (`physical`). Default 0.'),
      transmission: unit('Transmission, for glass-like surfaces (`physical`). Default 0.'),
      ior: attr.number({
        min: 1,
        max: 2.333,
        editType: 'calc',
        description: 'Index of refraction (`physical`). Default 1.5.',
      }),
      thickness: positive('Thickness of transmissive volumes, scene units (`physical`).'),
      sheen: unit('Velvet-like sheen (`physical`). Default 0.'),
      sheencolor: colorParam('Color of the sheen (`physical`).'),
      sheenroughness: unit('Roughness of the sheen (`physical`). Default 1.'),
      iridescence: unit('Thin-film iridescence (`physical`). Default 0.'),
      steps: attr.integer({
        min: 2,
        max: 16,
        dflt: 3,
        editType: 'calc',
        description: 'Number of shading bands (`toon`).',
      }),
      matcap: attr.string({
        editType: 'calc',
        description:
          'URL of a matcap image (`matcap`): the surface takes its colors from it by normal direction.',
      }),
      castshadow: attr.boolean({
        dflt: false,
        editType: 'calc',
        description:
          'Cast shadows from the lights of `scene.lighting` with `castshadow` (onto three.js material types and the ground plane).',
      }),
      receiveshadow: attr.boolean({
        dflt: false,
        editType: 'calc',
        description: 'Receive shadows (three.js material types only).',
      }),
    },
    { editType: 'calc', description },
  );
}

/**
 * `depth`, `bevel` and `material` of extrudable 2D traces (plan E8.9; see the module comment).
 * Spread into a trace schema; call {@link supplyExtrusionDefaults} from its `supplyDefaults`.
 * @experimental
 */
export const extrusionAttributes = /* @__PURE__ */ (() => ({
  depth: attr.any({
    dflt: 0,
    editType: 'plot',
    description:
      "Extrusion toward the viewer (Holochart extension, 2.5D): CSS px, a percentage of each shape's width (`'60%'`), or one number per item. 0 (default) draws the trace flat. Seen in perspective with `layout.view3d`; in the flat view extruded shapes are lit from the front.",
  }),
  bevel: attr.object(
    {
      size: attr.number({
        min: 0,
        dflt: 0,
        editType: 'plot',
        description: 'Radius of the rounded front and side edges, CSS px (at most half the size).',
      }),
      segments: attr.integer({
        min: 1,
        max: 16,
        dflt: 3,
        editType: 'plot',
        description: 'Segments of each rounded edge.',
      }),
    },
    { editType: 'plot', description: 'Rounded edges of extruded shapes (with `depth`).' },
  ),
  material: litMaterialAttributes(
    'The material of extruded shapes (with `depth`): Plotly figures keep the default, `plotly`.',
  ),
}))();

/** The helpers {@link supplyExtrusionDefaults} needs from a trace's defaults context. */
interface ExtrusionDefaultsContext {
  coerce<T = unknown>(path: string, dflt?: unknown): T;
  coerceContainer(path: string): void;
}

/** Coerce `depth`, and `bevel` / `material` when the trace is extruded. @internal */
export function supplyExtrusionDefaults(ctx: ExtrusionDefaultsContext): void {
  const depth = ctx.coerce('depth');
  if (depth === 0 || depth === '0' || depth === '0%') return;
  ctx.coerceContainer('bevel');
  ctx.coerceContainer('material');
}

/** The parts of a trace module {@link withExtrusion} extends. */
interface ExtrudableModule {
  readonly schema: ObjectNode;
  // Bivariant (a method), so modules with narrower context types fit.
  supplyDefaults(traceIn: Readonly<Record<string, unknown>>, traceOut: never, ctx: never): void;
}

/**
 * `module` with {@link extrusionAttributes} added to its schema and coerced after its own
 * defaults: the full bundle registers `withExtrusion(bar)` (plan E9.10); the trace's view draws
 * `depth` (bar: `setBarExtruder`).
 * @experimental
 */
export function withExtrusion<M extends ExtrudableModule>(module: M): M {
  const { children, ...meta } = module.schema;
  return {
    ...module,
    schema: attr.object({ ...children, ...extrusionAttributes }, meta),
    supplyDefaults(traceIn, traceOut, ctx) {
      module.supplyDefaults(traceIn, traceOut, ctx);
      if ((traceOut as { visible?: unknown }).visible !== false) {
        supplyExtrusionDefaults(ctx as ExtrusionDefaultsContext);
      }
    },
  };
}
