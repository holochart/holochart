import type { Object3D } from 'three';

/** A single picking hit. */
export interface PickResult {
  /** Index of the trace the hit object belongs to. */
  traceIndex: number;
  /** Index of the point / instance / vertex within the trace. */
  pointIndex: number;
  /** Distance from the request position, in CSS px. */
  distance: number;
}

/** A GPU pick query. */
export interface GpuPickRequest {
  /** CSS px from the container's left edge. */
  x: number;
  /** CSS px from the container's top edge. */
  y: number;
  /** Search radius in CSS px (default 0: the single pixel under the cursor). */
  radius?: number;
}

/**
 * GPU ID picker for 3D content (ADR-010: CPU spatial indexes for 2D, GPU ID picking for 3D meshes
 * and dense 3D markers, where projecting every point to screen space on the CPU per hover is too
 * expensive and depth/occlusion must match what is rendered).
 *
 * Intended design:
 * - Each pickable object is registered with a numeric id; its pick material writes the id,
 *   encoded with {@link encodePickId}, as an unlit RGB color (instanced markers add the instance
 *   index so every point gets its own id range).
 * - On `pick`, render only pickables into a small (e.g. `(2r+1)²`) render target centred on the
 *   cursor, using a camera view offset / scissor so the GPU cost is proportional to the window,
 *   not the canvas.
 * - Read back asynchronously with `WebGLRenderer.readRenderTargetPixelsAsync` (three r186; PBO +
 *   `fenceSync` under the hood) so hover never stalls the pipeline; decode each pixel with
 *   {@link decodePickId}, and sort hits by distance from the window centre.
 */
export interface GpuPicker {
  /** Resolve the hits around a position, nearest first. */
  pick(request: GpuPickRequest): Promise<PickResult[]>;
  /** Make `object` pickable under `id` (must fit in 24 bits, see {@link encodePickId}). */
  register(id: number, object: Object3D, traceIndex: number): void;
  /** Stop picking the object registered under `id`. */
  unregister(id: number): void;
  /** Release GPU resources and all registrations. */
  dispose(): void;
}

/** Largest encodable pick id: 24 bits of color, minus the reserved background value 0. */
export const MAX_PICK_ID = 0xfffffe;

/**
 * Encode a pick id as normalized RGB floats (0–1), e.g. for a pick material's color uniform or an
 * instanced color attribute. The id is stored as `id + 1` so that the cleared background (black,
 * 0) decodes as "no hit".
 *
 * @throws RangeError if `id` is not an integer in `[0, MAX_PICK_ID]`.
 */
export function encodePickId(id: number): Float32Array;
export function encodePickId<T extends Float32Array | number[]>(
  id: number,
  out: T,
  offset?: number,
): T;
export function encodePickId(
  id: number,
  out: Float32Array | number[] = new Float32Array(3),
  offset = 0,
): Float32Array | number[] {
  if (!Number.isInteger(id) || id < 0 || id > MAX_PICK_ID) {
    throw new RangeError(`pick id out of range [0, ${MAX_PICK_ID}]: ${id}`);
  }
  const v = id + 1;
  out[offset] = ((v >> 16) & 0xff) / 255;
  out[offset + 1] = ((v >> 8) & 0xff) / 255;
  out[offset + 2] = (v & 0xff) / 255;
  return out;
}

/**
 * Decode a pick id from read-back RGB bytes (0–255). Returns -1 for the background (0, 0, 0).
 */
export function decodePickId(r: number, g: number, b: number): number {
  return (((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) - 1;
}

/**
 * Create a GPU picker. Currently a stub (E2.13, deferred): registrations are tracked, but `pick`
 * rejects. 3D charts should treat a rejected pick as "no hover" until the real implementation
 * lands.
 */
export function createGpuPicker(): GpuPicker {
  const registry = new Map<number, { object: Object3D; traceIndex: number }>();
  return {
    pick(): Promise<PickResult[]> {
      return Promise.reject(new Error('GPU picking not implemented yet (E2.13, deferred)'));
    },
    register(id, object, traceIndex) {
      if (!Number.isInteger(id) || id < 0 || id > MAX_PICK_ID) {
        throw new RangeError(`pick id out of range [0, ${MAX_PICK_ID}]: ${id}`);
      }
      registry.set(id, { object, traceIndex });
    },
    unregister(id) {
      registry.delete(id);
    },
    dispose() {
      registry.clear();
    },
  };
}
