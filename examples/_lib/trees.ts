/** A tree as the hierarchical traces and the `graph` trace take it: one row per node. */
export interface TreeData {
  ids: string[];
  labels: string[];
  parents: string[];
}

/** A nested tree: a name, and its children when it has some. */
export type Nested = readonly [name: string, children?: readonly Nested[]];

/** Rows from a nested tree: ids are paths (`'a/b/c'`), so labels may repeat. */
export function treeRows(root: Nested): TreeData {
  const out: TreeData = { ids: [], labels: [], parents: [] };
  const walk = (node: Nested, parent: string): void => {
    const id = parent === '' ? node[0] : `${parent}/${node[0]}`;
    out.ids.push(id);
    out.labels.push(node[0]);
    out.parents.push(parent);
    for (const child of node[1] ?? []) walk(child, id);
  };
  walk(root, '');
  return out;
}

/** The source tree of a made-up charting library: forty-odd files in four packages. */
export const SOURCE_TREE: Nested = [
  'chartlib',
  [
    [
      'core',
      [
        ['schema', [['attributes'], ['coerce'], ['validate']]],
        ['scales', [['linear'], ['log'], ['date'], ['category']]],
        ['color', [['parse'], ['colorscale']]],
        ['registry'],
      ],
    ],
    [
      'render',
      [
        ['primitives', [['markers'], ['lines'], ['rects'], ['text'], ['arcs']]],
        ['camera', [['pan-zoom'], ['orbit']]],
        ['shaders', [['sdf'], ['dash']]],
        ['picking'],
      ],
    ],
    [
      'traces',
      [
        ['scatter'],
        ['bar'],
        ['heatmap'],
        ['graph', [['model'], ['layouts'], ['labels']]],
        ['sankey'],
      ],
    ],
    [
      'components',
      [['legend'], ['colorbar'], ['axes', [['ticks'], ['titles']]], ['hover'], ['modebar']],
    ],
  ],
];

/**
 * A tree of life in outline: the major groups of animals with a backbone and a few of each, some
 * eighty nodes. Depths differ a lot between branches, as in any real taxonomy.
 */
export const VERTEBRATES: Nested = [
  'Vertebrates',
  [
    [
      'Fishes',
      [
        ['Sharks', [['Great white'], ['Hammerhead'], ['Whale shark']]],
        ['Rays', [['Manta'], ['Stingray']]],
        [
          'Bony fishes',
          [['Salmon'], ['Tuna'], ['Seahorse'], ['Eel'], ['Cod'], ['Clownfish'], ['Pike']],
        ],
      ],
    ],
    [
      'Amphibians',
      [
        ['Frogs', [['Tree frog'], ['Toad'], ['Bullfrog']]],
        ['Salamanders', [['Newt'], ['Axolotl']]],
      ],
    ],
    [
      'Reptiles',
      [
        ['Turtles', [['Sea turtle'], ['Tortoise']]],
        ['Lizards', [['Gecko'], ['Iguana'], ['Chameleon'], ['Komodo dragon']]],
        ['Snakes', [['Python'], ['Cobra'], ['Viper']]],
        ['Crocodilians', [['Crocodile'], ['Alligator']]],
      ],
    ],
    [
      'Birds',
      [
        ['Raptors', [['Eagle'], ['Falcon'], ['Owl']]],
        ['Songbirds', [['Sparrow'], ['Robin'], ['Crow'], ['Finch']]],
        ['Waterfowl', [['Duck'], ['Swan'], ['Goose']]],
        ['Flightless', [['Ostrich'], ['Penguin'], ['Kiwi']]],
      ],
    ],
    [
      'Mammals',
      [
        ['Monotremes', [['Platypus'], ['Echidna']]],
        ['Marsupials', [['Kangaroo'], ['Koala'], ['Wombat']]],
        [
          'Placentals',
          [
            ['Primates', [['Human'], ['Chimpanzee'], ['Lemur']]],
            ['Rodents', [['Mouse'], ['Beaver'], ['Squirrel']]],
            ['Carnivores', [['Wolf'], ['Lion'], ['Bear'], ['Otter']]],
            ['Hoofed', [['Horse'], ['Deer'], ['Giraffe']]],
            ['Whales', [['Dolphin'], ['Blue whale']]],
            ['Bats', [['Fruit bat'], ['Pipistrelle']]],
          ],
        ],
      ],
    ],
  ],
];
