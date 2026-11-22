// Places the downloaded mountain in the island's foothills and turns its
// surface into walkable ground using the height map baked by the asset build.
// The model is half a mountain (its summit is on a cut edge), so it is placed
// twice, the second copy mirrored across that edge, forming one complete peak.
import * as THREE from 'three'
import { ISLANDS } from '../world/islands.js'
import { inlandAt, heightAt, terrainHeightAt } from '../world/worldStore.js'
import { combineMirrored } from '../world/mountainField.js'

let heightMapPromise = null
/** Fetch the baked mountain height map once (metadata + Float32 heights). */
export function loadMountainHeightMap(urls) {
  heightMapPromise ||= Promise.all([
    fetch(urls.json).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`mountain height map: ${r.status}`)))),
    fetch(urls.bin).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`mountain height map: ${r.status}`)))),
  ]).then(([meta, buf]) => ({ ...meta, data: new Float32Array(buf) }))
  return heightMapPromise
}

export function setupMountain(lib, heightMap) {
  const island = ISLANDS[0]
  const site = island.mountain
  const hm = combineMirrored(heightMap)
  const [cx, cz] = island.toWorld(site.x, site.z)
  const S = site.scale
  const yaw = site.yaw + island.rotation
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const y0 = site.y0
  const E = hm.seamX

  // combined height map sample (-1 = no surface)
  const sampleModel = (mx, mz) => {
    const fx = (mx - hm.minX) / hm.cell
    const fz = (mz - hm.minZ) / hm.cell
    if (fx < 0 || fz < 0 || fx >= hm.nx - 1 || fz >= hm.nz - 1) return -1
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const k = j * hm.nx + i
    const a = hm.data[k], b = hm.data[k + 1], c = hm.data[k + hm.nx], d = hm.data[k + hm.nx + 1]
    if (a < 0 || b < 0 || c < 0 || d < 0) return -1
    const tx = fx - i
    const tz = fz - j
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
  }

  // copy A: model point (E, 0) at the site; copy B: mirrored across x = E
  const proto = lib.get('Mountain')
  const object = new THREE.Group()
  object.name = 'Mountain'
  const offset = new THREE.Vector3(S * E * cos, 0, -S * E * sin)
  for (const mirrored of [false, true]) {
    const half = new THREE.Group()
    half.position.set(cx, y0, cz)[mirrored ? 'add' : 'sub'](offset)
    half.rotation.y = yaw
    half.scale.set(mirrored ? -S : S, S, S)
    for (const part of proto.parts) {
      const mesh = new THREE.Mesh(part.geometry, part.material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      half.add(mesh)
    }
    object.add(half)
  }
  if (import.meta.env.DEV) {
    console.info(`[mountain] centre ${cx.toFixed(0)},${cz.toFixed(0)} terrain ${terrainHeightAt(cx, cz).toFixed(1)} base ${y0} summit ${(y0 + hm.height * S).toFixed(0)}`)
  }

  return {
    object,
    x: cx,
    z: cz,
    radius: (Math.max(hm.nx, hm.nz) * hm.cell * S) / 2,
    height: hm.height * S,
    /** walkable mountain surface at a world point (-Infinity where there is none) */
    heightAt(wx, wz) {
      const dx = wx - cx
      const dz = wz - cz
      const h = sampleModel((dx * cos - dz * sin) / S + E, (dx * sin + dz * cos) / S)
      return h < 0 ? -Infinity : y0 + h * S
    },
  }
}

/** Start on the southern shore, looking north towards the mountain. */
export function findSpawn(mountain) {
  const dir = new THREE.Vector2(0.15, 1).normalize()
  let last = null
  for (let t = mountain.radius * 0.3; t < 2000; t += 4) {
    const x = mountain.x + dir.x * t
    const z = mountain.z + dir.y * t
    if (inlandAt(x, z) < 55) break
    last = { x, z }
  }
  last ||= { x: mountain.x, z: mountain.z + mountain.radius }
  return { x: last.x, y: heightAt(last.x, last.z), z: last.z, yaw: Math.atan2(mountain.x - last.x, mountain.z - last.z) }
}
