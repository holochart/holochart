/**
 * GPU limits of the device (backlog S2.2): how large a texture the WebGL context accepts.
 *
 * A texture larger than the device's limit is silently incomplete: it samples as black. Read the
 * limits once per render root ({@link RenderRoot.capabilities}, handed to primitives as
 * `context.capabilities`) and check data-sized textures against them with {@link fitsTexture}
 * instead of assuming a size.
 *
 * Float textures need no check: every float texture holochart samples is nearest-filtered, which
 * WebGL 2 guarantees; only linear filtering (`OES_texture_float_linear`) and rendering to them
 * (`EXT_color_buffer_float`) are optional, and nothing uses either.
 */
import type { WebGLRenderer } from 'three';

export interface GpuCapabilities {
  /** Largest width or height of a 2D texture, in texels (`MAX_TEXTURE_SIZE`). */
  readonly maxTextureSize: number;
  /** Largest width, height or depth of a 3D texture (`MAX_3D_TEXTURE_SIZE`). */
  readonly max3DTextureSize: number;
}

/**
 * What holds on every WebGL 2 device at the size holochart was written against: used when the
 * renderer cannot say (a test double) and by primitives constructed without capabilities.
 */
export const ASSUMED_GPU_CAPABILITIES: GpuCapabilities = {
  maxTextureSize: 4096,
  max3DTextureSize: 2048,
};

/** Ask the renderer's context for its limits (a lost context answers null: the assumption). */
export function readGpuCapabilities(
  renderer: Partial<Pick<WebGLRenderer, 'capabilities' | 'getContext'>>,
): GpuCapabilities {
  const gl = renderer.getContext?.() as Partial<WebGL2RenderingContext> | undefined;
  const max3d = gl?.getParameter?.(gl.MAX_3D_TEXTURE_SIZE!) as number | null | undefined;
  return {
    maxTextureSize:
      renderer.capabilities?.maxTextureSize || ASSUMED_GPU_CAPABILITIES.maxTextureSize,
    max3DTextureSize: max3d || ASSUMED_GPU_CAPABILITIES.max3DTextureSize,
  };
}

const warned = new Set<string>();

/**
 * Whether a `width × height` texture (`× depth` for a 3D one) fits the device. When it does not,
 * warns once per `what` and size, naming the limit; the caller then draws nothing.
 */
export function fitsTexture(
  capabilities: GpuCapabilities | undefined,
  what: string,
  width: number,
  height: number,
  depth?: number,
): boolean {
  const caps = capabilities ?? ASSUMED_GPU_CAPABILITIES;
  const max = depth === undefined ? caps.maxTextureSize : caps.max3DTextureSize;
  if (Math.max(width, height, depth ?? 0) <= max) return true;
  const size = [width, height, ...(depth === undefined ? [] : [depth])].join('×');
  const message = `[holochart] ${what}: ${size} is larger than this GPU's textures (${max} per side); not drawn.`;
  if (!warned.has(message)) console.warn(message);
  warned.add(message);
  return false;
}
