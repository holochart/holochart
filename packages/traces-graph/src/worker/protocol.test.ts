import { describe, expect, it } from 'vitest';
import { GRAPH_ARRANGEMENTS } from '../layout/index.ts';
import type { LayoutResult, LinkRoute } from '../layout/types.ts';
import { randomGraph } from './__testing__/graphs.ts';
import {
  WORKER_ARRANGEMENTS,
  copyGraph,
  decodeResult,
  decodeRoutes,
  encodeResult,
  encodeRoutes,
  graphTransferables,
  resultTransferables,
} from './protocol.ts';

const spline = (...points: number[]): LinkRoute => ({
  points: Float64Array.from(points),
  kind: 'spline',
});
const polyline = (...points: number[]): LinkRoute => ({
  points: Float64Array.from(points),
  kind: 'polyline',
});

describe('the worker arrangements', () => {
  it('are every arrangement of the trace but custom', () => {
    expect([...WORKER_ARRANGEMENTS].sort()).toEqual(
      GRAPH_ARRANGEMENTS.filter((name) => name !== 'custom').sort(),
    );
  });
});

describe('routes as flat arrays', () => {
  it('round-trip, gaps and kinds included', () => {
    const routes = [
      undefined,
      spline(0, 0, 1, 1, 2, 1, 3, 0),
      polyline(5, 5, 6, 6),
      undefined,
      spline(9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3),
    ];
    const encoded = encodeRoutes(routes);
    expect([...encoded.kind]).toEqual([0, 2, 1, 0, 2]);
    expect([...encoded.start]).toEqual([0, 0, 8, 12, 12, 26]);
    expect(encoded.points).toHaveLength(26);
    expect(decodeRoutes(encoded)).toEqual(routes);
  });

  it('keep the length of an empty and of an all-straight list', () => {
    expect(decodeRoutes(encodeRoutes([]))).toEqual([]);
    expect(decodeRoutes(encodeRoutes([undefined, undefined]))).toEqual([undefined, undefined]);
  });

  it('read a sparse list as straight where it has no entry', () => {
    const sparse: (LinkRoute | undefined)[] = [];
    sparse[3] = polyline(1, 2, 3, 4);
    const decoded = decodeRoutes(encodeRoutes(sparse));
    expect(decoded).toHaveLength(4);
    expect(decoded[0]).toBeUndefined();
    expect(decoded[3]).toEqual(sparse[3]);
  });

  it('decode to views of one buffer, not copies', () => {
    const encoded = encodeRoutes([spline(0, 0, 1, 1, 2, 2, 3, 3), polyline(4, 4, 5, 5)]);
    const decoded = decodeRoutes(encoded);
    expect(decoded[0]!.points.buffer).toBe(encoded.points.buffer);
    expect(decoded[1]!.points.buffer).toBe(encoded.points.buffer);
    expect(decoded[1]!.points.byteOffset).toBe(8 * Float64Array.BYTES_PER_ELEMENT);
  });
});

describe('a result as it is posted', () => {
  /** What a tree layout returns: arrays, two lists of routes and plain values. */
  const result = {
    x: Float64Array.of(0, 10, 20),
    y: Float64Array.of(0, -5, -5),
    hidden: Uint8Array.of(0, 0, 1),
    parent: Int32Array.of(-1, 0, 0),
    routes: [spline(0, 0, 0, -2, 10, -3, 10, -5), undefined],
    parentRoutes: [undefined, spline(0, 0, 0, -2, 10, -3, 10, -5), undefined],
    heights: 'level',
    valueAxis: { axis: 'y', offset: 0, scale: -5 },
    clusters: [{ group: 0, x0: 0, y0: 0, x1: 1, y1: 1 }],
    span: 12.5,
    z: undefined,
  } as unknown as LayoutResult;

  it('keeps every property through encode and decode', () => {
    const encoded = encodeResult(result);
    expect(Object.keys(encoded.routes).sort()).toEqual(['parentRoutes', 'routes']);
    expect(encoded.fields).not.toHaveProperty('z');
    const { z: _z, ...defined } = result as LayoutResult & { z: undefined };
    expect(decodeResult(encoded)).toEqual(defined);
  });

  it('transfers each buffer once, and arrives whole on the other side', () => {
    const encoded = encodeResult(result);
    const transfer = resultTransferables(encoded);
    // x, y, hidden, parent and three arrays for each of the two route lists.
    expect(transfer).toHaveLength(10);
    expect(new Set(transfer).size).toBe(10);
    const arrived = structuredClone(encoded, { transfer });
    expect(result.x).toHaveLength(0);
    const decoded = decodeResult(arrived);
    expect([...decoded.x]).toEqual([0, 10, 20]);
    expect(decoded.routes![0]!.kind).toBe('spline');
    expect([...decoded.routes![0]!.points]).toEqual([0, 0, 0, -2, 10, -3, 10, -5]);
    expect(decoded.routes![1]).toBeUndefined();
    expect(decoded).toHaveProperty('valueAxis', { axis: 'y', offset: 0, scale: -5 });
  });

  it('treats a list named routes as routes even when every link is straight', () => {
    const encoded = encodeResult({ x: new Float64Array(1), y: new Float64Array(1), routes: [] });
    expect(encoded.routes).toHaveProperty('routes');
    expect(decodeResult(encoded).routes).toEqual([]);
  });

  it('leaves an array of anything else alone', () => {
    const odd = { x: new Float64Array(1), y: new Float64Array(1), order: [2, 0, 1] };
    expect(encodeResult(odd as unknown as LayoutResult).fields).toHaveProperty('order', [2, 0, 1]);
  });
});

describe('a graph on its way to the worker', () => {
  it('is copied array by array, values kept', () => {
    const graph = { ...randomGraph(50, 120), group: new Int32Array(50), groups: 1 };
    const copy = copyGraph(graph);
    expect(copy).toEqual(graph);
    expect(copy.source).not.toBe(graph.source);
    expect(copy.source.buffer).not.toBe(graph.source.buffer);
    expect(copy.nodes).toBe(50);
    expect(copy.groups).toBe(1);
  });

  it('copies only the part of a buffer a view shows', () => {
    const backing = new Float64Array(1000);
    const graph = { ...randomGraph(10, 20), x: backing.subarray(100, 110) };
    const copy = copyGraph(graph);
    expect(copy.x.buffer.byteLength).toBe(10 * Float64Array.BYTES_PER_ELEMENT);
  });

  it('lists each buffer once, also when two arrays share one', () => {
    const shared = new Float64Array(20);
    const graph = {
      ...randomGraph(10, 20),
      halfWidth: shared.subarray(0, 10),
      halfHeight: shared.subarray(10),
    };
    const transfer = graphTransferables(graph);
    // source, target, weight, the shared one, x and y.
    expect(transfer).toHaveLength(6);
    expect(transfer.filter((buffer) => buffer === shared.buffer)).toHaveLength(1);
  });

  it('survives a transfer and leaves the sender empty-handed', () => {
    const graph = randomGraph(30, 60);
    const copy = copyGraph(graph);
    const arrived = structuredClone(copy, { transfer: graphTransferables(copy) });
    expect(arrived).toEqual(graph);
    expect(copy.source).toHaveLength(0);
    expect(graph.source).toHaveLength(60);
  });
});
