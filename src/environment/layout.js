// Island layout: the structure the environment is built around. Decides the
// vegetation zones (beach -> dense forest), the sites of houses, tree houses
// and landmarks, the walking-path network that connects them, and where ships
// and beach waves go. Deterministic (seeded) and computed from the terrain.
import { fbm, mulberry32, smoothstep } from '../world/noise.js'
import { ISLANDS } from '../world/islands.js'
import { heightAt, inlandAt, terrainHeightAt } from '../world/worldStore.js'
import { PLACEMENT as P } from './environmentConfig.js'

const island = ISLANDS[0]
const [OX, OZ] = island.position

const onMountain = (x, z) => heightAt(x, z) > terrainHeightAt(x, z) + 0.4

/** Height range over a disc: small = flat enough to build on. */
function unevenness(x, z, r) {
  let lo = Infinity
  let hi = -Infinity
  for (let a = 0; a < 8; a++) {
    for (const f of [0.5, 1]) {
      const h = heightAt(x + Math.cos((a / 8) * Math.PI * 2) * r * f, z + Math.sin((a / 8) * Math.PI * 2) * r * f)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
  }
  return hi - lo
}

/** Unit vector pointing inland (up the inland-distance gradient). */
function inlandDir(x, z) {
  const e = 6
  const gx = inlandAt(x + e, z) - inlandAt(x - e, z)
  const gz = inlandAt(x, z + e) - inlandAt(x, z - e)
  const l = Math.hypot(gx, gz) || 1
  return [gx / l, gz / l]
}

/** Walk from a point along a direction until the inland distance reaches `target`. */
function marchToInland(x, z, dx, dz, target, maxDist = 2000) {
  for (let t = 0; t < maxDist; t += 3) {
    const d = inlandAt(x + dx * t, z + dz * t)
    if (d <= target) return [x + dx * t, z + dz * t]
  }
  return null
}

/**
 * @param mountain { x, z, radius } world-space main mountain
 * @param spawn { x, z } player start (on the southern beach)
 */
export function planLayout(mountain, spawn) {
  const rand = mulberry32(P.seed + 7)
  const R = island.extent

  // --- zones: percentiles of inland distance over the island's open land
  const ds = []
  for (let z = OZ - R; z < OZ + R; z += 14) {
    for (let x = OX - R; x < OX + R; x += 14) {
      const d = inlandAt(x, z)
      if (d > P.zones.beach && !onMountain(x, z)) ds.push(d)
    }
  }
  ds.sort((a, b) => a - b)
  const pct = (q) => ds[Math.min(ds.length - 1, Math.floor(q * ds.length))]
  const zones = { beach: P.zones.beach, light: pct(P.zones.light), medium: pct(P.zones.medium), dense: pct(P.zones.dense) }
  /** 0 on the beach, rising smoothly to 1 in the dense forest */
  const density = (d) => (d < zones.beach ? 0 : 0.05 + 0.95 * Math.pow(smoothstep(zones.beach, zones.medium + (zones.dense - zones.medium) * 0.5, d), 1.4))

  // --- sites
  const sites = []
  const away = (x, z, r) => sites.every((s) => Math.hypot(s.x - x, s.z - z) > r)
  const toMountain = [mountain.x - spawn.x, mountain.z - spawn.z]
  const tl = Math.hypot(...toMountain)

  // beach entries: the spawn beach plus two more around the coast
  const beachEntries = [{ x: spawn.x, z: spawn.z, kind: 'beach' }]
  const baseAng = Math.atan2(spawn.z - OZ, spawn.x - OX)
  for (const da of [2.1, -2.0]) {
    const a = baseAng + da
    const p = marchToInland(OX + Math.cos(a) * 60, OZ + Math.sin(a) * 60, Math.cos(a), Math.sin(a), 40)
    if (p && !onMountain(...p) && unevenness(p[0], p[1], 6) < 3) beachEntries.push({ x: p[0], z: p[1], kind: 'beach' })
  }
  sites.push(...beachEntries)

  // forest entrance on the way from the spawn beach to the mountain, at the light-forest edge
  for (let t = 0; t < tl; t += 4) {
    const x = spawn.x + (toMountain[0] / tl) * t
    const z = spawn.z + (toMountain[1] / tl) * t
    if (inlandAt(x, z) >= zones.light) {
      sites.push({ x, z, kind: 'forestEntrance' })
      break
    }
  }
  // mountain access: where the walk towards the mountain meets its foot
  for (let t = 0; t < tl; t += 4) {
    const x = spawn.x + (toMountain[0] / tl) * t
    const z = spawn.z + (toMountain[1] / tl) * t
    if (onMountain(x, z)) {
      sites.push({ x: x - (toMountain[0] / tl) * 18, z: z - (toMountain[1] / tl) * 18, kind: 'mountainAccess' })
      break
    }
  }

  // candidate scan for buildings: flattest ground in the right zone
  const candidates = (dMin, dMax, flat, radius) => {
    const list = []
    for (let z = OZ - R; z < OZ + R; z += 18) {
      for (let x = OX - R; x < OX + R; x += 18) {
        const jx = x + rand() * 12
        const jz = z + rand() * 12
        const d = inlandAt(jx, jz)
        if (d < dMin || d > dMax || onMountain(jx, jz)) continue
        const u = unevenness(jx, jz, radius)
        if (u < flat) list.push({ x: jx, z: jz, u })
      }
    }
    return list.sort((a, b) => a.u - b.u)
  }
  // ordinary houses: flat open ground between the light and medium forest
  let houses = 0
  for (const c of candidates(zones.light * 0.85, zones.medium * 1.1, 2.2, 13)) {
    if (houses >= P.layout.houses) break
    if (!away(c.x, c.z, 150)) continue
    sites.push({ x: c.x, z: c.z, kind: 'house' })
    houses++
  }
  // tree houses: inside the dense forest
  let treeHouses = 0
  for (const c of candidates(zones.dense * 0.95, Infinity, 4, 9)) {
    if (treeHouses >= P.layout.treeHouses) break
    if (!away(c.x, c.z, 70)) continue
    sites.push({ x: c.x, z: c.z, kind: 'treeHouse' })
    treeHouses++
  }

  // waterfall in the foothills: steepest stretch of the mountain's lower slopes
  let valley = null
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    for (let r = mountain.radius * 0.45; r < mountain.radius * 1.1; r += 10) {
      const x = mountain.x + Math.cos(a) * r
      const z = mountain.z + Math.sin(a) * r
      const d = inlandAt(x, z)
      if (d < zones.light) continue
      const [dx, dz] = [Math.cos(a), Math.sin(a)] // downhill = away from the mountain
      const drop = heightAt(x - dx * 30, z - dz * 30) - heightAt(x + dx * 30, z + dz * 30)
      const below = heightAt(x + dx * 45, z + dz * 45)
      if (drop < 18 || below > 45 || onMountain(x + dx * 45, z + dz * 45)) continue
      if (!valley || drop > valley.drop) valley = { x, z, yaw: Math.atan2(dx, dz), drop }
    }
  }
  if (valley) sites.push({ x: valley.x + Math.sin(valley.yaw) * 58, z: valley.z + Math.cos(valley.yaw) * 58, kind: 'waterfallView' })

  // coastal waterfall: highest stretch of shoreline (the mountain's sea cliffs)
  let cliff = null
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const p = marchToInland(OX + Math.cos(a) * 40, OZ + Math.sin(a) * 40, Math.cos(a), Math.sin(a), 6)
    if (!p) continue
    const [ix, iz] = inlandDir(...p)
    const top = heightAt(p[0] + ix * 14, p[1] + iz * 14)
    if (!cliff || top > cliff.top) cliff = { x: p[0], z: p[1], top, yaw: Math.atan2(-ix, -iz) }
  }

  // cloudy mountain: crowns the island's second high point (its hill is part of the terrain)
  let cloudy = null
  if (island.peak) {
    const [cx, cz] = island.toWorld(island.peak.x, island.peak.z)
    cloudy = { x: cx, z: cz }
  }
  if (cloudy) {
    // a lookout point on its side facing the island centre
    const l = Math.hypot(cloudy.x - OX, cloudy.z - OZ) || 1
    sites.push({ x: cloudy.x - ((cloudy.x - OX) / l) * 120, z: cloudy.z - ((cloudy.z - OZ) / l) * 120, kind: 'lookout' })
  }

  // --- ocean: ships offshore, spread around the island
  const ships = []
  P.ships.forEach((def, k) => {
    const a = baseAng + 0.5 + (k / P.ships.length) * Math.PI * 2 + (rand() - 0.5) * 0.4
    const p = marchToInland(OX + Math.cos(a) * 80, OZ + Math.sin(a) * 80, Math.cos(a), Math.sin(a), -(110 + k * 35 + rand() * 40))
    if (p) ships.push({ ...def, x: p[0], z: p[1], yaw: a + Math.PI / 2 + (rand() - 0.5) * 0.8, phase: rand() * 10 })
  })

  // --- beach waves: along sandy shores (not below cliffs), rolling in towards the beach
  const waves = []
  const W = P.waves
  for (let a = 0; a < Math.PI * 2; a += 0.004) {
    const p = marchToInland(OX + Math.cos(a) * 40, OZ + Math.sin(a) * 40, Math.cos(a), Math.sin(a), 0)
    if (!p) continue
    if (waves.some((w) => Math.hypot(w.coastX - p[0], w.coastZ - p[1]) < W.spacing)) continue
    const [ix, iz] = inlandDir(...p)
    if (heightAt(p[0] + ix * 25, p[1] + iz * 25) > 5) continue // cliffs, not beach
    if (fbm(island.noise, p[0] / 300, p[1] / 300, 2) < -0.35) continue // a few calm stretches
    waves.push({ coastX: p[0], coastZ: p[1], x: p[0] - ix * W.offshore, z: p[1] - iz * W.offshore, yaw: Math.atan2(ix, iz), phase: rand() * 4 })
  }

  return { zones, density, sites, ships, waves, valley, cliff, cloudy }
}
