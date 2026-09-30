/**
 * Blending of the 3D line and point primitives (plan E14.2), part of the lazily loaded 3D chunk.
 *
 * - **Opaque** content (every color and opacity at 1, the usual scatter3d): depth write on, depth
 *   test on, no blending, and **alpha to coverage**: the anti-aliasing coverage the shaders compute
 *   becomes the MSAA sample mask, so edges stay smooth while depth is written per sample. Lines,
 *   sprites, spheres and meshes then occlude each other correctly in any draw order, with no halo
 *   where an anti-aliased edge would otherwise write depth over what is drawn later behind it.
 *   Without MSAA (`antialias: false`) the edges are aliased but still correct. The destination
 *   alpha is kept (the canvas stays opaque where it was).
 * - **Translucent** content: straight-alpha blending in the transparent pass, no depth write (so
 *   translucent items never hide each other), optionally depth-sorted back to front (see
 *   `depth-sort.ts`).
 */
import { CustomBlending, NormalBlending, OneFactor, ZeroFactor, type Material } from 'three';
import type { Colorscale } from '../colorscale/lut.ts';
import type { ColorInput, ScalarInput } from '../types.ts';

/** How a 3D primitive blends: from its data (`'auto'`), or forced. */
export type Blend3D = 'auto' | 'opaque' | 'translucent';

/** Switch `material` between the opaque and translucent setups (see the module docs). */
export function applyBlend3D(material: Material, opaque: boolean): void {
  if (material.alphaToCoverage !== opaque) material.needsUpdate = true;
  material.alphaToCoverage = opaque;
  material.transparent = !opaque;
  material.depthWrite = opaque;
  if (opaque) {
    material.blending = CustomBlending;
    material.blendSrc = OneFactor;
    material.blendDst = ZeroFactor;
    material.blendSrcAlpha = ZeroFactor;
    material.blendDstAlpha = OneFactor;
  } else {
    material.blending = NormalBlending;
  }
}

/** Whether every color of `input` is fully opaque. */
export function colorsOpaque(input: ColorInput | null | undefined): boolean {
  if (!input) return true;
  if (!(input instanceof Float32Array)) return input[3] >= 1;
  for (let i = 3; i < input.length; i += 4) if (!(input[i]! >= 1)) return false;
  return true;
}

/** Whether every value of an opacity input is at least 1. */
export function opacitiesOpaque(input: ScalarInput | ArrayLike<number>): boolean {
  if (typeof input === 'number') return input >= 1;
  for (let i = 0; i < input.length; i++) if (!(input[i]! >= 1)) return false;
  return true;
}

/** Whether every stop of a colorscale is fully opaque. */
export function colorscaleOpaque(scale: Colorscale | null | undefined): boolean {
  return !scale || scale.every((stop) => stop[1][3] >= 1);
}

/** Resolve a {@link Blend3D} setting against whether the data is opaque. */
export function isOpaque(blend: Blend3D, dataOpaque: boolean): boolean {
  return blend === 'auto' ? dataOpaque : blend === 'opaque';
}
