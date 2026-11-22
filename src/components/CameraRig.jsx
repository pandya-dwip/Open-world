import { useEffect, useImperativeHandle, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { heightAt } from '../world/worldStore.js'
import { HOME_VIEW, WORLD_RADIUS } from '../world/shared.js'
import { getMode, useMode } from '../game/gameStore.js'
import { clearInput } from '../controls/playerInput.js'
import { player } from '../character/CharacterController.js'
import { FREE_CAMERA, THIRD_PERSON } from '../character/characterConfig.js'
import { beginThirdPerson, updateThirdPerson } from '../camera/thirdPerson.js'

const KEYMAP = {
  KeyW: 'f', ArrowUp: 'f',
  KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
}

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const move = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

// OrbitControls limits per camera mode
const FREE_LIMITS = { minDistance: 3, maxDistance: 2400, maxPolarAngle: Math.PI * 0.47, enablePan: true, zoomSpeed: 0.9 }
const PLAYER_LIMITS = {
  minDistance: THIRD_PERSON.minDistance,
  maxDistance: THIRD_PERSON.maxDistance,
  maxPolarAngle: THIRD_PERSON.maxPolarAngle,
  enablePan: false,
  zoomSpeed: THIRD_PERSON.zoomSpeed,
}

/**
 * The single camera owner, with two modes sharing one OrbitControls instance.
 * Free exploration — desktop: left-drag rotate, wheel zoom, right-drag / WASD / arrows pan;
 *   touch: one finger rotate, pinch zoom, two-finger drag pan.
 * Third person — the orbit pivot follows the character; drag rotates, wheel / pinch zooms,
 *   and the keyboard drives the character instead of panning.
 */
export default function CameraRig({ apiRef }) {
  const controls = useRef()
  const keys = useRef(new Set())
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  // Portrait screens: widen the vertical FOV so the horizontal view stays usable.
  useEffect(() => {
    const aspect = size.width / size.height
    camera.fov = aspect < 1 ? Math.min(75, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) / Math.pow(aspect, 0.6)))) : 50
    camera.updateProjectionMatrix()
  }, [camera, size])

  // Portrait screens see less horizontally, so start further back.
  const goHome = () => {
    const target = new THREE.Vector3(...HOME_VIEW.target)
    const offset = new THREE.Vector3(...HOME_VIEW.position).sub(target)
    offset.multiplyScalar(THREE.MathUtils.clamp(1.05 / camera.aspect, 1, 1.35))
    camera.position.copy(target).add(offset)
    controls.current.target.copy(target)
    controls.current.update()
  }

  useEffect(goHome, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mode switching: reconfigure the shared controls without moving the camera.
  // Entering third person flies the camera in once the character exists.
  const mode = useMode()
  const pendingFlyIn = useRef({ behind: true }) // first fly-in ends behind the character
  const prevMode = useRef(mode)
  useEffect(() => {
    const c = controls.current
    keys.current.clear()
    clearInput()
    Object.assign(c, mode === 'player' ? PLAYER_LIMITS : FREE_LIMITS)
    c.touches.TWO = mode === 'player' ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN
    const lens = mode === 'player' ? THIRD_PERSON : FREE_CAMERA
    camera.near = lens.near
    camera.far = lens.far
    camera.updateProjectionMatrix()
    // later switches keep the current viewing direction (no sudden swing)
    if (mode === 'player' && prevMode.current === 'free') pendingFlyIn.current = { behind: false }
    prevMode.current = mode
  }, [mode, camera])

  useImperativeHandle(apiRef, () => ({
    reset() {
      if (getMode() === 'player' && player.ready) beginThirdPerson(camera, controls.current, true)
      else goHome()
    },
  }))

  useEffect(() => {
    const isTyping = (e) => (/^(TEXTAREA|SELECT)$/.test(e.target?.tagName) || (e.target?.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/.test(e.target.type)) || e.target?.isContentEditable)
    const down = (e) => {
      const k = KEYMAP[e.code]
      if (!k || getMode() !== 'free' || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      keys.current.add(k)
    }
    const up = (e) => {
      const k = KEYMAP[e.code]
      if (k) keys.current.delete(k)
    }
    const clear = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useFrame((_, rawDelta) => {
    const c = controls.current
    if (!c) return
    const delta = Math.min(rawDelta, 0.1)

    if (getMode() === 'player') {
      if (!player.ready) return
      if (pendingFlyIn.current) {
        beginThirdPerson(camera, c, pendingFlyIn.current.behind)
        pendingFlyIn.current = null
      }
      updateThirdPerson(delta, camera, c)
      const minY = Math.max(heightAt(camera.position.x, camera.position.z), 0) + THIRD_PERSON.minHeightAboveGround
      if (camera.position.y < minY) camera.position.y = minY
      return
    }

    const k = keys.current

    if (k.size) {
      forward.subVectors(c.target, camera.position).setY(0)
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
      forward.normalize()
      right.crossVectors(forward, UP)
      move.set(0, 0, 0)
      if (k.has('f')) move.add(forward)
      if (k.has('b')) move.sub(forward)
      if (k.has('r')) move.add(right)
      if (k.has('l')) move.sub(right)
      if (move.lengthSq() > 0) {
        // pan faster when zoomed out
        const speed = THREE.MathUtils.clamp(camera.position.distanceTo(c.target) * 0.7, 30, 1400)
        move.normalize().multiplyScalar(speed * delta)
        camera.position.add(move)
        c.target.add(move)
      }
    }

    // keep the focus point inside the explorable area and on the water plane
    c.target.y = 0
    const r = Math.hypot(c.target.x, c.target.z)
    if (r > WORLD_RADIUS) {
      const f = WORLD_RADIUS / r
      const dx = c.target.x * f - c.target.x
      const dz = c.target.z * f - c.target.z
      c.target.x += dx
      c.target.z += dz
      camera.position.x += dx
      camera.position.z += dz
    }

    // never dip below terrain or the sea surface
    const floor = Math.max(heightAt(camera.position.x, camera.position.z), 0) + 1
    if (camera.position.y < floor) camera.position.y = floor
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={HOME_VIEW.target}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={FREE_LIMITS.zoomSpeed}
      panSpeed={0.9}
      screenSpacePanning={false}
      minDistance={FREE_LIMITS.minDistance}
      maxDistance={FREE_LIMITS.maxDistance}
      maxPolarAngle={FREE_LIMITS.maxPolarAngle}
    />
  )
}
