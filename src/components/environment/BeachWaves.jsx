import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ANIMATED, PLACEMENT } from '../../environment/environmentConfig.js'
import { atmosphere } from '../../environment/time/atmosphere.js'

/**
 * Breaking waves along the sandy beaches, using the downloaded animated
 * "ocean wave" model (a morph-target flipbook). Only two consecutive frames are
 * ever active, so they are blended once per frame on the CPU into one shared
 * surface that every copy draws: the same animation, without the GPU looping
 * over every morph target for every vertex of every copy. Each copy fades out
 * towards its edges so it blends into the ocean without a seam, faces inland,
 * and is only drawn near the camera.
 */

/** Plain (non-morph) geometry whose position / normal are rewritten each frame. */
function makeBlendTarget(geo) {
  const out = new THREE.BufferGeometry()
  out.setIndex(geo.index)
  for (const name of ['position', 'normal']) {
    const a = geo.attributes[name]
    const arr = new Float32Array(a.count * 3)
    for (let i = 0; i < a.count; i++) for (let c = 0; c < 3; c++) arr[i * 3 + c] = a.getComponent(i, c)
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage))
  }
  if (geo.attributes.uv) out.setAttribute('uv', geo.attributes.uv)
  const deltas = (list) => list.map((a) => {
    const arr = new Float32Array(a.count * 3)
    for (let i = 0; i < a.count; i++) for (let c = 0; c < 3; c++) arr[i * 3 + c] = a.getComponent(i, c)
    return arr
  })
  const base = { position: out.attributes.position.array.slice(), normal: out.attributes.normal.array.slice() }
  const targets = { position: deltas(geo.morphAttributes.position || []), normal: deltas(geo.morphAttributes.normal || []) }
  out.boundingSphere = geo.boundingSphere ?? (geo.computeBoundingSphere(), geo.boundingSphere)
  return { geometry: out, base, targets, relative: geo.morphTargetsRelative }
}

/** Write base + weighted active morph frames into the shared surface. */
function blend(t, influences) {
  for (const name of ['position', 'normal']) {
    const dst = t.geometry.attributes[name].array
    dst.set(t.base[name])
    const list = t.targets[name]
    for (let k = 0; k < list.length; k++) {
      const w = influences[k]
      if (!w) continue
      const d = list[k]
      if (t.relative) for (let i = 0; i < dst.length; i++) dst[i] += w * d[i]
      else for (let i = 0; i < dst.length; i++) dst[i] += w * (d[i] - t.base[name][i])
    }
    t.geometry.attributes[name].needsUpdate = true
  }
}
export default function BeachWaves({ waves }) {
  const gltf = useGLTF(ANIMATED.wave, false)
  const W = PLACEMENT.waves

  const setup = useMemo(() => {
    let source = null
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.morphTargetInfluences && !source) source = o
    })
    if (!source) return null
    gltf.scene.updateMatrixWorld(true)
    const geo = source.geometry
    // the surface is authored on its side and stood up by its parent nodes:
    // measure it in that (upright) frame
    const srcMatrix = source.matrixWorld.clone()
    const bb = new THREE.Box3().setFromObject(source)
    const p = geo.attributes.position
    const v = new THREE.Vector3()
    const ys = []
    for (let i = 0; i < p.count; i += 13) ys.push(v.fromBufferAttribute(p, i).applyMatrix4(srcMatrix).y)
    ys.sort((a, b) => a - b)
    const rest = ys[ys.length >> 1] // rest water level: median height of the surface
    const half = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2
    const cx = (bb.max.x + bb.min.x) / 2
    const cz = (bb.max.z + bb.min.z) / 2

    const material = source.material.clone()
    material.transparent = true
    material.depthWrite = false
    material.userData.tint = material.color.clone()
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHalf = { value: half }
      shader.uniforms.uCentre = { value: new THREE.Vector2(cx, cz) }
      shader.uniforms.uSrc = { value: srcMatrix }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uSrc;\nvarying vec2 vWaveLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaveLocal = (uSrc * vec4(position, 1.0)).xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHalf;\nuniform vec2 uCentre;\nvarying vec2 vWaveLocal;')
        .replace(
          '#include <alphamap_fragment>',
          `#include <alphamap_fragment>
          // round, soft edge: the patch dissolves into the surrounding ocean
          float rr = length((vWaveLocal - uCentre) / uHalf);
          diffuseColor.a *= 1.0 - smoothstep(0.45, 0.95, rr);`,
        )
    }

    const surface = makeBlendTarget(geo)
    const scale = W.size / (half * 2)
    const copies = waves.map((w) => {
      const m = new THREE.Mesh(surface.geometry, material)
      // rotate about the patch centre, then put that centre at the wave site
      const pivot = new THREE.Group()
      pivot.position.set(w.x, 0.05, w.z)
      pivot.rotation.y = w.yaw
      // scale * centre-on-origin * the source's own (upright) transform
      m.matrixAutoUpdate = false
      m.matrix.makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-cx, -rest, -cz)).multiply(srcMatrix)
      m.renderOrder = 2
      pivot.add(m)
      pivot.visible = false
      return pivot
    })
    const group = new THREE.Group()
    group.name = 'BeachWaves'
    copies.forEach((c) => group.add(c))
    const mixer = new THREE.AnimationMixer(source)
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play())
    return { group, copies, mixer, material, surface, source }
  }, [gltf, waves, W.size])

  const last = useRef(new THREE.Vector3(Infinity, 0, 0))
  useFrame(({ camera }, dt) => {
    if (!setup) return
    const anyVisible = setup.copies.some((c) => c.visible)
    if (anyVisible) {
      setup.mixer.update(Math.min(dt, 0.1))
      blend(setup.surface, setup.source.morphTargetInfluences)
    }
    setup.material.color.copy(setup.material.userData.tint).multiplyScalar(atmosphere.water)
    if (last.current.distanceToSquared(camera.position) > 9) {
      last.current.copy(camera.position)
      for (const c of setup.copies) c.visible = c.position.distanceTo(camera.position) < W.near
    }
  })

  return setup ? <primitive object={setup.group} /> : null
}

useGLTF.preload(ANIMATED.wave, false)
