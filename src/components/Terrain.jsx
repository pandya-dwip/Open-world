import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CHUNK_CELLS } from '../world/terrain.js'
import { SEA_FLOOR } from '../world/islands.js'
import { createTerrainMaterial } from '../world/terrainMaterial.js'
import { QUALITY } from '../world/quality.js'

const LOD_STEPS = [1, 2, 4, 8] // grid stride per level of detail

// Shared index buffers: every chunk at a given LOD has the same topology.
// The grid includes a one-vertex border ring that is pushed down as a skirt,
// hiding cracks where neighbouring chunks use different LODs.
const indexCache = new Map()
function chunkIndex(m) {
  if (indexCache.has(m)) return indexCache.get(m)
  const V = m + 3
  const idx = new Uint16Array((V - 1) * (V - 1) * 6)
  let o = 0
  for (let b = 0; b < V - 1; b++) {
    for (let a = 0; a < V - 1; a++) {
      const k = b * V + a
      idx[o++] = k; idx[o++] = k + V; idx[o++] = k + 1
      idx[o++] = k + 1; idx[o++] = k + V; idx[o++] = k + V + 1
    }
  }
  const attr = new THREE.BufferAttribute(idx, 1)
  indexCache.set(m, attr)
  return attr
}

function buildChunkGeometry(data, ci, cj, step, cx, cz) {
  const { N, sp, extent, heights } = data.grid
  const { normals, colors } = data
  const m = CHUNK_CELLS / step
  const V = m + 3
  const i0 = ci * CHUNK_CELLS
  const j0 = cj * CHUNK_CELLS
  const pos = new Float32Array(V * V * 3)
  const nor = new Float32Array(V * V * 3)
  const col = new Float32Array(V * V * 3)
  const skirt = 2 + step * sp * 0.9
  let v = 0
  for (let b = 0; b < V; b++) {
    const jj = b - 1
    const gj = j0 + Math.min(Math.max(jj, 0), m) * step
    for (let a = 0; a < V; a++) {
      const ii = a - 1
      const gi = i0 + Math.min(Math.max(ii, 0), m) * step
      const k = gj * N + gi
      const edge = ii < 0 || ii > m || jj < 0 || jj > m
      pos[v] = -extent + gi * sp - cx
      pos[v + 1] = heights[k] - (edge ? skirt : 0)
      pos[v + 2] = -extent + gj * sp - cz
      nor[v] = normals[k * 3]; nor[v + 1] = normals[k * 3 + 1]; nor[v + 2] = normals[k * 3 + 2]
      col[v] = colors[k * 3]; col[v + 1] = colors[k * 3 + 1]; col[v + 2] = colors[k * 3 + 2]
      v += 3
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(chunkIndex(m))
  geo.computeBoundingSphere()
  return geo
}

/** Chunked terrain with distance-based levels of detail. */
export default function Terrain({ island, data }) {
  const { group, dispose } = useMemo(() => {
    const material = createTerrainMaterial()
    const { N, sp, extent, chunks, heights } = data.grid
    const group = new THREE.Group()
    const geometries = []
    for (let cj = 0; cj < chunks; cj++) {
      for (let ci = 0; ci < chunks; ci++) {
        // skip chunks that are entirely flat sea floor
        let maxH = -Infinity
        for (let j = cj * CHUNK_CELLS; j <= (cj + 1) * CHUNK_CELLS; j += 4)
          for (let i = ci * CHUNK_CELLS; i <= (ci + 1) * CHUNK_CELLS; i += 4) maxH = Math.max(maxH, heights[j * N + i])
        if (maxH < SEA_FLOOR + 0.6) continue

        const cx = -extent + (ci + 0.5) * CHUNK_CELLS * sp
        const cz = -extent + (cj + 0.5) * CHUNK_CELLS * sp
        const lod = new THREE.LOD()
        lod.position.set(cx, 0, cz)
        LOD_STEPS.forEach((step, level) => {
          const geo = buildChunkGeometry(data, ci, cj, step, cx, cz)
          geometries.push(geo)
          const mesh = new THREE.Mesh(geo, material)
          mesh.castShadow = true
          mesh.receiveShadow = true
          lod.addLevel(mesh, QUALITY.terrainLod[level], 0.08)
        })
        group.add(lod)
      }
    }
    return {
      group,
      dispose: () => {
        geometries.forEach((g) => g.dispose())
        material.dispose()
      },
    }
  }, [island, data])

  useEffect(() => dispose, [dispose])
  return <primitive object={group} />
}
