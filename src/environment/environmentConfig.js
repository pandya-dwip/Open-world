// Environment configuration: which downloaded prototypes are used, how they are
// scaled and rendered, and the placement rules for each region of the island.
// All values are tunable here; the placement code reads nothing else.
import { LOW_END } from '../world/quality.js'

const base = import.meta.env.BASE_URL + 'assets/environment/'

/** Optimised kits built by `npm run build:env` from Assets/environment-source/. */
export const KITS = {
  trees: base + 'trees/trees.glb',
  rocks: base + 'rocks/rocks.glb',
  grass: base + 'grass/grass.glb',
  mountains: base + 'mountains/mountains.glb',
}
export const MOUNTAIN_HEIGHTMAP = { bin: base + 'mountains/mountain-height.bin', json: base + 'mountains/mountain-height.json' }

/**
 * Render settings per category. `near` = draw distance of the detailed model;
 * `far` = draw distance of its cheap stand-in (if it has one). Chunk = cell
 * size used for distance culling. Lower values on phones / small screens.
 */
const q = (desktop, mobile) => (LOW_END ? mobile : desktop)
export const CATEGORIES = {
  tree: { chunk: 220, near: q(420, 240), far: q(2600, 1500), shadows: true },
  hero: { chunk: 220, near: q(150, 90), far: q(2600, 1500), shadows: true }, // heavy feature trees
  palm: { chunk: 220, near: q(650, 320), far: 0, shadows: true },
  bush: { chunk: 120, near: q(200, 120), far: 0, shadows: true },
  grass: { chunk: 40, near: q(65, 40), far: 0, shadows: false },
  rock: { chunk: 220, near: q(600, 350), far: 0, shadows: true },
  stone: { chunk: 120, near: q(160, 100), far: 0, shadows: true },
}

/**
 * Prototypes taken from the kits. `size` = random uniform scale range,
 * `far` = stand-in prototype drawn at distance, `near` = detailed draw distance
 * (overrides the category), `trunk` = collision radius per unit scale (metres),
 * `sink` = how far the base is pushed into the ground (fraction of height).
 */
export const PROTOTYPES = {
  // palms (Palm Trees by ElectroNick) for beaches
  Palm_A: { kit: 'trees', category: 'palm', size: [0.5, 0.75], trunk: 0.35, lean: 0.12 },
  Palm_B: { kit: 'trees', category: 'palm', size: [0.45, 0.6], trunk: 0.35, lean: 0.12 },
  // pines extracted from Pine Forest at Sunset (Jagobo)
  // detailed (7-15k triangles): drawn up close only, low-poly pines stand in further away
  Pine_Tall_001: { kit: 'trees', category: 'tree', size: [0.9, 1.3], trunk: 0.35, far: 'Pine2', near: q(170, 100) },
  Pine_Tall_002: { kit: 'trees', category: 'tree', size: [0.9, 1.3], trunk: 0.35, far: 'Pine2', near: q(170, 100) },
  Pine_Young_001: { kit: 'trees', category: 'tree', size: [0.9, 1.4], trunk: 0.25, far: 'Pine2', near: q(170, 100) },
  Pine_Young_003: { kit: 'trees', category: 'tree', size: [1.0, 1.6], trunk: 0.2, far: 'pine1', near: q(170, 100) },
  // Trees and bush Pack LOWPOLY (EFX): leaf-card trees, cheap enough for whole forests
  // leaf-card trees are only a few dozen triangles: drawn at full detail all the way out
  pine1: { kit: 'trees', category: 'tree', size: [0.26, 0.36], trunk: 0.35, near: q(2600, 1500) },
  Pine2: { kit: 'trees', category: 'tree', size: [0.26, 0.36], trunk: 0.35, near: q(2600, 1500) },
  tree2: { kit: 'trees', category: 'tree', size: [0.45, 0.65], trunk: 0.35, near: q(2600, 1500) },
  TreeSmall: { kit: 'trees', category: 'tree', size: [0.55, 0.8], trunk: 0.25, near: q(2600, 1500) },
  BushBig2: { kit: 'trees', category: 'bush', size: [0.22, 0.32] },
  BushMed: { kit: 'trees', category: 'bush', size: [0.22, 0.32] },
  BushMed2: { kit: 'trees', category: 'bush', size: [0.22, 0.32] },
  BushSmall: { kit: 'trees', category: 'bush', size: [0.3, 0.45] },
  BushSmall2: { kit: 'trees', category: 'bush', size: [0.3, 0.45] },
  BushFlowerSmall: { kit: 'trees', category: 'bush', size: [0.25, 0.35] },
  MushBig: { kit: 'trees', category: 'bush', size: [0.2, 0.28] },
  // feature trees: More Realistic Trees (Nicholas-3D) and Old Tree (gelmi.com.br)
  Oak_A: { kit: 'trees', category: 'hero', size: [1.4, 1.8], trunk: 0.45, far: 'tree2' },
  Oak_B: { kit: 'trees', category: 'hero', size: [1.4, 1.8], trunk: 0.5, far: 'tree2' },
  Old_Tree: { kit: 'trees', category: 'hero', size: [1.5, 1.9], trunk: 0.6, far: 'tree2' },
  // grass and plants (Grass by Cosmic_dust, Realistics grass 06, Scanned Plants by Kless)
  Grass_Tuft: { kit: 'grass', category: 'grass', size: [0.9, 1.5] },
  Grass_Clump: { kit: 'grass', category: 'grass', size: [0.8, 1.3] },
  Grass_Small: { kit: 'grass', category: 'grass', size: [2.0, 3.2] },
  Grass_Patch: { kit: 'grass', category: 'grass', size: [0.7, 1.0] },
  Plant_6: { kit: 'grass', category: 'bush', size: [0.35, 0.55] },
  Plant_7: { kit: 'grass', category: 'bush', size: [0.35, 0.55] },
  Plant_15: { kit: 'grass', category: 'bush', size: [0.5, 0.8] },
  Plant_16: { kit: 'grass', category: 'bush', size: [0.5, 0.8] },
  // Stylised Rocks Asset Pack (Bl4ckGh0st) + Rocks mound (gelmi.com.br)
  Rock_Mound: { kit: 'rocks', category: 'rock', size: [0.9, 1.4], sink: 0.35 },
}

// Rock families: the pack has numbered variants of each style.
const range = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`)
export const ROCKS = {
  coastal: [...range('Plain_Rock_Group', 1, 7), ...range('Mossy_Rock_Group', 1, 6)],
  stacks: ['Plain_Rock_Group4', 'Plain_Rock_Group5', 'Plain_Rock_Group7', 'Mossy_Rock_Group7'],
  beach: [...range('Desert_Rock', 1, 16), ...range('Plain_Rock', 1, 12)],
  inland: [...range('Mossy_Rock', 1, 20), ...range('Mossy_Rock_Group', 8, 14)],
  mountain: [...range('Plain_Rock_Group', 1, 14), ...range('Mossy_Rock_Group', 1, 7)],
}
for (const name of new Set(Object.values(ROCKS).flat())) {
  PROTOTYPES[name] ||= { kit: 'rocks', category: /Group/.test(name) ? 'rock' : 'stone', size: [1, 1], sink: 0.25 }
}

/** Where things grow. Distances are metres inland from the coastline. */
export const PLACEMENT = {
  seed: 20260,
  density: LOW_END ? 0.6 : 1, // global multiplier for trees / bushes / grass
  forest: {
    spacing: 7.5, // jittered grid spacing in the densest forest (m)
    noiseScale: 300, // size of forest patches (m)
    threshold: 0.08, // higher = fewer, smaller forests
    pineAbove: 22, // terrain height above which conifers take over (m)
    heroChance: 0.012, // fraction of broadleaf trees that are feature trees
  },
  woodland: { spacing: 26, chance: 0.18 }, // scattered trees in open grassland
  palms: { minInland: 10, maxInland: 70, spacing: 16, chance: 0.42, clusterScale: 120 },
  bushes: { spacing: 9, chance: 0.22 },
  grass: { spacing: 4.5, chance: 0.6, patchChance: 0.04, minInland: 45 }, // clumps of 2-4 tufts per cell
  rocks: {
    coastSpacing: 26, // along the shoreline
    coastChance: 0.55,
    stacks: 7, // tall offshore rock formations
    beachStones: { spacing: 16, chance: 0.12 },
    inland: { spacing: 40, chance: 0.2 },
    mounds: 9,
    mountainRing: 34,
  },
}
