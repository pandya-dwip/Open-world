// Island definition. Pure JS (no three.js) so the generator worker can use it.
// A sand archipelago: one irregular main island (built from overlapping lobes
// with a carved bay) surrounded by several smaller islets. Sand only.
import { createNoise2D, fbm } from './noise.js'

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
    // soft, low undulation so the sand catches light; no hills or peaks
    relief(u, v, s, n) {
      return Math.min(s, 1) * 5 + (fbm(n, u * 4, v * 4, 3) * 0.5 + 0.5) * 2.5
    },
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

  /** Height at island-local coordinates. */
  function heightLocal(x, z) {
    const u0 = x / R
    const v0 = z / R
    // domain warp gives organic bays and headlands
    const u = u0 + fbm(n, u0 * warpFreq + 17, v0 * warpFreq - 3, 3) * warp
    const v = v0 + fbm(n, u0 * warpFreq - 11, v0 * warpFreq + 29, 3) * warp
    let s = shapeAt(u, v)
    if (s === -Infinity) return SEA_FLOOR
    s += fbm(n, u * 7 + 11, v * 7 - 5, 3) * detail

    const d = s * R // approximate distance inland, world units
    if (d < 0) {
      // gentle shelf, then a steeper drop to the sea floor
      const o = -d
      const h = -(0.13 * o + 0.42 * Math.max(o - 24, 0))
      return Math.max(SEA_FLOOR, h + fbm(n, u * 20, v * 20, 2) * 0.4)
    }
    const b = def.beach
    const shore = (Math.min(d, b) / b) * 1.6
    return shore + Math.min(1, d / (b * 3)) * def.relief(u, v, s, n)
  }

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
    toLocal(wx, wz) {
      const dx = wx - px
      const dz = wz - pz
      return [dx * cos - dz * sin, dx * sin + dz * cos]
    },
  }
}

export const ISLANDS = DEFS.map(buildIsland)

/** Half-size of the square region covered by the ocean depth map. */
export const WORLD_BOUNDS = 1600
