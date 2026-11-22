// Third-person follow behaviour for the shared OrbitControls camera.
// The orbit controls keep handling mouse/touch rotation and zoom; this module
// moves the orbit target with the character and flies the camera in when the
// mode is switched on. One camera, one controls instance: no conflicts.
import * as THREE from 'three'
import { THIRD_PERSON as TP } from '../character/characterConfig.js'
import { player } from '../character/CharacterController.js'

const state = {
  active: false,
  t: 0,
  duration: TP.transitionTime,
  fromPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  offset: new THREE.Vector3(),
  focusY: 0,
}
const focus = new THREE.Vector3()
const delta = new THREE.Vector3()

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

/** Offset that places the camera behind the character (opposite its facing). */
function behindOffset(out, yaw, distance = TP.distance, elevation = 0.3) {
  const h = Math.cos(elevation) * distance
  return out.set(-Math.sin(yaw) * h, Math.sin(elevation) * distance, -Math.cos(yaw) * h)
}

/**
 * Start (or restart) the smooth fly-in to the third-person view.
 * @param fromBehind true: end behind the character; false: keep the current viewing direction
 */
export function beginThirdPerson(camera, controls, fromBehind = false, instant = false) {
  state.fromPos.copy(camera.position)
  state.fromTarget.copy(controls.target)
  if (fromBehind) {
    behindOffset(state.offset, player.yaw)
  } else {
    // keep the horizontal direction the camera is already looking from
    state.offset.subVectors(camera.position, controls.target).setY(0)
    if (state.offset.lengthSq() < 1e-4) behindOffset(state.offset, player.yaw)
    else {
      const yaw = Math.atan2(-state.offset.x, -state.offset.z)
      behindOffset(state.offset, yaw)
    }
  }
  state.focusY = player.position.y + TP.targetHeight
  state.t = 0
  state.duration = instant ? 1e-4 : fromBehind ? 0.9 : TP.transitionTime
  state.active = true
}

/** Per-frame follow. Returns true while the fly-in transition is running. */
export function updateThirdPerson(dt, camera, controls) {
  state.focusY += (player.position.y + TP.targetHeight - state.focusY) * (1 - Math.exp(-TP.verticalFollow * dt))
  focus.set(player.position.x, state.focusY, player.position.z)

  if (state.active) {
    state.t += dt
    const e = ease(Math.min(1, state.t / state.duration))
    controls.target.lerpVectors(state.fromTarget, focus, e)
    delta.copy(focus).add(state.offset)
    camera.position.lerpVectors(state.fromPos, delta, e)
    camera.lookAt(controls.target)
    if (state.t >= state.duration) state.active = false
    return true
  }
  // keep the orbit offset, move the pivot with the character
  delta.subVectors(focus, controls.target)
  controls.target.add(delta)
  camera.position.add(delta)
  return false
}

export const isTransitioning = () => state.active
