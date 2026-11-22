// Pure terrain generation (no three.js): runs inside the generator worker.
// Produces a height grid plus normals, base colours with a cavity (ambient
// occlusion) term, and the ocean depth map.
import { clamp, fbm, lerp } from './noise.js'
import { SEA_FLOOR, WORLD_BOUNDS } from './islands.js'

/** Grid cells per terrain chunk edge at full detail. */
export const CHUNK_CELLS = 128

/** Depth-map encoding: height range [SEA_FLOOR, SEA_FLOOR + DEPTH_RANGE] -> [0, 255]. */
export const DEPTH_RANGE = 30

function hexToLinear(hex) {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
}

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
  for (let j = 0; j < N; j++) {
    const z = -extent + j * sp
    for (let i = 0; i < N; i++) heights[j * N + i] = island.heightLocal(-extent + i * sp, z)
  }
  // light smoothing removes grid-scale spikes while keeping ridgelines
  heights = blur(heights, N, 1, sp < 3 ? 2 : 1)
  return { N, sp, extent, chunks, heights }
}

/** Bilinear height lookup in island-local coordinates. */
export function sampleGrid(grid, lx, lz) {
  const { N, sp, extent, heights } = grid
  const fx = (lx + extent) / sp
  const fz = (lz + extent) / sp
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return SEA_FLOOR
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const tx = fx - i
  const tz = fz - j
  const k = j * N + i
  const a = lerp(heights[k], heights[k + 1], tx)
  const b = lerp(heights[k + N], heights[k + N + 1], tx)
  return lerp(a, b, tz)
}

/** Normals plus sand colours shaded by a cavity term for soft depth. */
export function computeShading(island, grid) {
  const { N, sp, extent, heights: H } = grid
  const normals = new Float32Array(N * N * 3)
  const colors = new Float32Array(N * N * 3)
  const broad = blur(H, N, Math.max(2, Math.round(14 / sp)), 2)
  const sand = hexToLinear(island.sand)
  const n = island.noise
  const R = island.radius

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
      const shade = tone * clamp(1 + cav * 0.12, 0.85, 1.1)
      colors[k * 3] = sand[0] * shade
      colors[k * 3 + 1] = sand[1] * shade
      colors[k * 3 + 2] = sand[2] * shade
    }
  }
  return { normals, colors }
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
