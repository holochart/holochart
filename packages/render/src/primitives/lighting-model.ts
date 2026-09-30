/**
 * CPU mirror of the Plotly lighting model in `mesh.glsl.ts` (plan E2.11), for tests and docs. Not
 * part of the lazily loaded mesh chunk: the shader does this work at run time.
 */
import type { Vec3 } from '../precision.ts';
import type { MeshLighting } from './lighting.ts';

/**
 * CPU mirror of the shader's Cook-Torrance term (glsl-specular-cook-torrance) for unit vectors
 * `L` (to the light), `V` (to the eye) and `N`.
 */
export function cookTorrance(
  L: Readonly<Vec3>,
  V: Readonly<Vec3>,
  N: Readonly<Vec3>,
  roughness: number,
  fresnel: number,
): number {
  const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const h: Vec3 = [L[0] + V[0], L[1] + V[1], L[2] + V[2]];
  const hl = Math.hypot(...h) || 1;
  const H: Vec3 = [h[0] / hl, h[1] / hl, h[2] / hl];
  const VdotN = Math.max(dot(V, N), 0);
  const LdotN = Math.max(dot(L, N), 0);
  const NdotH = Math.max(dot(N, H), 0);
  const VdotH = Math.max(dot(V, H), 1e-6);
  const LdotH = Math.max(dot(L, H), 1e-6);
  const G = Math.min(1, (2 * NdotH * VdotN) / VdotH, (2 * NdotH * LdotN) / LdotH);
  const c2 = Math.max(NdotH, 1e-4) ** 2;
  const r2 = roughness * roughness;
  const D = Math.exp((c2 - 1) / (c2 * r2)) / (Math.PI * r2 * c2 * c2);
  return (G * (1 - VdotN) ** fresnel * D) / Math.max(Math.PI * VdotN, 1e-6);
}

/**
 * CPU mirror of Plotly's lighting of one sRGB color with one white light (unit vectors), for
 * tests and docs: `min(ambient + diffuse · max(N·L, 0), 1) · rgb + specular · clamp(CT, 0, 1)`.
 */
export function plotlyLitColor(
  rgb: Readonly<Vec3>,
  N: Readonly<Vec3>,
  L: Readonly<Vec3>,
  V: Readonly<Vec3>,
  lighting: Readonly<MeshLighting>,
): Vec3 {
  const roughness = Math.max(lighting.roughness, 1e-3);
  const NdotL = Math.max(N[0] * L[0] + N[1] * L[1] + N[2] * L[2], 0);
  const d = Math.min(lighting.ambient + lighting.diffuse * NdotL, 1);
  const s =
    lighting.specular *
    Math.min(1, Math.max(0, cookTorrance(L, V, N, roughness, lighting.fresnel)));
  return [d * rgb[0] + s, d * rgb[1] + s, d * rgb[2] + s];
}
