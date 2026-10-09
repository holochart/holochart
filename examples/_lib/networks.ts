import { rng } from './rng.ts';

/** A network with positions, as the graph examples draw it. */
export interface Network {
  label: string[];
  group: string[];
  x: number[];
  y: number[];
  source: number[];
  target: number[];
}

/** Options of {@link clusteredNetwork}. */
export interface ClusteredNetworkOptions {
  seed?: number;
  /** Number of clusters, and nodes in each. */
  clusters: number;
  perCluster: number;
  /** Links between nodes of different clusters. */
  between: number;
  /** Share of a cluster's nodes that link to one of its hubs instead of a neighbour. Default 0.3. */
  hubs?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * A deterministic network of clusters, for examples and tests. The clusters sit on a circle; the
 * nodes of a cluster fill a disc from its center outwards (a sunflower pattern). Each node links
 * to the nearest node placed before it, so the links of a cluster branch out from its middle
 * without crossing much; some nodes link to one of the cluster's first three nodes instead, which
 * makes those the hubs. Positions are in arbitrary units, about ±1.
 */
export function clusteredNetwork(options: ClusteredNetworkOptions): Network {
  const random = rng(options.seed ?? 7);
  const { clusters, perCluster } = options;
  const hubs = options.hubs ?? 0.3;
  const out: Network = { label: [], group: [], x: [], y: [], source: [], target: [] };
  const ring = clusters > 1 ? 0.62 : 0;
  // Discs that just touch their neighbours on the ring.
  const disc = clusters > 1 ? Math.min(0.36, ring * Math.sin(Math.PI / clusters) * 0.9) : 0.9;
  for (let c = 0; c < clusters; c++) {
    const angle = Math.PI / 2 - (2 * Math.PI * c) / clusters;
    const cx = ring * Math.cos(angle);
    const cy = ring * Math.sin(angle);
    const first = out.label.length;
    for (let i = 0; i < perCluster; i++) {
      const r = disc * Math.sqrt((i + 0.5) / perCluster);
      const a = i * GOLDEN_ANGLE + c;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      out.label.push(`${String.fromCharCode(65 + (c % 26))}${i + 1}`);
      out.group.push(`Group ${String.fromCharCode(65 + (c % 26))}`);
      out.x.push(x);
      out.y.push(y);
      if (i === 0) continue;
      let to = first + Math.floor(random() * Math.min(i, 3));
      if (i < 3 || random() >= hubs) {
        let best = Infinity;
        for (let j = first; j < first + i; j++) {
          const d = (out.x[j]! - x) ** 2 + (out.y[j]! - y) ** 2;
          if (d < best) {
            best = d;
            to = j;
          }
        }
      }
      out.source.push(to);
      out.target.push(first + i);
    }
  }
  for (let k = 0; k < options.between; k++) {
    const a = Math.floor(random() * clusters);
    const b = (a + 1 + Math.floor(random() * (clusters - 1))) % clusters;
    if (a === b) continue;
    out.source.push(a * perCluster + Math.floor(random() ** 3 * perCluster));
    out.target.push(b * perCluster + Math.floor(random() ** 3 * perCluster));
  }
  return out;
}

/** Number of links at each node of a network. */
export function degreesOf(network: Network): number[] {
  const degree = network.label.map(() => 0);
  network.source.forEach((s, k) => {
    degree[s]!++;
    degree[network.target[k]!]!++;
  });
  return degree;
}
