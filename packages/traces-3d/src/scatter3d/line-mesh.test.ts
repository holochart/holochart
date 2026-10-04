import { supplyDefaults } from '@mk7s/holochart-core';
import { createChartRegistry, type DomainTraceEntry } from '@mk7s/holochart-runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcScatter3d, type Scatter3dCalc } from './calc.ts';
import { scatter3d } from './index.ts';
import {
  lineRuns,
  perpendicular,
  ribbonMesh,
  runTangents,
  transportFrames,
  tubeMesh,
} from './line-mesh.ts';
import { lineMesh3d, lineRender3d } from './plot.ts';
import type { Vec3 } from '@mk7s/holochart-render';

const registry = createChartRegistry().register(scatter3d, sceneComponent);

function build(t: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'scatter3d', ...t }], layout: { template: 'none' } },
    registry.core,
  );
  const trace = fullData[0]!;
  const calc = calcScatter3d(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
  const area = { x: 0, y: 0, width: 600, height: 400 };
  const entries: DomainTraceEntry<Scatter3dCalc>[] = [
    { trace, index: 0, calc, domain: { x: [0, 1], y: [0, 1], rect: area } },
  ];
  scatter3d.crossTraceLayout!(entries, { fullLayout, width: 600, height: 400, plotArea: area });
  return { trace, calc, fullLayout };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function circle(n: number, r = 1): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [r * Math.cos(a), r * Math.sin(a), 0];
  });
}

describe('line runs', () => {
  it('split at missing points unless connectgaps, dropping single points', () => {
    const x = [0, 1, NaN, 2, 3, 4, NaN, 5];
    const input = { x, y: x.map(() => 0), z: x.map(() => 0) };
    expect(lineRuns({ ...input, connectGaps: false })).toEqual([
      [0, 1],
      [3, 4, 5],
    ]);
    expect(lineRuns({ ...input, connectGaps: true })).toEqual([[0, 1, 3, 4, 5, 7]]);
  });
});

describe('rotation-minimizing frames (double reflection)', () => {
  it('keep a constant normal along a straight line', () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [1, 1, 0],
      [2, 2, 0],
      [3, 3, 0],
    ];
    const frames = transportFrames(points, runTangents(points));
    for (const n of frames) {
      for (let k = 0; k < 3; k++) expect(n[k]).toBeCloseTo(frames[0]![k]!, 12);
    }
  });

  it('do not twist around a planar curve: the angle to the plane normal stays fixed', () => {
    const points = circle(64);
    const frames = transportFrames(points, runTangents(points));
    const first = dot(frames[0]!, [0, 0, 1]);
    for (const n of frames) expect(dot(n, [0, 0, 1])).toBeCloseTo(first, 9);
  });

  it('property: frames are unit and perpendicular to the tangents on any polyline', () => {
    const coord = fc.double({ min: -10, max: 10, noNaN: true });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coord, coord, coord), { minLength: 2, maxLength: 40 }),
        (pts) => {
          const points = pts as Vec3[];
          const tangents = runTangents(points);
          const frames = transportFrames(points, tangents);
          expect(frames).toHaveLength(points.length);
          for (let i = 0; i < points.length; i++) {
            expect(Math.hypot(...frames[i]!)).toBeCloseTo(1, 7);
            expect(Math.abs(dot(frames[i]!, tangents[i]!))).toBeLessThan(1e-7);
          }
        },
      ),
    );
  });

  it('perpendicular() is a unit vector perpendicular to its input', () => {
    for (const t of [
      [1, 0, 0],
      [0, 0, 1],
      [0.6, 0.8, 0],
    ] as Vec3[]) {
      const p = perpendicular(t);
      expect(Math.hypot(...p)).toBeCloseTo(1, 12);
      expect(dot(p, t)).toBeCloseTo(0, 12);
    }
  });
});

describe('tube meshes', () => {
  it('put a ring around every point, quads between rings and flat caps', () => {
    const x = [0, 1, 2, NaN, 5, 6];
    const mesh = tubeMesh(
      { x, y: x.map(() => 0), z: x.map(() => 0), color: [1, 0, 0, 1], connectGaps: false },
      0.1,
      8,
    );
    // Runs of 3 and 2 points: 8 per ring, caps 2 × (1 + 8) per run.
    expect(mesh.positions.length / 3).toBe(5 * 8 + 4 * 9);
    expect(mesh.indices.length / 3).toBe((2 + 1) * 8 * 2 + 4 * 8);
    expect(Array.from(mesh.pointIndex.subarray(0, 24))).toEqual([
      ...Array(8).fill(0),
      ...Array(8).fill(1),
      ...Array(8).fill(2),
    ]);
    expect(Array.from(mesh.colors.subarray(0, 4))).toEqual([1, 0, 0, 1]);
    // Ring vertices sit `radius` from their point along their (unit, outward) normal.
    for (let v = 0; v < 24; v++) {
      const p = [0, 1, 2].map((k) => mesh.positions[v * 3 + k]! + mesh.origin[k]!);
      const n = [0, 1, 2].map((k) => mesh.normals[v * 3 + k]!) as Vec3;
      const center = [mesh.pointIndex[v]!, 0, 0];
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
      for (let k = 0; k < 3; k++) expect(p[k]).toBeCloseTo(center[k]! + 0.1 * n[k]!, 6);
    }
  });

  it('winds every triangle counter-clockwise seen from outside', () => {
    const points = circle(24, 2);
    const mesh = tubeMesh(
      {
        x: points.map((p) => p[0]),
        y: points.map((p) => p[1]),
        z: points.map((_, i) => i * 0.05),
        color: [1, 1, 1, 1],
        connectGaps: false,
      },
      0.2,
    );
    const at = (v: number) => [0, 1, 2].map((k) => mesh.positions[v * 3 + k]!) as Vec3;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => at(mesh.indices[t + k]!));
      const u = [0, 1, 2].map((k) => b![k]! - a![k]!) as Vec3;
      const w = [0, 1, 2].map((k) => c![k]! - a![k]!) as Vec3;
      const face: Vec3 = [
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0],
      ];
      const n = [0, 1, 2].map((k) => mesh.normals[mesh.indices[t]! * 3 + k]!) as Vec3;
      expect(dot(face, n)).toBeGreaterThan(0);
    }
  });
});

describe('ribbon meshes', () => {
  it('sweep the line along the axis, normal to the axis and the tangent', () => {
    const mesh = ribbonMesh(
      {
        x: [0, 1, 2],
        y: [3, 3, 3],
        z: [0, 1, 0],
        color: Float32Array.from([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]),
        connectGaps: false,
      },
      1,
      0.25,
    );
    expect(mesh.positions.length / 3).toBe(6);
    expect(mesh.indices.length).toBe(12);
    expect(Array.from(mesh.pointIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    const y = (v: number) => mesh.positions[v * 3 + 1]! + mesh.origin[1];
    expect([y(0), y(1)]).toEqual([2.75, 3.25]);
    for (let v = 0; v < 6; v++) {
      const n = [0, 1, 2].map((k) => mesh.normals[v * 3 + k]!) as Vec3;
      expect(Math.abs(n[1])).toBeLessThan(1e-7);
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    }
    expect(Array.from(mesh.colors.subarray(8, 12))).toEqual([0, 1, 0, 1]);
  });
});

describe('scatter3d line.render', () => {
  const HELIX = {
    mode: 'lines',
    x: [1, 0, -1, 0],
    y: [0, 1, 0, -1],
    z: [0, 1, 2, 3],
  };

  it("defaults to 'screen' (Plotly's look); tubes and ribbons coerce their own attributes", () => {
    const screen = build(HELIX).trace['line'] as Record<string, unknown>;
    expect(screen['render']).toBe('screen');
    expect(screen['dash']).toBe('solid');
    expect(screen['radius']).toBeUndefined();
    const tube = build({ ...HELIX, line: { render: 'tube' } });
    const line = tube.trace['line'] as Record<string, unknown>;
    expect(line['radius']).toBe(0.01);
    expect(line['dash']).toBeUndefined();
    expect(line['lighting']).toMatchObject({ ambient: 0.5, diffuse: 0.7 });
    expect(lineRender3d(tube.trace)).toBe('tube');
    const ribbon = build({ ...HELIX, line: { render: 'ribbon' } }).trace['line'] as Record<
      string,
      unknown
    >;
    expect(ribbon['ribbon']).toEqual({ axis: 'y' });
    expect(lineRender3d(build({ ...HELIX, mode: 'markers', line: { render: 'tube' } }).trace)).toBe(
      'screen',
    );
  });

  it('pads the autorange by half a given ribbon width', () => {
    const plain = build({ ...HELIX, line: { render: 'ribbon' } }).calc;
    expect(plain.sceneExtremes.y).toEqual([-1, 1]);
    const wide = build({ ...HELIX, line: { render: 'ribbon', ribbon: { axis: 'y', width: 1 } } });
    expect(wide.calc.sceneExtremes.y).toEqual([-1.5, 1.5]);
  });

  it('builds tubes in scene units, the radius a fraction of the axis box', () => {
    const { trace, calc, fullLayout } = build({ ...HELIX, line: { render: 'tube', radius: 0.05 } });
    const scene = calc.scene!;
    const mesh = lineMesh3d(trace, calc, { transform: scene.transform, layout: scene }, fullLayout);
    const t = scene.transform;
    const box = Math.max(...scene.aspect);
    // The first ring is centered on the first point, in world units.
    const p0 = [calc.x[0]! * t.scaleX + t.offsetX, calc.y[0]! * t.scaleY + t.offsetY];
    const n = [mesh.normals[0]!, mesh.normals[1]!];
    expect(mesh.positions[0]! + mesh.origin[0]).toBeCloseTo(p0[0]! + 0.05 * box * n[0]!, 5);
    expect(mesh.positions[1]! + mesh.origin[1]).toBeCloseTo(p0[1]! + 0.05 * box * n[1]!, 5);
  });

  it('builds ribbons a twentieth of the axis range wide by default', () => {
    const { trace, calc, fullLayout } = build({ ...HELIX, line: { render: 'ribbon' } });
    const scene = calc.scene!;
    const mesh = lineMesh3d(trace, calc, { transform: scene.transform, layout: scene }, fullLayout);
    const range = scene.axes[1].range;
    const width = (Math.abs(range[1] - range[0]) / 20) * scene.transform.scaleY;
    expect(mesh.positions[4]! - mesh.positions[1]!).toBeCloseTo(width, 5);
  });
});
