import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR, COLORS } from '../world/shared.js'
import { QUALITY } from '../world/quality.js'
import { getMode } from '../game/gameStore.js'

const tmpTarget = new THREE.Vector3()

/**
 * Warm sun + sky/ground fill. The world is too large for one fixed shadow
 * map, so the sun's shadow frustum follows the camera focus and scales with
 * zoom. The shadow map is re-rendered only when the view has changed, and at
 * a throttled rate while it is changing.
 */
export default function Lighting() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const light = useRef()
  const last = useRef({ key: '', moved: false, frames: 0, camPos: new THREE.Vector3() })
  const throttle = QUALITY.shadowMapSize > 1024 ? 6 : 10

  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    scene.add(target)
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => scene.remove(target)
  }, [gl, scene, target])

  useFrame(({ camera, controls }) => {
    const l = light.current
    if (!l) return
    const st = last.current
    st.frames++
    const focus = controls?.target ?? tmpTarget.set(0, 0, 0)
    const dist = camera.position.distanceTo(focus)

    // quantised frustum size and centre so the shadow does not swim
    const extent = Math.min(QUALITY.shadowMaxExtent, Math.pow(1.25, Math.ceil(Math.log(Math.max(dist * 0.85, 24)) / Math.log(1.25))))
    const snap = extent / 8
    const cx = Math.round(focus.x / snap) * snap
    const cz = Math.round(focus.z / snap) * snap
    const key = `${cx}|${cz}|${extent}`

    const cameraMoved = st.camPos.distanceToSquared(camera.position) > 0.25
    st.camPos.copy(camera.position)

    if (key !== st.key) {
      st.key = key
      const sc = l.shadow.camera
      sc.left = sc.bottom = -extent
      sc.right = sc.top = extent
      sc.near = 10
      sc.far = 5000
      sc.updateProjectionMatrix()
      l.shadow.normalBias = ((2 * extent) / QUALITY.shadowMapSize) * 1.2
      target.position.set(cx, 0, cz)
      target.updateMatrixWorld()
      l.position.set(cx, 0, cz).addScaledVector(SUN_DIR, 2000)
      st.moved = true
    }
    // level-of-detail swaps while moving change the casters: refresh periodically
    // the character moves and animates: keep its shadow live while playing
    if (cameraMoved || getMode() === 'player') st.moved = true
    const every = getMode() === 'player' ? 1 : throttle
    if (st.moved && (st.frames >= every || !cameraMoved)) {
      gl.shadowMap.needsUpdate = true
      st.frames = 0
      st.moved = cameraMoved
    }
  })

  return (
    <>
      <fog attach="fog" args={[COLORS.fog, ...QUALITY.fog]} />
      <hemisphereLight args={['#d4e9ff', '#5f7a52', 1.05]} />
      <directionalLight
        ref={light}
        target={target}
        intensity={2.7}
        color="#fff0d4"
        castShadow
        shadow-mapSize={[QUALITY.shadowMapSize, QUALITY.shadowMapSize]}
        shadow-bias={-0.0003}
      />
    </>
  )
}
