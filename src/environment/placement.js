// Environment placement: a deterministic plan of where every rock, tree, bush
// and grass tuft goes. Rules follow the island's geography (beach, coastline,
// grassland, forest, foothills, mountain) using the terrain's height, slope,
// distance from the coast and ground cover, with noise fields for natural
// clustering. A spatial hash keeps objects from overlapping each other.
import { createNoise2D, fbm, mulberry32, smoothstep } from '../world/noise.js'
import { groundCover } from '../world/terrain.js'
import { ISLANDS } from '../world/islands.js'
import { heightAt, inlandAt, terrainHeightAt } from '../world/worldStore.js'
import { PLACEMENT as P, PROTOTYPES, ROCKS } from './environmentConfig.js'

const island = ISLANDS[0]

/** Spatial hash of placed footprints (circles), for overlap tests and collision. */
export class FootprintGrid {
  constructor(cell = 8) {
    this.cell = cell
    this.map = new Map()
  }
  key(i, j) {
    return i * 100003 + j
  }
  add(x, z, r, solid = false) {
    const i = Math.floor(x / this.cell)
    const j = Math.floor(z / this.cell)
    const k = this.key(i, j)
    if (!this.map.has(k)) this.map.set(k, [])
    this.map.get(k).push({ x, z, r, solid })
  }
  /** true if a circle at (x, z) of radius r overlaps nothing placed yet */
  free(x, z, r, solidOnly = false) {
    const reach = Math.ceil((r + 12) / this.cell)
    const i0 = Math.floor(x / this.cell)
    const j0 = Math.floor(z / this.cell)
    for (let i = i0 - reach; i <= i0 + reach; i++) {
      for (let j = j0 - reach; j <= j0 + reach; j++) {
        const list = this.map.get(this.key(i, j))
        if (!list) continue
        for (const c of list) {
          if (solidOnly && !c.solid) continue
          const dx = c.x - x
          const dz = c.z - z
          if (dx * dx + dz * dz < (c.r + r) ** 2) return false
        }
      }
    }
    return true
  }
}

const info = { h: 0, d: 0, slope: 0, grass: 0, rock: 0, terrain: 0, onMountain: false }
const cover = { grass: 0, rock: 0 }
/** Everything the rules need to know about a ground point (world coordinates). */
function sample(x, z) {
  const h = heightAt(x, z)
  const e = 1.5
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e)
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)
  info.h = h
  info.terrain = terrainHeightAt(x, z)
  info.onMountain = h > info.terrain + 0.4
  info.d = inlandAt(x, z)
  info.slope = 1 - 1 / Math.hypot(gx, 1, gz)
  const [lx, lz] = island.toLocal(x, z)
  groundCover(island, lx, lz, h, info.d, info.slope, cover)
  info.grass = info.onMountain ? 0 : cover.grass
  info.rock = cover.rock
  return info
}

/** Lowest ground under a footprint, so nothing hangs over a slope. */
function groundUnder(x, z, r) {
  let h = heightAt(x, z)
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2
    h = Math.min(h, heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r))
  }
  return h
}

function pickWeighted(rand, entries) {
  let total = 0
  for (const [, w] of entries) total += w
  let r = rand() * total
  for (const [name, w] of entries) if ((r -= w) <= 0) return name
  return entries[entries.length - 1][0]
}

/**
 * Plan the island's environment.
 * @param lib prototype library (heights / radii), from buildLibrary()
 * @param mountain { x, z, radius } world-space mountain site
 * @param spawn { x, z } kept clear for the player
 */
/**
 * @param layout result of planLayout(): zones, sites, paths, landmarks
 */
export function planEnvironment(lib, mountain, spawn, layout) {
  const rand = mulberry32(P.seed)
  const n = createNoise2D(P.seed)
  const grid = new FootprintGrid()
  const instances = []
  const obstacles = []
  const R = island.extent
  const [ox, oz] = island.position
  const D = P.density

  grid.add(spawn.x, spawn.z, 7) // keep the start area clear

  const place = (name, x, z, opts) => {
    const def = PROTOTYPES[name]
    const proto = lib.get(name)
    if (!def || !proto) return null
    const scale = opts.scale ??
      (def.height ? (def.height[0] + rand() * (def.height[1] - def.height[0])) / proto.height : def.size[0] + rand() * (def.size[1] - def.size[0]))
    const footprint = Math.max(0.3, proto.radius * scale * (opts.footprint ?? def.footprint ?? 0.75))
    if (!opts.overlap && !grid.free(x, z, footprint)) return null
    const ground = opts.cheapGround ? heightAt(x, z) : groundUnder(x, z, Math.min(footprint, 3) * 0.6)
    const sink = (opts.sink ?? def.sink ?? 0.03) * proto.height * scale
    const inst = {
      name,
      category: def.category,
      x,
      y: (opts.y ?? ground) - sink,
      z,
      rotY: opts.yaw ?? rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * (opts.tilt ?? 0),
      tiltZ: (rand() - 0.5) * (opts.tilt ?? 0),
      scale,
      far: def.far,
    }
    instances.push(inst)
    if (!opts.overlap) grid.add(x, z, footprint, true)
    const trunk = def.trunkM ?? (def.trunk ? def.trunk * scale : 0)
    const solid = trunk || (opts.collide ? footprint * 0.85 : 0)
    // tree trunks always block; rocks and buildings only when they are big enough to matter
    if ((trunk ? solid > 0.08 : solid > 0.5) && inst.y + proto.height * scale > ground + 0.6) obstacles.push({ x, z, r: solid })
    return inst
  }
  const forEachCell = (spacing, fn) => {
    for (let z = oz - R; z < oz + R; z += spacing) {
      for (let x = ox - R; x < ox + R; x += spacing) fn(x + rand() * spacing, z + rand() * spacing)
    }
  }

  // --- 0. layout: paths stay clear, buildings and landmarks claim their ground first
  for (const path of layout.paths) {
    for (let i = 0; i < path.length; i += 2) grid.add(path[i][0], path[i][1], P.layout.pathWidth * 0.5 + 0.9, true)
  }
  if (layout.cloudy) grid.add(layout.cloudy.x, layout.cloudy.z, 95, true)
  if (layout.valley) grid.add(layout.valley.x, layout.valley.z, (lib.get('Waterfall_Valley')?.radius ?? 20) * 2.4 * 1.05, true)
  if (layout.cliff) grid.add(layout.cliff.x, layout.cliff.z, 30, true)
  const houseNames = ['Cabin', 'EcoHouse', 'Temple']
  const treeHouseNames = ['TreeHouse_Cottage', 'TreeHouse_Village', 'TreeHouse_Stilts', 'TreeHouse_Oak', 'TreeHouse_Pines']
  let hi = 0
  let ti = 0
  for (const site of layout.sites) {
    if (site.kind !== 'house' && site.kind !== 'treeHouse') continue
    const name = site.kind === 'house' ? houseNames[hi++ % houseNames.length] : treeHouseNames[ti++ % treeHouseNames.length]
    // face the building towards where its path arrives
    const node = layout.sites.reduce((best, s) => (s === site ? best : best && Math.hypot(best.x - site.x, best.z - site.z) < Math.hypot(s.x - site.x, s.z - site.z) ? best : s), null)
    const yaw = Math.atan2(node.x - site.x, node.z - site.z)
    place(name, site.x, site.z, { overlap: true, sink: 0.02, yaw, collide: true })
    grid.add(site.x, site.z, site.kind === 'house' ? 14 : 8, true) // a small clearing around it
  }

  // --- 1. rocks where the mountain meets the foothills
  for (let i = 0, tries = 0; i < P.rocks.mountainRing && tries < 2000; tries++) {
    const a = rand() * Math.PI * 2
    const r = mountain.radius * (0.35 + rand() * 0.6)
    const x = mountain.x + Math.cos(a) * r
    const z = mountain.z + Math.sin(a) * r
    const s = sample(x, z)
    if (s.d < 30 || Math.abs(s.h - s.terrain) > 6 || s.slope > 0.7) continue
    if (place(ROCKS.mountain[Math.floor(rand() * ROCKS.mountain.length)], x, z, { scale: 3 + rand() * 4.5, sink: 0.25, tilt: 0.3, collide: true })) i++
  }

  // --- 2. tall sea stacks off rocky headlands, standing in the water
  for (let i = 0, tries = 0; i < P.rocks.stacks && tries < 6000; tries++) {
    const x = ox + (rand() * 2 - 1) * R
    const z = oz + (rand() * 2 - 1) * R
    const s = sample(x, z)
    if (s.d > -9 || s.d < -32 || fbm(n, x / 200, z / 200, 2) < 0.05) continue
    const name = ROCKS.stacks[Math.floor(rand() * ROCKS.stacks.length)]
    const proto = lib.get(name)
    const scale = Math.max(6, (-s.h + 6) / (proto.height * 0.9)) * (0.9 + rand() * 0.5)
    if (place(name, x, z, { scale, sink: 0.08, tilt: 0.12 })) i++
  }

  // --- 3. rocky stretches of coastline: clusters at the water's edge, some half-submerged
  forEachCell(P.rocks.coastSpacing / 2, (x, z) => {
    const s = sample(x, z)
    if (s.d < -7 || s.d > 5) return
    const cluster = fbm(n, x / 150 + 30, z / 150, 3)
    if (cluster < 0.12 || rand() > P.rocks.coastChance * smoothstep(0.12, 0.4, cluster)) return
    const name = ROCKS.coastal[Math.floor(rand() * ROCKS.coastal.length)]
    place(name, x, z, { scale: 2 + rand() * 3.5, sink: 0.22, tilt: 0.35, collide: true })
    // smaller companions around the main rock
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI * 2
      const r = 4 + rand() * 7
      place(ROCKS.beach[Math.floor(rand() * ROCKS.beach.length)], x + Math.cos(a) * r, z + Math.sin(a) * r, { scale: 0.9 + rand() * 1.6, sink: 0.3, tilt: 0.5 })
    }
  })

  // --- 4. mossy rock mounds on hilltops
  for (let i = 0, tries = 0; i < P.rocks.mounds && tries < 3000; tries++) {
    const x = ox + (rand() * 2 - 1) * R
    const z = oz + (rand() * 2 - 1) * R
    const s = sample(x, z)
    if (s.onMountain || s.d < 120 || s.h < 12 || s.slope > 0.35) continue
    if (place('Rock_Mound', x, z, { sink: 0.4, footprint: 0.6 })) i++
  }

  // --- 5. inland rock outcrops in grassland and forest
  forEachCell(P.rocks.inland.spacing, (x, z) => {
    const s = sample(x, z)
    if (s.d < 60 || s.onMountain || s.slope > 0.5) return
    if (rand() > P.rocks.inland.chance * (0.4 + fbm(n, x / 90 - 7, z / 90, 2))) return
    const name = ROCKS.inland[Math.floor(rand() * ROCKS.inland.length)]
    const big = /Group/.test(name)
    place(name, x, z, { scale: big ? 1.4 + rand() * 1.6 : 1.5 + rand() * 2.5, sink: 0.25, tilt: 0.3, collide: big })
  })

  // --- 6. trees: density rises from the beach to the dense forest, with natural
  // clearings. High-quality trees on low ground, low-quality trees on high ground,
  // blended across a band so there is no visible boundary.
  // the heaviest models (oaks, old tree: 16-23k triangles) are feature trees; lighter ones carry the forest
  const highQuality = [['Oak_A', 0.7], ['Oak_B', 0.7], ['Tree_GN', 3], ['Tree_A', 2], ['Old_Tree', 0.25], ['Pine_Tall_001', 1.3], ['Pine_Tall_002', 1.3], ['Pine_Young_001', 2.2], ['Pine_Young_003', 2]]
  const lowQuality = [['pine1', 3], ['Pine2', 3], ['tree2', 3], ['TreeSmall', 2], ['Forest_Card_2_1_4', 2], ['Forest_Card_2_1_7', 2], ['Forest_Card_2_1_1', 2], ['Forest_Card_1_1_3', 1.5], ['Forest_Card_1_1_0', 1.5]]
  const T = P.trees
  forEachCell(T.spacing, (x, z) => {
    const s = sample(x, z)
    const ground = s.onMountain ? (s.slope < 0.42 && s.h - s.terrain < 70 ? 1 : 0) : s.grass
    if (ground < 0.45 || s.slope > 0.5) return
    let dens = s.onMountain ? 0.5 : layout.density(s.d)
    const clearing = fbm(n, x / T.clearingScale + 3, z / T.clearingScale - 8, 3)
    dens *= smoothstep(-0.45, -0.15, clearing) // open glades scattered through the forest
    if (rand() > dens * D) return
    // quality class by elevation, with a soft blended band
    const high = rand() < smoothstep(T.highGround - 8, T.highGround + 8, s.h) || s.onMountain
    // forest trees only reserve their core, so canopies overlap in the dense forest
    place(pickWeighted(rand, high ? lowQuality : highQuality), x, z, { sink: 0.03, tilt: 0.05, footprint: 0.28 })
  })

  // --- 7. palms: a few along the beaches and in the beach transition, in loose groups
  forEachCell(P.palms.spacing, (x, z) => {
    const s = sample(x, z)
    if (s.d < P.palms.minInland || s.d > Math.min(P.palms.maxInland, layout.zones.light) || s.h > 7 || s.slope > 0.3) return
    const group = fbm(n, x / P.palms.clusterScale - 20, z / P.palms.clusterScale + 11, 2)
    if (rand() > P.palms.chance * D * smoothstep(-0.05, 0.3, group)) return
    place(rand() < 0.55 ? 'Palm_A' : 'Palm_B', x, z, { sink: 0.02, tilt: PROTOTYPES.Palm_A.lean })
  })

  // --- 8. bushes and plants: sparse in the transition, thicker in the forest
  const bushes = [['BushBig2', 2], ['BushMed', 3], ['BushMed2', 3], ['BushSmall', 3], ['BushSmall2', 3], ['BushFlowerSmall', 2], ['MushBig', 1], ['Plant_6', 2], ['Plant_7', 2], ['Plant_15', 2], ['Plant_16', 2], ['Forest_Card_1_0_8', 2]]
  forEachCell(P.bushes.spacing, (x, z) => {
    const s = sample(x, z)
    if (s.grass < 0.55 || s.slope > 0.45) return
    if (rand() > P.bushes.chance * D * (0.25 + layout.density(s.d))) return
    place(pickWeighted(rand, bushes), x, z, { sink: 0.08, footprint: 0.5 })
  })

  // --- 10. stones scattered on the beaches
  forEachCell(P.rocks.beachStones.spacing, (x, z) => {
    const s = sample(x, z)
    if (s.d < 2 || s.d > 45 || s.grass > 0.3) return
    if (rand() > P.rocks.beachStones.chance) return
    place(ROCKS.beach[Math.floor(rand() * ROCKS.beach.length)], x, z, { scale: 0.6 + rand() * 1.3, sink: 0.35, tilt: 0.6 })
  })

  // --- 11. grass: clumps of tufts on grassland, thinning towards the beach and slopes
  const grasses = [['Grass_Tuft', 4], ['Grass_Clump', 3], ['Grass_Small', 2]]
  forEachCell(P.grass.spacing, (x, z) => {
    if (inlandAt(x, z) < P.grass.minInland) return // cheap test first: skip sea and beach
    const s = sample(x, z)
    if (s.grass < 0.45 || s.slope > 0.5) return
    if (!grid.free(x, z, 1.4, true)) return // not on paths, under buildings or in rocks
    const patchy = 0.55 + 0.45 * fbm(n, x / 40 + 50, z / 40, 2)
    if (rand() > P.grass.chance * D * s.grass * patchy) return
    const tufts = 2 + Math.floor(rand() * 3)
    for (let k = 0; k < tufts; k++) {
      const gx = x + (rand() - 0.5) * 3.2
      const gz = z + (rand() - 0.5) * 3.2
      if (!grid.free(gx, gz, 0.4, true)) continue // not inside rocks / trunks
      place(rand() < P.grass.patchChance ? 'Grass_Patch' : pickWeighted(rand, grasses), gx, gz, { overlap: true, sink: 0.05, cheapGround: true })
    }
  })

  return { instances, obstacles }
}
