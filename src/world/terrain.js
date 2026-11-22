// Pure terrain generation (no three.js): runs inside the generator worker.
// Produces a height grid plus normals, base colours with a cavity (ambient
// occlusion) term, and the ocean depth map.
import { clamp, fbm, lerp, smoothstep } from './noise.js'
import { SEA_FLOOR, WORLD_BOUNDS } from './islands.js'

/** Grid cells per terrain chunk edge at full detail. */
export const CHUNK_CELLS = 128

/** Depth-map encoding: height range [SEA_FLOOR, SEA_FLOOR + DEPTH_RANGE] -> [0, 255]. */
export const DEPTH_RANGE = 30

/** Separable box blur, `passes` times (approximates a gaussian). */
function blur(src, N, radius, passes) {
  let a = Float32Array.from(src)
  let b = new Float32Array(src.length)
  const w = 2 * radius + 1
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < N; j++) {
      const row = j * N
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += a[row + clamp(k, 0, N - 1)]
      for (let i = 0; i < N; i++) {
        b[row + i] = sum / w
        sum += a[row + Math.min(i + radius + 1, N - 1)] - a[row + Math.max(i - radius, 0)]
      }
    }
    for (let i = 0; i < N; i++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += b[clamp(k, 0, N - 1) * N + i]
      for (let j = 0; j < N; j++) {
        a[j * N + i] = sum / w
        sum += b[Math.min(j + radius + 1, N - 1) * N + i] - b[Math.max(j - radius, 0) * N + i]
      }
    }
  }
  return a
}

export function generateIslandGrid(island, targetSpacing) {
  const extent = island.extent
  const size = extent * 2
  const chunks = Math.max(1, Math.ceil(size / (CHUNK_CELLS * targetSpacing)))
  const cells = chunks * CHUNK_CELLS
  const sp = size / cells
  const N = cells + 1
  let heights = new Float32Array(N * N)
  const inland = new Float32Array(N * N) // metres from the coast (negative offshore)
  for (let j = 0; j < N; j++) {
    const z = -extent + j * sp
    for (let i = 0; i < N; i++) {
      const s = island.surfaceLocal(-extent + i * sp, z)
      heights[j * N + i] = s.h
      inland[j * N + i] = s.d
    }
  }
  // light smoothing removes grid-scale spikes while keeping ridgelines
  heights = blur(heights, N, 1, sp < 3 ? 2 : 1)
  return { N, sp, extent, chunks, heights, inland }
}

/** Bilinear lookup of a grid field (heights by default) in island-local coordinates. */
export function sampleGrid(grid, lx, lz, field = grid.heights, outside = SEA_FLOOR) {
  const { N, sp, extent } = grid
  const fx = (lx + extent) / sp
  const fz = (lz + extent) / sp
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return outside
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const tx = fx - i
  const tz = fz - j
  const k = j * N + i
  const a = lerp(field[k], field[k + 1], tx)
  const b = lerp(field[k + N], field[k + N + 1], tx)
  return lerp(a, b, tz)
}

/**
 * Ground cover of the terrain at a grid point: how grassy and how rocky it is
 * (0..1 each). Sand is whatever is neither. Shared by the shader masks and by
 * the vegetation placement so plants only grow where grass is drawn.
 */
export function groundCover(island, x, z, h, d, slope, out) {
  const n = island.noise
  const jitter = fbm(n, x / 35 + 40, z / 35 - 40, 3) * 22
  // grass inland, and on any raised ground even close to the coast (no sand-coloured hills)
  let grass = Math.max(smoothstep(island.beach * 0.8, island.beach * 2.1, d + jitter), smoothstep(7, 14, h + jitter * 0.2))
  grass *= smoothstep(1.4, 2.6, h) * (1 - smoothstep(0.25, 0.42, slope))
  // rock on steep ground and, higher up, on the mountain's flanks
  const rock = Math.max(smoothstep(0.2, 0.38, slope + fbm(n, x / 18, z / 18, 2) * 0.06), smoothstep(55, 90, h + jitter))
  out.grass = grass * (1 - rock)
  out.rock = rock
  return out
}

/**
 * Normals, a soft ambient-occlusion shade (cavities darker) and the grass / rock
 * ground-cover masks the terrain shader blends with.
 */
export function computeShading(island, grid) {
  const { N, sp, extent, heights: H, inland } = grid
  const normals = new Float32Array(N * N * 3)
  const colors = new Float32Array(N * N * 3)
  const masks = new Float32Array(N * N * 2)
  const broad = blur(H, N, Math.max(2, Math.round(14 / sp)), 2)
  const n = island.noise
  const R = island.radius
  const cover = { grass: 0, rock: 0 }

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      const hl = H[j * N + Math.max(i - 1, 0)]
      const hr = H[j * N + Math.min(i + 1, N - 1)]
      const hd = H[Math.max(j - 1, 0) * N + i]
      const hu = H[Math.min(j + 1, N - 1) * N + i]
      let nx = (hl - hr) / (2 * sp)
      let nz = (hd - hu) / (2 * sp)
      const len = Math.hypot(nx, 1, nz)
      normals[k * 3] = nx / len
      normals[k * 3 + 1] = 1 / len
      normals[k * 3 + 2] = nz / len

      // gentle large-scale tone variation plus cavity shading
      const x = -extent + i * sp
      const z = -extent + j * sp
      const tone = 0.94 + 0.08 * fbm(n, (x / R) * 3 - 9, (z / R) * 3 + 4, 3)
      const cav = clamp((H[k] - broad[k]) / 4, -1, 1)
      const shade = tone * clamp(1 + cav * 0.16, 0.8, 1.12)
      colors[k * 3] = colors[k * 3 + 1] = colors[k * 3 + 2] = shade
      groundCover(island, x, z, H[k], inland[k], 1 - normals[k * 3 + 1], cover)
      masks[k * 2] = cover.grass
      masks[k * 2 + 1] = cover.rock
    }
  }
  return { normals, colors, masks }
}

/** World-space seabed height map for the ocean shader (shallows + foam). */
export function buildDepthMap(islands, grids, size) {
  const B = WORLD_BOUNDS
  const step = (2 * B) / size
  const data = new Uint8Array(size * size)
  islands.forEach((isl, idx) => {
    const grid = grids[idx]
    const r = isl.extent * Math.SQRT2
    const [px, pz] = isl.position
    const i0 = Math.max(0, Math.floor((px - r + B) / step))
    const i1 = Math.min(size - 1, Math.ceil((px + r + B) / step))
    const j0 = Math.max(0, Math.floor((pz - r + B) / step))
    const j1 = Math.min(size - 1, Math.ceil((pz + r + B) / step))
    for (let j = j0; j <= j1; j++) {
      const wz = -B + (j + 0.5) * step
      for (let i = i0; i <= i1; i++) {
        const wx = -B + (i + 0.5) * step
        const [lx, lz] = isl.toLocal(wx, wz)
        const h = sampleGrid(grid, lx, lz)
        const v = Math.round(clamp((h - SEA_FLOOR) / DEPTH_RANGE, 0, 1) * 255)
        const k = j * size + i
        if (v > data[k]) data[k] = v
      }
    }
  })
  return data
}
