/**
 * A hand-written topology in the layout of Plotly's basemap files (`config.topojsonURL`): the
 * objects `coastlines`, `land`, `ocean`, `lakes`, `rivers`, `countries` and `subunits`, features
 * with an id and `ct` (and `gu` on subunits) but no name, and no transform.
 *
 * Two countries, the unit squares `AAA` (lon 0..1) and `BBB` (lon 1..2), share the edge at lon 1.
 * `BBB` has two subunits, split at lat 0.5. Rings run clockwise, as `d3-geo` wants them.
 */
export const PLOTLY_LAYOUT = {
  type: 'Topology',
  arcs: [
    // 0: the border, northward.
    [
      [1, 0],
      [1, 1],
    ],
    // 1: the rest of AAA.
    [
      [1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    // 2: the rest of BBB.
    [
      [1, 1],
      [2, 1],
      [2, 0],
      [1, 0],
    ],
    // 3: a lake in AAA.
    [
      [0.2, 0.2],
      [0.2, 0.4],
      [0.4, 0.4],
      [0.4, 0.2],
      [0.2, 0.2],
    ],
    // 4: a river across the border.
    [
      [0.5, 0.5],
      [1.5, 0.5],
    ],
    // 5: the line between the subunits of BBB, eastward.
    [
      [1, 0.5],
      [2, 0.5],
    ],
    // 6: the rest of the southern subunit.
    [
      [2, 0.5],
      [2, 0],
      [1, 0],
      [1, 0.5],
    ],
    // 7: the rest of the northern subunit.
    [
      [1, 0.5],
      [1, 1],
      [2, 1],
      [2, 0.5],
    ],
  ],
  objects: {
    coastlines: {
      type: 'GeometryCollection',
      geometries: [{ type: 'LineString', arcs: [1, 2] }],
    },
    land: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[1, 2]] }] },
    ocean: { type: 'GeometryCollection', geometries: [] },
    lakes: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[3]] }] },
    rivers: { type: 'GeometryCollection', geometries: [{ type: 'LineString', arcs: [4] }] },
    countries: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[-1, 1]], id: 'AAA', properties: { ct: [0.5, 0.5] } },
        { type: 'Polygon', arcs: [[0, 2]], id: 'BBB', properties: { ct: [1.5, 0.5] } },
        // A feature Natural Earth gives no code: no id and no properties in Plotly's files.
        { type: 'Polygon', arcs: [[3]] },
      ],
    },
    subunits: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[5, 6]], id: 'S', properties: { ct: [1.5, 0.25], gu: 'BBB' } },
        { type: 'Polygon', arcs: [[7, -6]], id: 'N', properties: { ct: [1.5, 0.75], gu: 'BBB' } },
      ],
    },
  },
};
