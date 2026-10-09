import type { Figure } from '@mk7s/holochart';
import { degrees } from '@mk7s/holochart/graph';
import network from './data/network.json' with { type: 'json' };
import { LOOK } from '../openrouter/ui.mts';

/** One indexed graph feeds both the geographic and topological views. */
export const HUBS = network.hubs;
export const LINKS = network.links;
export const REGIONS: Readonly<Record<string, string>> = {
  'North America': LOOK.colorway[1],
  'South America': LOOK.colorway[4],
  Europe: LOOK.colorway[2],
  'Middle East': LOOK.colorway[0],
  Africa: LOOK.colorway[3],
  Asia: LOOK.colorway[7],
  Oceania: LOOK.colorway[5],
};
export const COLORS = HUBS.map((h) => REGIONS[h.region]!);
export const DEGREE = Array.from(
  degrees({
    node: { label: HUBS.map((h) => h.code) },
    link: { source: LINKS.map((l) => l.source), target: LINKS.map((l) => l.target) },
  }).degree,
);

export function focus(hub: number | null): { links: number[]; nodes: Set<number> } {
  const links = LINKS.flatMap((l, i) =>
    hub === null || l.source === hub || l.target === hub ? [i] : [],
  );
  const nodes = new Set(links.flatMap((i) => [LINKS[i]!.source, LINKS[i]!.target]));
  if (hub !== null) nodes.add(hub);
  return { links, nodes };
}

/** NaN separates the indexed edges so unrelated flights never join into a polyline. */
export function routeCoordinates(indices: readonly number[]): { lon: number[]; lat: number[] } {
  const lon: number[] = [];
  const lat: number[] = [];
  for (const i of indices) {
    const link = LINKS[i]!;
    const a = HUBS[link.source]!;
    const b = HUBS[link.target]!;
    lon.push(a.lon, b.lon, NaN);
    lat.push(a.lat, b.lat, NaN);
  }
  return { lon, lat };
}

export function globeData(hub: number | null, lift: number, labels: boolean): Figure['data'] {
  const selected = focus(hub);
  // Dim context remains geographic; the highlighted network sits above the same sphere.
  const context =
    hub === null ? [] : LINKS.flatMap((_, i) => (selected.links.includes(i) ? [] : [i]));
  const lines: Array<NonNullable<Figure['data']>[number]> = [
    {
      type: 'scattergeo',
      mode: 'lines',
      ...routeCoordinates(context),
      line: { color: 'rgba(164,167,181,0.10)', width: 0.8, lift },
      hoverinfo: 'skip',
    },
  ];
  for (const [region, color] of Object.entries(REGIONS)) {
    const indices = selected.links.filter((i) => HUBS[LINKS[i]!.source]!.region === region);
    lines.push({
      type: 'scattergeo',
      mode: 'lines',
      name: region,
      ...routeCoordinates(indices),
      opacity: hub === null ? 0.48 : 0.95,
      line: { color, width: hub === null ? 1 : 1.9, lift },
      hoverinfo: 'skip',
    });
  }
  lines.push({
    type: 'scattergeo',
    name: 'Airline hubs',
    lon: HUBS.map((h) => h.lon),
    lat: HUBS.map((h) => h.lat),
    text: HUBS.map((h) => h.code),
    customdata: HUBS.map(
      (h, i) =>
        `${h.city}, ${h.country}<br>${h.airline}<br>${DEGREE[i]} connections in this sample`,
    ),
    mode: labels ? 'markers+text' : 'markers',
    textposition: 'top center',
    textfont: { color: LOOK.text, size: 10 },
    marker: {
      size: HUBS.map((_, i) => (i === hub ? 13 : 5 + Math.sqrt(DEGREE[i]!))),
      color: COLORS,
      opacity: HUBS.map((_, i) => (selected.nodes.has(i) ? 1 : 0.18)),
      line: { color: LOOK.title, width: 0.7 },
    },
    hovertemplate: '<b>%{text}</b><br>%{customdata}<extra></extra>',
  });
  return lines;
}

export function graphData(hub: number | null): Figure['data'] {
  const selected = focus(hub);
  return [
    {
      type: 'graph',
      arrangement: 'circular',
      node: {
        label: HUBS.map((h) => h.code),
        group: HUBS.map((h) => h.region),
        color: COLORS,
        size: HUBS.map((_, i) => (i === hub ? 18 : 7 + Math.sqrt(DEGREE[i]!))),
        customdata: HUBS.map((h) => `${h.city}, ${h.country}<br>${h.airline}`),
        textfont: { color: LOOK.text, size: 10 },
        draggable: false,
        hovertemplate: '<b>%{label}</b><br>%{customdata}<br>%{degree} connections<extra></extra>',
      },
      link: {
        source: LINKS.map((l) => l.source),
        target: LINKS.map((l) => l.target),
        color: LINKS.map((l, i) =>
          selected.links.includes(i) && hub !== null ? COLORS[l.source]! : 'rgba(164,167,181,0.20)',
        ),
        width: LINKS.map((_, i) => (selected.links.includes(i) && hub !== null ? 1.7 : 0.6)),
        customdata: LINKS.map((l) => l.airlines.join(', ')),
        hovertemplate:
          '<b>%{source.label} ↔ %{target.label}</b><br>%{customdata}<extra>2014 sample</extra>',
      },
      highlight: { mode: 'neighbors', nodes: hub === null ? [] : [hub], dim: 0.16 },
    },
  ];
}

export const CONFIG = { responsive: true, displayModeBar: false };
export const BASE_LAYOUT = {
  paper_bgcolor: LOOK.bg,
  plot_bgcolor: LOOK.bg,
  font: { color: LOOK.text, family: LOOK.font },
  showlegend: false,
  margin: { l: 8, r: 8, t: 8, b: 8 },
};

export function globeFigure(): Figure {
  return {
    data: globeData(null, 0.22, true),
    config: CONFIG,
    layout: {
      ...BASE_LAYOUT,
      dragmode: 'pan',
      clickmode: 'event',
      geo: {
        fitbounds: false,
        bgcolor: LOOK.bg,
        projection: { type: 'globe3d', rotation: { lon: 20, lat: 20 }, scale: 0.62 },
        showocean: true,
        oceancolor: '#171721',
        showland: true,
        landcolor: '#2c303a',
        showlakes: true,
        lakecolor: '#171721',
        showcountries: true,
        countrycolor: '#515363',
        countrywidth: 0.5,
        showcoastlines: true,
        coastlinecolor: '#656977',
        coastlinewidth: 0.6,
        showframe: false,
        lonaxis: { showgrid: true, dtick: 30, gridcolor: 'rgba(164,167,181,0.13)' },
        lataxis: { showgrid: true, dtick: 30, gridcolor: 'rgba(164,167,181,0.13)' },
      },
    },
  };
}

export function graphFigure(): Figure {
  return {
    data: graphData(null),
    layout: { ...BASE_LAYOUT, dragmode: 'pan', clickmode: 'event' },
    config: CONFIG,
  };
}
