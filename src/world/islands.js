// Island definition. Pure JS (no three.js) so the generator worker can use it.
// One irregular main island (overlapping lobes with a carved bay) and several
// islets. Beaches rise into rolling grassland and hills; broad foothills in the
// north cradle the downloaded mountain model, whose base is buried in them.
import { createNoise2D, fbm, smoothstep } from './noise.js'

export const SEA_FLOOR = -20

const DEFS = [
  {
    id: 'sand',
    name: 'Sand Island',
    position: [0, 0],
    rotation: 0.3,
    radius: 420, // reference size; blob positions and radii are in these units
    seed: 11,
    coast: { amp: 0.2, freq: 1.8, warp: 0.1, warpFreq: 1.5, detail: 0.02 },
    // Land blobs: centre (x, z), radius r, stretch [sx, sz], rotation.
    blobs: [
      { x: 0, z: 0, r: 1.0, scale: [1.25, 0.9], rot: 0.3 }, // main body
      { x: 0.85, z: -0.55, r: 0.5, scale: [1.4, 0.8], rot: -0.6 }, // north-east peninsula
      { x: -0.9, z: 0.45, r: 0.45, scale: [1.2, 0.9], rot: 0.9 }, // south-west lobe
      { x: 2.0, z: 0.5, r: 0.22, scale: [1.2, 0.9], rot: 0.4 }, // islets
      { x: 1.6, z: 1.35, r: 0.14, scale: [1, 1], rot: 0 },
      { x: -1.95, z: -0.7, r: 0.28, scale: [1.5, 0.8], rot: 0.5 },
      { x: -0.4, z: -1.75, r: 0.18, scale: [1.3, 0.9], rot: -0.3 },
      { x: 0.65, z: -1.85, r: 0.1, scale: [1, 1], rot: 0 },
      { x: -2.1, z: 0.95, r: 0.12, scale: [1.2, 1], rot: 1.1 },
    ],
    // Water carved out of the main body: a bay on the southern side.
    bays: [{ x: 0.3, z: 0.9, r: 0.42 }],
    beach: 40, // distance over which the shore rises from the waterline
    sand: '#e9d6a2',
    // Where the downloaded mountain model stands (island-local metres): position,
    // yaw, scale and base height. Foothills (radius / height) rise around it, and
    // the terrain also extends the model's own slopes outwards (see mountainField.js).
    mountain: { x: -40, z: -150, yaw: 0, scale: 1.05, y0: 6, radius: 360, height: 22 },
    // second high point for the downloaded cloudy mountain: a broad hill on the north-east peninsula
    peak: { x: 380, z: -225, radius: 170, height: 34 },
  },
]

function buildIsland(def) {
  const n = createNoise2D(def.seed)
  const [px, pz] = def.position
  const cos = Math.cos(def.rotation)
  const sin = Math.sin(def.rotation)
  const R = def.radius
  const { amp, freq, warp, warpFreq, detail } = def.coast
  const blobs = def.blobs.map((b, i) => ({ ...b, c: Math.cos(b.rot), s: Math.sin(b.rot), off: i * 19.3 }))
  const SKIP = 90 / R // beyond this distance offshore (in R units) a blob cannot matter

  /**
   * Signed distance inland in R units (approximate): positive on land,
   * negative offshore. The archipelago is the union of all blobs minus bays.
   */
  function shapeAt(u, v) {
    let s = -Infinity
    for (const b of blobs) {
      const dx = u - b.x
      const dz = v - b.z
      const qx = (dx * b.c - dz * b.s) / (b.r * b.scale[0])
      const qz = (dx * b.s + dz * b.c) / (b.r * b.scale[1])
      const q = Math.hypot(qx, qz)
      if (b.r * (1 - q / (1 + amp)) < -SKIP) continue // too far away to affect this point
      const ang = Math.atan2(qz, qx)
      const wobble = fbm(n, Math.cos(ang) * freq + 3.1 + b.off, Math.sin(ang) * freq + 7.7, 4) * amp
      s = Math.max(s, b.r * (1 - q / (1 + wobble)))
    }
    for (const bay of def.bays) s = Math.min(s, Math.hypot(u - bay.x, v - bay.z) - bay.r)
    return s
  }

  const M = def.mountain

  /**
   * Terrain relief above the beach, in metres, for a point `d` metres inland.
   * Gentle dunes near the shore, rolling grassland and hills further in, and
   * foothills that climb towards the mountain site.
   */
  function relief(x, z, d) {
    const inland = smoothstep(def.beach * 0.6, def.beach * 4.5, d)
    const dunes = (fbm(n, x / 25, z / 25, 3) * 0.5 + 0.5) * 2.2 * (1 - inland)
    const rolling = (fbm(n, x / 210 + 5, z / 210 - 3, 4) * 0.5 + 0.5) * 14
    const hills = Math.max(0, fbm(n, x / 120 - 9, z / 120 + 4, 3)) * 22
    const rM = Math.hypot(x - M.x, z - M.z)
    const foot = M.height * smoothstep(M.radius, M.radius * 0.28, rM)
    const pk = def.peak ? def.peak.height * smoothstep(def.peak.radius, def.peak.radius * 0.2, Math.hypot(x - def.peak.x, z - def.peak.z)) : 0
    const footBumps = fbm(n, x / 60, z / 60, 3) * 7 * smoothstep(M.radius, M.radius * 0.5, rM)
    return dunes + inland * (2 + rolling + hills * smoothstep(60, 220, d) + foot + footBumps) + pk * smoothstep(5, 60, d)
  }

  // set by the terrain worker: terrain height required around the mountain model
  let mountainSkirt = null

  const out = { h: 0, d: 0 }
  /** Height and distance inland (negative offshore) at island-local coordinates. */
  function surfaceLocal(x, z) {
    const u0 = x / R
    const v0 = z / R
    // domain warp gives organic bays and headlands
    const u = u0 + fbm(n, u0 * warpFreq + 17, v0 * warpFreq - 3, 3) * warp
    const v = v0 + fbm(n, u0 * warpFreq - 11, v0 * warpFreq + 29, 3) * warp
    let s = shapeAt(u, v)
    if (s === -Infinity) {
      out.h = SEA_FLOOR
      out.d = -1e4
      return out
    }
    s += fbm(n, u * 7 + 11, v * 7 - 5, 3) * detail

    const d = s * R // approximate distance inland, world units
    out.d = d
    if (d < 0) {
      // gentle shelf, then a steeper drop to the sea floor
      const o = -d
      const h = -(0.13 * o + 0.42 * Math.max(o - 24, 0))
      out.h = Math.max(SEA_FLOOR, h + fbm(n, u * 20, v * 20, 2) * 0.4)
      return out
    }
    const b = def.beach
    out.h = (Math.min(d, b) / b) * 1.6 + relief(x, z, d)
    if (mountainSkirt) out.h = Math.max(out.h, mountainSkirt(x, z))
    return out
  }

  const heightLocal = (x, z) => surfaceLocal(x, z).h

  // half-size of the square terrain patch that covers every blob plus its shelf
  const reach = Math.max(
    ...blobs.map((b) => Math.max(Math.abs(b.x), Math.abs(b.z)) + b.r * Math.max(...b.scale) * (1 + amp)),
  )
  const extent = (reach + warp) * R + 90

  return {
    ...def,
    noise: n,
    extent,
    heightLocal,
    surfaceLocal,
    setMountainSkirt(fn) {
      mountainSkirt = fn
    },
    toLocal(wx, wz) {
      const dx = wx - px
      const dz = wz - pz
      return [dx * cos - dz * sin, dx * sin + dz * cos]
    },
    toWorld(lx, lz) {
      return [px + lx * cos + lz * sin, pz - lx * sin + lz * cos]
    },
  }
}

export const ISLANDS = DEFS.map(buildIsland)

/** Half-size of the square region covered by the ocean depth map. */
export const WORLD_BOUNDS = 1600
