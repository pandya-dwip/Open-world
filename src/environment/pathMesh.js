// Walking paths as continuous ribbons: each route of the network is one strip
// that follows the terrain vertex by vertex, so there are never gaps or seams
// between segments. Textured with the seamless "puddled mud with moss" PBR
// material; the edges fade softly into the grass.
import * as THREE from 'three'
import { heightAt } from '../world/worldStore.js'

const ACROSS = 6 // vertices across the path (conform to uneven ground)

export function buildPathGeometry(paths, width) {
  const pos = []
  const uv = []
  const edge = []
  const idx = []
  for (const path of paths) {
    if (path.length < 2) continue
    const base = pos.length / 3
    let dist = 0
    for (let i = 0; i < path.length; i++) {
      const [x, z] = path[i]
      const a = path[Math.max(0, i - 1)]
      const b = path[Math.min(path.length - 1, i + 1)]
      let tx = b[0] - a[0]
      let tz = b[1] - a[1]
      const tl = Math.hypot(tx, tz) || 1
      tx /= tl
      tz /= tl
      if (i > 0) dist += Math.hypot(x - path[i - 1][0], z - path[i - 1][1])
      for (let k = 0; k < ACROSS; k++) {
        const f = k / (ACROSS - 1) - 0.5
        const px = x - tz * f * width
        const pz = z + tx * f * width
        pos.push(px, heightAt(px, pz) + 0.06, pz)
        uv.push((f + 0.5) * (width / 2.6), dist / 2.6)
        edge.push(1 - Math.abs(f) * 2)
      }
    }
    for (let i = 0; i < path.length - 1; i++) {
      for (let k = 0; k < ACROSS - 1; k++) {
        const a = base + i * ACROSS + k
        const b = a + ACROSS
        idx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

export function createPathMaterial(textures) {
  const load = (url, srgb) => {
    const t = new THREE.TextureLoader().load(url)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const mat = new THREE.MeshStandardMaterial({
    map: load(textures.albedo, true),
    normalMap: load(textures.normal, false),
    roughnessMap: load(textures.roughness, false),
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true, // drawn on top of the terrain without z-fighting
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  mat.normalScale.set(0.8, 0.8)
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;\nvarying vec2 vPathXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEdge = aEdge;\nvPathXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEdge;\nvarying vec2 vPathXZ;')
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        // ragged, soft edges so the path melts into the grass
        float rag = sin(vPathXZ.x * 1.7 + vPathXZ.y * 0.9) * 0.08 + sin(vPathXZ.x * 0.43 - vPathXZ.y * 1.3) * 0.1;
        diffuseColor.a *= smoothstep(0.0, 0.42, vEdge + rag);`,
      )
  }
  return mat
}
