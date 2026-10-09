import { describe, expect, it } from 'vitest';
import {
  ADJACENCY,
  AIRPORTS,
  CARRIERS,
  distanceKm,
  DISTANCE_BINS,
  HUB_METRICS,
  median,
  REGION_LINKS,
  ROUTES,
  SUMMARY,
} from '../../examples/demos/airline-globe/analysis.mts';
import industry from '../../examples/demos/airline-globe/data/industry.json';

describe('airline infographic: derived network measures', () => {
  it('conserves unordered pairs through the regional, hub and distance aggregations', () => {
    expect(new Set(ROUTES.map((r) => `${r.source}:${r.target}`)).size).toBe(ROUTES.length);
    expect(ROUTES.every((r) => r.source < r.target)).toBe(true);
    expect(REGION_LINKS.reduce((n, r) => n + r.value, 0)).toBe(ROUTES.length);
    expect(DISTANCE_BINS.reduce((n, b) => n + b.within + b.across, 0)).toBe(ROUTES.length);
    expect(DISTANCE_BINS.reduce((n, b) => n + b.within, 0)).toBe(SUMMARY.within);
    expect(HUB_METRICS.reduce((n, h) => n + h.degree, 0)).toBe(2 * ROUTES.length);
    expect(HUB_METRICS.reduce((n, h) => n + h.within, 0)).toBe(2 * SUMMARY.within);
    for (const h of HUB_METRICS) {
      expect(h.within + h.across).toBe(h.degree);
      expect(h.reach).toBeLessThanOrEqual(h.degree);
    }
  });

  it('retains carrier overlap while keeping the matrix symmetric and its diagonal empty', () => {
    expect(ADJACENCY).toHaveLength(AIRPORTS.length);
    for (const [i, row] of ADJACENCY.entries()) {
      expect(row[i]).toBe(0);
      for (const [j, carriers] of row.entries()) expect(carriers).toBe(ADJACENCY[j]![i]);
    }
    for (const r of ROUTES) expect(ADJACENCY[r.source]![r.target]).toBe(r.airlines.length);
    const assignments = ROUTES.reduce((n, r) => n + r.airlines.length, 0);
    expect(CARRIERS.reduce((n, c) => n + c.routes, 0)).toBe(assignments);
    expect(ADJACENCY.flat().reduce((n, c) => n + c, 0)).toBe(assignments * 2);
    expect(assignments).toBeGreaterThan(ROUTES.length);
    expect(CARRIERS.every((c) => c.region && c.airports >= 2)).toBe(true);
  });

  it('computes surface distances across the date line and medians independently of order', () => {
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(
      Math.PI * 6371.0088,
      5,
    );
    expect(distanceKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })).toBeCloseTo(222.39016, 4);
    expect(distanceKm(AIRPORTS[0]!, AIRPORTS[1]!)).toBeCloseTo(
      distanceKm(AIRPORTS[1]!, AIRPORTS[0]!),
      8,
    );
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([9, 1, 5])).toBe(5);
    expect(SUMMARY.longest.label).toBe('ATL ↔ JNB');
    expect(SUMMARY.leadingHub.code).toBe('CDG');
  });
});

it('freezes a dated full-year industry table with regional traffic shares summing to 100%', () => {
  expect(industry.published).toBe('2026-01-29');
  expect(industry.year).toBe(2025);
  expect(industry.regions.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100);
  expect(industry.total).toEqual({ demand: 5.3, capacity: 5.2, load: 83.6 });
  expect(industry.regions.every((r) => r.load > 0 && r.load <= 100)).toBe(true);
});
