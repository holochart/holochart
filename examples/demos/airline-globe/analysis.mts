import network from './data/network.json' with { type: 'json' };

export const AIRPORTS = network.hubs;
export const REGION_NAMES = [...new Set(AIRPORTS.map((h) => h.region))];

/** Shortest surface distance on a spherical Earth; not the distance an aircraft actually flies. */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const radians = Math.PI / 180;
  const halfLat = ((b.lat - a.lat) * radians) / 2;
  const halfLon = ((b.lon - a.lon) * radians) / 2;
  const haversine =
    Math.sin(halfLat) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(halfLon) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export const ROUTES = network.links.map((link) => ({
  ...link,
  km: distanceKm(AIRPORTS[link.source]!, AIRPORTS[link.target]!),
  within: AIRPORTS[link.source]!.region === AIRPORTS[link.target]!.region,
  label: `${AIRPORTS[link.source]!.code} ↔ ${AIRPORTS[link.target]!.code}`,
}));

export const HUB_METRICS = AIRPORTS.map((hub, index) => {
  const routes = ROUTES.filter((r) => r.source === index || r.target === index);
  const neighbors = routes.map((r) => AIRPORTS[r.source === index ? r.target : r.source]!);
  return {
    ...hub,
    index,
    degree: routes.length,
    within: routes.filter((r) => r.within).length,
    across: routes.filter((r) => !r.within).length,
    reach: new Set(neighbors.map((n) => n.region)).size,
    medianKm: median(routes.map((r) => r.km)),
  };
});

/** Each unordered airport pair is counted once, including links inside one region. */
export const REGION_LINKS = REGION_NAMES.flatMap((_, source) =>
  REGION_NAMES.flatMap((__, target) => {
    if (target < source) return [];
    const value = ROUTES.filter((r) => {
      const a = REGION_NAMES.indexOf(AIRPORTS[r.source]!.region);
      const b = REGION_NAMES.indexOf(AIRPORTS[r.target]!.region);
      return Math.min(a, b) === source && Math.max(a, b) === target;
    }).length;
    return value ? [{ source, target, value }] : [];
  }),
);

export const CARRIERS = [...new Set(ROUTES.flatMap((r) => r.airlines))]
  .map((name) => {
    const routes = ROUTES.filter((r) => r.airlines.includes(name));
    const airports = new Set(routes.flatMap((r) => [r.source, r.target]));
    const hub = AIRPORTS.find((h) => h.airline === name);
    return {
      name,
      routes: routes.length,
      airports: airports.size,
      medianKm: median(routes.map((r) => r.km)),
      region: hub?.region ?? '',
    };
  })
  .sort((a, b) => b.routes - a.routes || a.name.localeCompare(b.name));

/** Explicit 2,000 km bins, [lower, upper), so every route lands in exactly one bin. */
export const DISTANCE_BINS = Array.from(
  { length: Math.floor(Math.max(...ROUTES.map((r) => r.km)) / 2000) + 1 },
  (_, index) => {
    const lower = index * 2000;
    const upper = lower + 2000;
    const routes = ROUTES.filter((r) => r.km >= lower && r.km < upper);
    return {
      lower,
      upper,
      label: `${lower / 1000}–${upper / 1000}k`,
      within: routes.filter((r) => r.within).length,
      across: routes.filter((r) => !r.within).length,
    };
  },
);

export const ADJACENCY = AIRPORTS.map((_, source) =>
  AIRPORTS.map(
    (__, target) =>
      ROUTES.find(
        (r) =>
          (r.source === source && r.target === target) ||
          (r.source === target && r.target === source),
      )?.airlines.length ?? 0,
  ),
);

export const SUMMARY = {
  pairs: (AIRPORTS.length * (AIRPORTS.length - 1)) / 2,
  across: ROUTES.filter((r) => !r.within).length,
  within: ROUTES.filter((r) => r.within).length,
  medianKm: median(ROUTES.map((r) => r.km)),
  longest: [...ROUTES].sort((a, b) => b.km - a.km)[0]!,
  shared: ROUTES.filter((r) => r.airlines.length > 1).length,
  leadingHub: [...HUB_METRICS].sort((a, b) => b.degree - a.degree)[0]!,
};
