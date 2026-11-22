import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ANIMATED } from '../../environment/environmentConfig.js'
import { addObstacles } from '../../world/worldStore.js'

const URLS = Object.values(ANIMATED.ships)

/**
 * The ship models are split into dozens of small meshes (one draw call each).
 * Static parts are merged per material; animated parts (the caravel sail,
 * which uses morph targets) are kept as they are. Skinned parts have no
 * animation here, so they are baked in their rest pose.
 */
function mergeStatic(root) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const byMaterial = new Map()
  const remove = []
  root.traverse((o) => {
    if (!o.isMesh || o.morphTargetInfluences) return
    const g = o.geometry.clone()
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name]
      if (a && (a.normalized || !(a.array instanceof Float32Array) || a.isInterleavedBufferAttribute)) {
        const out = new Float32Array(a.count * a.itemSize)
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c)
        g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize))
      }
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()])
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    if (!byMaterial.has(mat)) byMaterial.set(mat, [])
    byMaterial.get(mat).push(g)
    remove.push(o)
  })
  for (const o of remove) o.parent.remove(o)
  for (const [mat, geos] of byMaterial) {
    const merged = mergeGeometries(geos)
    if (!merged) continue
    const m = new THREE.Mesh(merged, mat)
    root.add(m)
  }
}
const box = new THREE.Box3()
const size = new THREE.Vector3()

/**
 * Ships anchored around the island. Each is scaled to a realistic length,
 * sits at the waterline and bobs, rolls and pitches gently; the caravel sail
 * animation plays. Static models otherwise: no ship simulation.
 */
export default function Ships({ ships }) {
  const gltfs = useGLTF(URLS, false)
  const byName = useMemo(() => Object.fromEntries(Object.keys(ANIMATED.ships).map((k, i) => [k, gltfs[i]])), [gltfs])

  const fleet = useMemo(
    () =>
      ships.map((s) => {
        const gltf = byName[s.model]
        const model = cloneSkinned(gltf.scene)
        mergeStatic(model)
        box.setFromObject(model).getSize(size)
        const alongX = size.x > size.z
        const scale = s.length / Math.max(size.x, size.z)
        model.scale.setScalar(scale)
        box.setFromObject(model)
        // keel below the surface: about 7% of the overall height (hull draft; the masts make up the rest)
        const centre = box.getCenter(new THREE.Vector3())
        model.position.set(-centre.x, -box.min.y - (box.max.y - box.min.y) * 0.07, -centre.z)
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true
            o.receiveShadow = true
            if (o.isSkinnedMesh) o.frustumCulled = false
          }
        })
        const holder = new THREE.Group()
        holder.add(model)
        holder.position.set(s.x, 0, s.z)
        holder.rotation.y = s.yaw + (alongX ? Math.PI / 2 : 0)
        const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null
        if (mixer) gltf.animations.forEach((clip) => mixer.clipAction(clip).play())
        return { holder, mixer, s }
      }),
    [ships, byName],
  )

  // ships are solid for the swimming player: a row of circles along each hull
  useEffect(() => {
    const list = []
    for (const { s, holder } of fleet) {
      const dirX = Math.sin(s.yaw)
      const dirZ = Math.cos(s.yaw)
      for (let t = -0.42; t <= 0.42; t += 0.14) list.push({ x: holder.position.x + dirX * t * s.length, z: holder.position.z + dirZ * t * s.length, r: s.length * 0.13 })
    }
    addObstacles(list)
  }, [fleet])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    for (const { holder, mixer, s } of fleet) {
      holder.position.y = Math.sin(t * 0.55 + s.phase) * 0.28
      holder.rotation.z = Math.sin(t * 0.42 + s.phase) * 0.025
      holder.rotation.x = Math.sin(t * 0.33 + s.phase * 1.7) * 0.015
      mixer?.update(Math.min(dt, 0.1))
    }
  })

  return (
    <group name="Ships">
      {fleet.map(({ holder }, i) => (
        <primitive key={i} object={holder} />
      ))}
    </group>
  )
}

for (const url of URLS) useGLTF.preload(url, false)
