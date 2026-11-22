// Turns the loaded environment kits into instancing-ready prototypes.
// Each prototype (a top-level node of a kit) becomes a list of parts, one per
// material, with its meshes merged and baked into prototype space, so one
// prototype costs one draw call per material however many meshes it had.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const fixed = new WeakSet()

/**
 * Material fixes applied once per material:
 *  - foliage drawn with alpha blending becomes alpha-cutout (correct depth
 *    sorting, casts proper shadows, much cheaper);
 *  - materials authored dark for a sunset scene (the pine forest) are lifted
 *    back to neutral so they respond to our own lighting.
 */
function fixMaterial(m) {
  if (fixed.has(m)) return m
  fixed.add(m)
  if (m.map && (m.transparent || m.alphaTest > 0)) {
    m.transparent = false
    m.depthWrite = true
    m.alphaTest = Math.max(m.alphaTest, 0.42)
    m.side = THREE.DoubleSide
  }
  if (m.color) {
    const lum = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b
    if (m.map && lum < 0.45) m.color.setScalar(/bark|branch/i.test(m.name) ? 0.55 : 0.9)
  }
  if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.05)
  m.envMapIntensity = 0
  return m
}

/** Strip a geometry to the attributes every part shares, so parts can merge. */
function normalizeGeometry(g) {
  const keep = ['position', 'normal', 'uv']
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name)
  // quantized (meshopt) attributes are normalized integers: expand to floats so
  // they can be transformed and merged
  for (const name of keep) {
    const a = g.attributes[name]
    if (!a || (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute)) continue
    const out = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c)
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize))
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  return g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()])
}

/**
 * @param scenes { kitName: THREE.Group } loaded kit scenes
 * @returns Map name -> { parts: [{ geometry, material }], height, radius, tris }
 */
export function buildLibrary(scenes) {
  const lib = new Map()
  const tmp = new THREE.Matrix4()
  for (const [kit, scene] of Object.entries(scenes)) {
    scene.updateMatrixWorld(true)
    for (const proto of scene.children) {
      const byMaterial = new Map()
      const inv = tmp.copy(scene.matrixWorld).invert()
      proto.traverse((o) => {
        if (!o.isMesh) return
        const g = normalizeGeometry(o.geometry.clone())
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))
        const mat = fixMaterial(Array.isArray(o.material) ? o.material[0] : o.material)
        if (!byMaterial.has(mat)) byMaterial.set(mat, [])
        byMaterial.get(mat).push(g)
      })
      const parts = []
      let tris = 0
      const box = new THREE.Box3()
      for (const [material, geos] of byMaterial) {
        const geometry = geos.length > 1 ? mergeGeometries(geos) : geos[0]
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
        box.union(geometry.boundingBox)
        tris += geometry.index.count / 3
        parts.push({ geometry, material })
      }
      const size = box.getSize(new THREE.Vector3())
      lib.set(proto.name, {
        kit,
        parts,
        height: size.y,
        radius: Math.max(size.x, size.z) / 2,
        tris,
      })
    }
  }
  return lib
}
