// Kinematic character controller: camera-relative movement, smooth
// acceleration and turning, jumping under gravity, swimming in deep water and
// simple collision against the terrain height field and obstacles.
// Frame-rate independent; no allocations per frame. Collision is a single
// `groundAt` / `canStandAt` pair, so future obstacles can be added in one place.
import * as THREE from 'three'
import { MOVE } from './characterConfig.js'
import { blockedAt, heightAt } from '../world/worldStore.js'

/** Shared, mutable player state (read by the camera, lighting and UI). */
export const player = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(), // horizontal velocity in x/z, vertical in y
  yaw: 0, // facing angle; 0 = +Z
  grounded: true,
  swimming: false, // in deep water: floats at the surface, swims instead of walking
  ready: false, // set once the island exists and the character is spawned
}

const dampF = (rate, dt) => 1 - Math.exp(-rate * dt)

/** Ground height under a point (the terrain for now; extend with props later). */
export const groundAt = (x, z) => heightAt(x, z)

const BODY_RADIUS = 0.35

/**
 * Whether the character may move to a point: not into a tree trunk, rock or
 * other obstacle, not up a slope steeper than it can climb, and not further
 * out to sea than the swimming limit.
 */
export function canStandAt(x, z) {
  if (Math.hypot(x, z) > MOVE.maxSwimRadius || blockedAt(x, z, BODY_RADIUS)) return false
  const g = groundAt(x, z)
  const p = player.position
  const step = Math.hypot(x - p.x, z - p.z)
  // climbing out of the water onto a ledge counts from the water surface
  const from = player.swimming ? Math.max(p.y, MOVE.swimHeight) : p.y
  return !(player.grounded || player.swimming) || g - from <= step * MOVE.maxClimb + 0.05 || g < MOVE.swimDepth
}

/** Put the character at the spawn point chosen by the environment (facing the mountain). */
export function spawnPlayer(spawn) {
  player.position.set(spawn.x, groundAt(spawn.x, spawn.z), spawn.z)
  player.velocity.set(0, 0, 0)
  player.yaw = spawn.yaw
  player.grounded = true
  player.swimming = false
  player.ready = true
}

const fwd = new THREE.Vector3()
const right = new THREE.Vector3()
const wish = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Advance the simulation.
 * @param dt seconds (clamped by the caller)
 * @param intent { x: right, y: forward, sprint } from readMoveIntent()
 * @param jump true if a jump was requested this frame
 * @param camera the active camera: movement is relative to its horizontal view direction
 */
export function stepPlayer(dt, intent, jump, camera) {
  const p = player
  // camera-relative directions on the ground plane
  camera.getWorldDirection(fwd)
  fwd.y = 0
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1)
  fwd.normalize()
  right.crossVectors(fwd, UP)

  wish.set(0, 0, 0).addScaledVector(fwd, intent.y).addScaledVector(right, intent.x)
  const amount = Math.min(1, wish.length()) // analog stick magnitude, <= 1 (no fast diagonals)
  if (amount > 1e-3) wish.normalize()
  const targetSpeed = p.swimming
    ? amount * (intent.sprint ? MOVE.swimFastSpeed : MOVE.swimSpeed)
    : amount * (intent.sprint ? MOVE.runSpeed : MOVE.walkSpeed)

  // accelerate towards the wished horizontal velocity (water slows starts and stops a little)
  const control = p.swimming ? 0.6 : p.grounded ? 1 : MOVE.airControl
  const rate = (amount > 1e-3 ? MOVE.acceleration : MOVE.deceleration) * control
  const k = dampF(rate, dt)
  p.velocity.x += (wish.x * targetSpeed - p.velocity.x) * k
  p.velocity.z += (wish.z * targetSpeed - p.velocity.z) * k

  // turn smoothly towards the movement direction (shortest way round)
  if (amount > 1e-3) {
    const targetYaw = Math.atan2(wish.x, wish.z)
    let d = targetYaw - p.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    p.yaw += d * dampF(MOVE.turnSpeed, dt)
    p.yaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)) // keep within [-π, π]
  }

  // horizontal move with simple collision: slide along the shoreline limit
  const nx = p.position.x + p.velocity.x * dt
  const nz = p.position.z + p.velocity.z * dt
  if (canStandAt(nx, nz)) {
    p.position.x = nx
    p.position.z = nz
  } else if (canStandAt(nx, p.position.z)) {
    p.position.x = nx
    p.velocity.z = 0
  } else if (canStandAt(p.position.x, nz)) {
    p.position.z = nz
    p.velocity.x = 0
  } else {
    p.velocity.x = 0
    p.velocity.z = 0
  }

  // water: switch to swimming in deep water, back to walking where it is shallow
  const ground = groundAt(p.position.x, p.position.z)
  if (!p.swimming && ground < MOVE.swimDepth && p.position.y <= MOVE.swimHeight + 0.6) {
    p.swimming = true
    p.grounded = false
  } else if (p.swimming && ground > MOVE.swimExitDepth) {
    p.swimming = false
    p.grounded = true
  }
  if (p.swimming) {
    // float at the surface with a gentle bob; no jumping, no walking on the sea floor
    const bob = Math.sin(performance.now() * 0.0022) * 0.04
    p.position.y += (MOVE.swimHeight + bob - p.position.y) * dampF(4, dt)
    p.velocity.y = 0
    return
  }

  // vertical: jump, gravity and ground contact
  if (p.grounded && jump) {
    p.velocity.y = MOVE.jumpVelocity
    p.grounded = false
  }
  if (!p.grounded) {
    p.velocity.y -= MOVE.gravity * dt
    p.position.y += p.velocity.y * dt
    if (p.position.y <= ground && p.velocity.y <= 0) {
      p.position.y = ground
      p.velocity.y = 0
      p.grounded = true
    }
  } else {
    // stay glued to the (gently sloping) ground; walk off a drop -> start falling
    if (p.position.y - ground > 0.35) {
      p.grounded = false
    } else {
      p.position.y = ground
      p.velocity.y = 0
    }
  }
  if (p.position.y < ground) p.position.y = ground // never sink into the ground
}

/** Horizontal speed in m/s. */
export const playerSpeed = () => Math.hypot(player.velocity.x, player.velocity.z)
