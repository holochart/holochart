import {
  createLazyMeshPrimitive,
  createRenderRoot,
  type Colorscale,
  type LazyMeshPrimitive,
  type MeshInput,
  type RenderRoot,
  type Viewport,
} from '@mk7s/holochart-render';

/**
 * Helpers for the 3D mesh `_dev` examples (plan E2.11): indexed test shapes and a grid of 3D
 * viewports with fixed, z-up cameras (Plotly scenes are z-up), so every panel renders the same
 * frame on every run.
 */

export interface MeshShape {
  positions: Float32Array;
  indices: Uint32Array;
  /** One value per vertex (e.g. height), for intensity. */
  values: Float32Array;
}

/** A height field `z = f(x, y)` over [-1, 1]², `n × n` cells. Values are the heights. */
export function surfaceGrid(n: number, f: (x: number, y: number) => number): MeshShape {
  const count = (n + 1) * (n + 1);
  const positions = new Float32Array(count * 3);
  const values = new Float32Array(count);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const x = (i / n) * 2 - 1;
      const y = (j / n) * 2 - 1;
      const z = f(x, y);
      positions.set([x, y, z], k * 3);
      values[k] = z;
    }
  }
  const indices = new Uint32Array(n * n * 6);
  let o = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      indices.set([a, b, d, a, d, c], o);
      o += 6;
    }
  }
  return { positions, indices, values };
}

/** A torus around the z axis (radii `R`, `r`), `nu × nv` cells. Values are the z coordinates. */
export function torus(R: number, r: number, nu: number, nv: number): MeshShape {
  const count = nu * nv;
  const positions = new Float32Array(count * 3);
  const values = new Float32Array(count);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const u = (i / nu) * Math.PI * 2;
      const v = (j / nv) * Math.PI * 2;
      const k = j * nu + i;
      const z = r * Math.sin(v);
      positions.set(
        [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), z],
        k * 3,
      );
      values[k] = z;
    }
  }
  const indices = new Uint32Array(count * 6);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * nu + i;
      const b = j * nu + ((i + 1) % nu);
      const c = ((j + 1) % nv) * nu + i;
      const d = ((j + 1) % nv) * nu + ((i + 1) % nu);
      indices.set([a, b, d, a, d, c], (j * nu + i) * 6);
    }
  }
  return { positions, indices, values };
}

/** A UV sphere of radius `r` around `center`. Values are the z coordinates (relative). */
export function sphere(
  r: number,
  center: [number, number, number] = [0, 0, 0],
  segments = 32,
  rings = 16,
): MeshShape {
  const count = (rings + 1) * (segments + 1);
  const positions = new Float32Array(count * 3);
  const values = new Float32Array(count);
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * Math.PI;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const k = j * (segments + 1) + i;
      const z = r * Math.cos(phi);
      positions.set(
        [
          center[0] + r * Math.sin(phi) * Math.cos(theta),
          center[1] + r * Math.sin(phi) * Math.sin(theta),
          center[2] + z,
        ],
        k * 3,
      );
      values[k] = z;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + segments + 1;
      if (j > 0) indices.push(a, b, a + 1);
      if (j < rings - 1) indices.push(a + 1, b, b + 1);
    }
  }
  return { positions, indices: new Uint32Array(indices), values };
}

/** Viridis (sRGB 0–1). */
export const VIRIDIS: Colorscale = [
  [0, [0.267, 0.005, 0.329, 1]],
  [0.25, [0.231, 0.322, 0.545, 1]],
  [0.5, [0.129, 0.569, 0.549, 1]],
  [0.75, [0.369, 0.788, 0.384, 1]],
  [1, [0.992, 0.906, 0.145, 1]],
];

/** Plotly's default trace blue. */
export const BLUE = [0.122, 0.467, 0.706, 1] as const;

export interface MeshGrid {
  root: RenderRoot;
  viewports: Viewport[];
  meshes: LazyMeshPrimitive[];
  /** Add a mesh to panel `i`. */
  add(i: number, data: MeshInput): LazyMeshPrimitive;
  /** Resolves once every mesh has loaded and the frame is rendered. */
  ready(): Promise<void>;
  dispose(): void;
}

/**
 * `cols × rows` 3D viewports filling `el`, each with a perspective camera at `eye` looking at the
 * origin (z-up).
 */
export function meshGrid(
  el: HTMLElement,
  cols: number,
  rows: number,
  eye: [number, number, number] = [3.1, -3.7, 2.6],
): MeshGrid {
  const root = createRenderRoot(el, { background: [1, 1, 1, 1] });
  const viewports: Viewport[] = [];
  const layout = (width: number, height: number) => {
    const w = width / cols;
    const h = height / rows;
    viewports.forEach((v, i) =>
      v.setRect({ x: (i % cols) * w, y: Math.floor(i / cols) * h, width: w, height: h }),
    );
  };
  for (let i = 0; i < cols * rows; i++) {
    const v = root.addViewport({ kind: '3d', rect: { x: 0, y: 0, width: 1, height: 1 }, fov: 30 });
    const c = v.camera;
    c.up.set(0, 0, 1);
    c.position.set(...eye);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    viewports.push(v);
  }
  layout(root.size.width, root.size.height);
  const off = root.on('resize', (s) => layout(s.width, s.height));
  const meshes: LazyMeshPrimitive[] = [];
  return {
    root,
    viewports,
    meshes,
    add(i, data) {
      const mesh = createLazyMeshPrimitive(root.context, data);
      viewports[i]!.add(mesh);
      meshes.push(mesh);
      return mesh;
    },
    async ready() {
      await Promise.all(meshes.map((m) => m.ready));
      root.renderNow();
    },
    dispose() {
      off();
      root.destroy();
    },
  };
}
