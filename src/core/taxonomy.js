// Two-level category taxonomy for sketches: top-level groups, each holding an
// ordered list of leaf subcategories. Sketches are tagged with a single leaf
// `category` (see src/sketches/*.js); the group is derived from this table.
// A category not found here (custom, typed into the new-sketch form) falls
// back to the Experiments group.
export const TAXONOMY = [
  {
    group: 'Mathematics',
    categories: ['Fractals', 'Dynamical Systems', 'Chaos', 'Number Theory', 'Algebraic Art', 'Geometry', 'Topology'],
  },
  {
    group: 'Systems',
    categories: ['Cellular Automata', 'Reaction-Diffusion', 'Emergence', 'Growth', 'Physics', 'Optimization', 'Graphs & Networks'],
  },
  {
    group: 'Fields',
    categories: ['Vector Fields', 'Fluid Flow', 'Waves', 'Particles', 'Probability'],
  },
  {
    group: 'Geometry',
    categories: ['3D', 'Knots', 'Surfaces', 'Splines', 'Voxels', 'Meshes', 'Non-Euclidean', '4D'],
  },
  {
    group: 'Rendering',
    categories: ['Shaders', 'Ray Tracing', 'Optics', 'Materials', 'Procedural Textures'],
  },
  {
    group: 'Audio',
    categories: ['Waveforms', 'Spectra', 'Synthesis', 'Visualization', 'Audio-Reactive'],
  },
  {
    // Catch-all: anything combining categories above, or not yet classified.
    group: 'Experiments',
    categories: [],
  },
];

const CATEGORY_TO_GROUP = new Map(
  TAXONOMY.flatMap(({ group, categories }) => categories.map((cat) => [cat, group]))
);

export function getGroupForCategory(category) {
  return CATEGORY_TO_GROUP.get(category) || 'Experiments';
}

export function getAllCategories() {
  return TAXONOMY.flatMap((g) => g.categories);
}
