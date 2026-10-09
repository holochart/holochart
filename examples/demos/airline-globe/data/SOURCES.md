# Airline industry infographic data

## Industry snapshot

`industry.json` transcribes the **Full Year 2025** table (not the December-only table) from
[IATA, Strong 2025 Passenger Demand Masks Ongoing Capacity Constraints](https://www.iata.org/en/pressroom/2026-releases/2026-01-29-02/),
published 29 January 2026. Retrieved 2026-10-06. Figures are provisional at that publication
date, frozen for this demo rather than presented as a live or subsequently revised series.
RPK is revenue passenger kilometers; ASK is available seat kilometers; load is RPK / ASK.
Demand and capacity are percent change from 2024. Share is percent of total 2025 RPK by
region of carrier. IATA's Asia Pacific combines the network's Asia and Oceania, and its
Latin America group is not the same as the network's South America grouping. No comparison
of sample route shares to global traffic shares is made.

## Historical network

Retrieved 2026-10-06 from the OpenFlights GitHub data dumps:

- https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat
- https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat
- Documentation and license: https://openflights.org/data.php

`network.json` is a small, transformed extract, bundled for an offline, deterministic demo.
Airport coordinates are rounded to four decimal places. The airport set is JFK, ATL, YYZ,
PTY, GRU, EZE, LHR, CDG, FRA, AMS, IST, DXB, DOH, ADD, NBO, JNB, CAI, DEL, SIN, HKG, NRT,
ICN, SYD and AKL, in this order. Their representative airlines are labels for the selected hubs.

Routes are the June 2014 historical snapshot described by OpenFlights. Keep records whose
airline code is one of AA, DL, AC, CM, JJ, AR, BA, AF, LH, KL, TK, EK, QR, ET, KQ, SA, MS,
AI, SQ, CX, NH, KE, QF, NZ; whose endpoints are both in the airport set; whose codeshare
field is not `Y`; and whose stops field is `0`. Drop self links. Combine opposite directions
and multiple carriers into one unordered airport pair, retaining the sorted airline names.
Sort the edges by source index, then target index. This yields 174 edges and 24 airlines.

The bundled `network.json` extract is made available under the Open Database License (ODbL):
https://opendatacommons.org/licenses/odbl/1-0/. Individual contents are under the Database
Contents License (DbCL): https://opendatacommons.org/licenses/dbcl/1-0/.
Credit: OpenFlights / OurAirports / Airline Route Mapper. OpenFlights identifies the underlying
OurAirports coordinates and Airline Route Mapper records as public-domain data. This extract
retains the source attribution and database license. No current route availability is inferred.

## Derived measures

`analysis.mts` counts neighbors for hub degree, distinct destination regions for reach,
and each unordered airport pair once in regional ribbons and 2,000 km distance bins.
Within-region pairs contribute two endpoints to a chord arc. The symmetric route matrix
counts distinct selected carriers per pair (its diagonal is zero). Carrier portfolios count
each pair once for each carrier recorded, so their totals overlap. Distances use haversine
on a sphere with radius 6,371.0088 km. All route and carrier medians weight pairs equally;
there is no passenger, aircraft, schedule, revenue or capacity weighting in this network.
