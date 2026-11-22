// Blends the downloaded mountain model into the terrain. The model is a piece
// cut from a larger range, so some of its edges are tall cut faces. From its
// baked height map we build a "skirt" field: outside the model the surface is
// extended outwards as a gentle ramp (so the terrain rises to meet every edge,
// however high), and just inside the edges the terrain hugs the model surface
// (no gaps under open edges). Deep inside the model the field is empty, so the
// terrain stays out of the way. Pure JS: used by the terrain worker.

/**
 * The downloaded mountain is half a mountain: its summit sits on a cut edge
 * (model +X). Mirroring it across that edge gives a complete peak. This builds
 * the combined height map: original columns, then the mirrored ones; the seam
 * (summit ridge) is at x = seamX. Model point (seamX + u, z) is the combined frame.
 */
export function combineMirrored(hm) {
  const { nx, nz, data } = hm
  const nx2 = nx * 2 - 1
  const out = new Float32Array(nx2 * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx2; i++) out[j * nx2 + i] = data[j * nx + (i < nx ? i : 2 * (nx - 1) - i)]
  }
  return { ...hm, nx: nx2, data: out, seamX: hm.minX + (nx - 1) * hm.cell }
}

/**
 * @param hm { minX, minZ, cell, nx, nz, data } height map in model space (-1 = no surface)
 * @param slope how fast the ramp falls per metre outwards
 * @param pad cells of ramp around the model
 */
export function buildMountainField(hm, slope = 0.45, pad = 130) {
  const { nx, nz, cell, data } = hm
  const W = nx + 2 * pad
  const H = nz + 2 * pad
  const NONE = -1e9
  const ramp = new Float32Array(W * H).fill(NONE)
  const inside = new Uint8Array(W * H)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = data[j * nx + i]
      if (v < 0) continue
      const k = (j + pad) * W + i + pad
      ramp[k] = v
      inside[k] = 1
    }
  }
  // chamfer dilation: every cell takes the highest neighbour minus the drop
  const d1 = slope * cell
  const d2 = d1 * Math.SQRT2
  const relax = (k, n, d) => {
    if (ramp[n] - d > ramp[k]) ramp[k] = ramp[n] - d
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const k = j * W + i
        relax(k, k - 1, d1); relax(k, k - W, d1); relax(k, k - W - 1, d2); relax(k, k - W + 1, d2)
      }
    }
    for (let j = H - 2; j > 0; j--) {
      for (let i = W - 2; i > 0; i--) {
        const k = j * W + i
        relax(k, k + 1, d1); relax(k, k + W, d1); relax(k, k + W + 1, d2); relax(k, k + W - 1, d2)
      }
    }
  }
  // distance (in cells) from each inside cell to the model's edge
  const dist = new Float32Array(W * H)
  for (let k = 0; k < W * H; k++) dist[k] = inside[k] ? 1e9 : 0
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = j * W + i
      dist[k] = Math.min(dist[k], dist[k - 1] + 1, dist[k - W] + 1)
    }
    for (let j = H - 2; j > 0; j--) for (let i = W - 2; i > 0; i--) {
      const k = j * W + i
      dist[k] = Math.min(dist[k], dist[k + 1] + 1, dist[k + W] + 1)
    }
  }
  const field = new Float32Array(W * H)
  for (let k = 0; k < W * H; k++) {
    if (!inside[k]) field[k] = ramp[k]
    else field[k] = dist[k] <= 3 ? ramp[k] - 0.35 : NONE // hug the edge band, leave the interior to the model
  }
  return { field, W, H, minX: hm.minX - pad * cell, minZ: hm.minZ - pad * cell, cell }
}

/**
 * Sampler for island-local coordinates.
 * @param site { x, z, yaw, scale, y0 } mountain placement (island-local); the
 *   site is where the summit ridge (seamX) of the combined mountain stands
 * @returns (lx, lz) => terrain height the mountain requires there (-Infinity if none)
 */
export function mountainSkirtSampler(mf, site, seamX) {
  const cos = Math.cos(site.yaw)
  const sin = Math.sin(site.yaw)
  const S = site.scale
  return (lx, lz) => {
    const dx = lx - site.x
    const dz = lz - site.z
    const fx = ((dx * cos - dz * sin) / S + seamX - mf.minX) / mf.cell
    const fz = ((dx * sin + dz * cos) / S - mf.minZ) / mf.cell
    if (fx < 0 || fz < 0 || fx >= mf.W - 1 || fz >= mf.H - 1) return -Infinity
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const k = j * mf.W + i
    const a = mf.field[k], b = mf.field[k + 1], c = mf.field[k + mf.W], d = mf.field[k + mf.W + 1]
    if (a < -1e8 || b < -1e8 || c < -1e8 || d < -1e8) return -Infinity
    const tx = fx - i
    const tz = fz - j
    return site.y0 + S * ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz)
  }
}
