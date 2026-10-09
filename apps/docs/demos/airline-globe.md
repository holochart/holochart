---
title: Airlines around the world
description: An airline industry infographic covering passenger demand, capacity, hub geography, regional connections, route distances and carrier networks.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import industry from '@mk7s/holochart-examples/demos/airline-globe/data/industry.json';
import { AIRPORTS, CARRIERS, ROUTES, SUMMARY } from '@mk7s/holochart-examples/demos/airline-globe/analysis.mts';
import StatTiles from './components/StatTiles.vue';

const industryStats = [
  { value: `+${industry.total.demand}%`, label: 'passenger demand', aside: '2025 vs 2024 · revenue passenger kilometers' },
  { value: `+${industry.total.capacity}%`, label: 'seat capacity', aside: '2025 vs 2024 · available seat kilometers' },
  { value: `${industry.total.load}%`, label: 'load factor', aside: 'Passenger kilometers / seat kilometers' },
  { value: '11', label: 'views of aviation', aside: 'Geo, graph, chord, bar, donut, scatter and heatmap' },
];
const sampleStats = [
  { value: String(AIRPORTS.length), label: 'selected hubs', aside: 'Seven geographic regions' },
  { value: String(ROUTES.length), label: 'airport pairs', aside: `${CARRIERS.length} carriers · directions combined` },
  { value: `${Math.round(SUMMARY.across / ROUTES.length * 100)}%`, label: 'cross regional', aside: `${SUMMARY.across} of ${ROUTES.length} airport pairs` },
  { value: Math.round(SUMMARY.medianKm).toLocaleString('en-US'), label: 'median distance · km', aside: 'Great-circle distance between airports' },
];
</script>

<p class="hc-eyebrow">the airline industry · demand, geography & connectivity</p>

# Airlines around the world

<p class="hc-verdict"><strong>A planet connected by air.</strong>
  Airlines turn geographic distance into a network of destinations. Explore the industry
  through eleven chart views: from passenger demand and seat capacity to the hubs,
  regional corridors and airline portfolios that connect the world.</p>

<StatTiles :items="industryStats" />

<p class="airline-source">Industry figures: full-year 2025, as published by
  <a href="https://www.iata.org/en/pressroom/2026-releases/2026-01-29-02/">IATA on 29 January 2026</a>.
  This dated release contains provisional figures that may subsequently be revised.</p>

<p class="airline-kicker">01 / The passenger economy</p>

## Demand, capacity and the seats in between

A passenger kilometer measures traffic; a seat kilometer measures the capacity offered to
carry it. Comparing their growth reveals where demand outpaced capacity.

<div class="airline-grid">
  <section>
    <h3>Who grew fastest?</h3>
    <p>Annual growth, by airline region. Africa leads this measure; North American capacity grew faster than demand.</p>
    <Example id="demos/airline-globe/demand-capacity" bare :height="460" />
  </section>
  <section>
    <h3>Where is the traffic?</h3>
    <p>Share of global passenger kilometers. Asia Pacific and Europe together account for 61.1%.</p>
    <Example id="demos/airline-globe/traffic-share" bare :height="460" />
  </section>
</div>

### The utilization picture

Load factor expresses how much available seat capacity is used, weighted by distance.
The colored part is used capacity; the dark remainder completes the bar to 100%.

<Example id="demos/airline-globe/load-factors" bare :height="360" />

<p class="airline-source">All three charts cover domestic and international scheduled passenger traffic.
  Regions refer to carriers, rather than passengers' origins. The IATA Asia Pacific and Latin
  America groups differ from the seven geographic groups used in the network below.</p>

<p class="airline-kicker">02 / The network beneath the industry</p>

## 174 connections, wrapped around one planet

The following views use a **selected June 2014 OpenFlights network**, a historical lens on
connectivity. Each edge is one recorded nonstop airport pair, combining both directions and
selected carriers. These counts describe this sample, rather than global traffic volumes.

<StatTiles :items="sampleStats" />

The globe places the airports at their coordinates and raises the route edges above its
surface. The circular graph shows the same connections together. Colors identify airport
regions; larger nodes have more connections.

<Example id="demos/airline-globe/world-network" bare :height="760" />

Drag the globe to turn it and scroll to zoom. Select a hub or click an airport in either view
to highlight its connections in both charts. **Arc height** changes the elevation of the
edges. The hemisphere buttons rotate the view; **Reset** restores the whole network.

### A flatter view of the hubs

Bubble area is proportional to the number of connected airports. Hover a hub to see its
connectivity, destination regions and median route distance. Close neighbors in Europe
stand out more clearly in the ranking below.

<Example id="demos/airline-globe/hub-map" bare :height="480" />

<div class="airline-grid airline-grid-network">
  <section>
    <h3>Which hubs connect the sample?</h3>
    <p><strong>{{ SUMMARY.leadingHub.code }} · {{ SUMMARY.leadingHub.city }}</strong> leads with
      {{ SUMMARY.leadingHub.degree }} connected airports. Switch to <strong>Regions reached</strong>
      to compare geographic breadth.</p>
    <Example id="demos/airline-globe/hub-ranking" bare :height="740" />
  </section>
  <section>
    <h3>How do regions connect?</h3>
    <p>Ribbons aggregate airport pairs. Wider bands mean more connections; bands returning to
      their own arc represent routes within a region. Hover an arc or ribbon to inspect it.</p>
    <Example id="demos/airline-globe/region-chord" bare :height="540" />
    <p class="airline-takeaway"><strong>{{ SUMMARY.across }} of {{ ROUTES.length }} pairs cross regions.</strong>
      This selection emphasizes hubs with long-distance links. Arc width counts route endpoints;
      an internal pair contributes two endpoints to its region.</p>
  </section>
</div>

<p class="airline-kicker">03 / The shape of an airline portfolio</p>

## Distance changes the network

Two airport pairs can mean very different journeys. Distances here are shortest paths over
a spherical Earth, computed from airport coordinates; actual flown distances may be longer.

<div class="airline-grid">
  <section>
    <h3>How far apart are the destinations?</h3>
    <p>Each pair appears in one 2,000 km bin. Blue and red distinguish routes within a region
      from routes across regions.</p>
    <Example id="demos/airline-globe/route-distance" bare :height="440" />
  </section>
  <section>
    <h3>Which carriers cover which distances?</h3>
    <p>Each bubble is an airline: horizontal position is its pair count, vertical position its
      median distance, and area its number of airports. Colors follow its representative hub's
      region. Hover for the full name.</p>
    <Example id="demos/airline-globe/carrier-portfolio" bare :height="440" />
  </section>
</div>

<p class="airline-takeaway">The longest pair in this sample is
  <strong>{{ SUMMARY.longest.label }}</strong> at approximately
  <strong>{{ Math.round(SUMMARY.longest.km).toLocaleString('en-US') }} km</strong>.
  Carrier pair counts overlap because several airlines can be recorded on the same pair.
  The portfolio chart measures coverage of these selected airports.</p>

<p class="airline-kicker">04 / Seeing the routes as a matrix</p>

## When airline networks overlap

<strong>{{ SUMMARY.shared }} airport pairs</strong> have more than one selected carrier recorded.
The matrix replaces crossing edges with cells: brighter cells mean more carriers. Airports
follow the same regional order as the network. Hover to identify any pair.

<Example id="demos/airline-globe/route-matrix" bare :height="680" />

The matrix is symmetric because directions are combined. A dark cell means no record among
the selected carriers and airports; it does not establish that a route was unavailable.
Neither carrier overlap nor edge count measures flight frequency, capacity or market share.

## Sources and method

The three industry charts use the **full-year 2025 table** in the
[IATA release of 29 January 2026](https://www.iata.org/en/pressroom/2026-releases/2026-01-29-02/).
RPK is revenue passenger kilometers; ASK is available seat kilometers. Load factor is their
ratio. Growth compares 2025 with 2024. Regional shares use RPK.

The network bundles 24 airports and 24 selected airlines from
[OpenFlights](https://openflights.org/data.php). Its routes are a **June 2014 snapshot**:
nonstop, non-codeshare records with both endpoints in the selected airport set. Self-links
are excluded. Duplicate records, opposite directions and carriers are combined into one
unordered pair; carrier names are retained. The representative airline on a hub is a label,
and need not operate every edge. TAM's historical name is retained.

Degrees count neighboring airports. Region ribbons count each pair once. Carrier portfolios
count a pair for every carrier recorded on it. Distances use the haversine formula with an
Earth radius of 6,371.0088 km, and medians weight each pair equally. These are derived network
measures, with no passenger or flight weighting. OpenFlights / OurAirports / Airline Route
Mapper attribution and ODbL / DbCL source notes are bundled alongside the data.

## Charts behind the infographic

The [`geo` package](/fundamentals/maps) draws the `globe3d` and Natural Earth projections.
Airport coordinates feed `scattergeo`; `scattergeo.line.lift` raises the great-circle edges.
The globe occludes its far-side routes as it rotates. The [`graph` chart](/charts/graphs/graph)
uses the same indexed edge list with a circular arrangement. The regional
[`chord` chart](/charts/graphs/chord) aggregates those edges into ribbons, while the route
matrix is a [`heatmap`](/charts/scientific/heatmap). Bars, a donut and a bubble scatter plot
provide the other perspectives. All charts use the docs theme and resize with their containers.

<style>
.airline-kicker {
  margin-top: 56px !important;
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.airline-source {
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.7;
}
.airline-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  margin: 24px 0;
}
.airline-grid > section { min-width: 0; }
.airline-grid h3 { margin-top: 0 !important; }
.airline-grid p { font-size: 14px; line-height: 1.65; }
.airline-grid .hc-example { margin: 16px 0; }
.airline-takeaway {
  border-left: 2px solid var(--vp-c-brand-1);
  padding-left: 16px;
  color: var(--vp-c-text-2);
  font-size: 14px;
}
@media (max-width: 980px) {
  .airline-grid { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .airline-kicker { margin-top: 36px !important; }
}
</style>
