// Kinematic character controller: camera-relative movement, smooth
// acceleration and turning, jumping under gravity and simple ground collision
// against the terrain height field. Frame-rate independent; no allocations
// per frame. Collision is a single `groundAt` / `canStandAt` pair, so future
// obstacles can be added in one place.
import * as THREE from 'three'
import { MOVE } from './characterConfig.js'
import { blockedAt, heightAt } from '../world/worldStore.js'

/** Shared, mutable player state (read by the camera, lighting and UI). */
export const player = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(), // horizontal velocity in x/z, vertical in y
  yaw: 0, // facing angle; 0 = +Z
  grounded: true,
  ready: false, // set once the island exists and the character is spawned
}

const dampF = (rate, dt) => 1 - Math.exp(-rate * dt)

/** Ground height under a point (the terrain for now; extend with props later). */
export const groundAt = (x, z) => heightAt(x, z)

const BODY_RADIUS = 0.35

/**
 * Whether the character may move to a point: not into deep water, not into a
 * tree trunk or large rock, and not up a slope steeper than it can climb.
 */
export function canStandAt(x, z) {
  const g = groundAt(x, z)
  if (g < MOVE.minGroundHeight || blockedAt(x, z, BODY_RADIUS)) return false
  const p = player.position
  const step = Math.hypot(x - p.x, z - p.z)
  return !player.grounded || g - p.y <= step * MOVE.maxClimb + 0.05
}

/** Put the character at the spawn point chosen by the environment (facing the mountain). */
export function spawnPlayer(spawn) {
  player.position.set(spawn.x, groundAt(spawn.x, spawn.z), spawn.z)
  player.velocity.set(0, 0, 0)
  player.yaw = spawn.yaw
  player.grounded = true
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
  const targetSpeed = amount * (intent.sprint ? MOVE.runSpeed : MOVE.walkSpeed)

  // accelerate towards the wished horizontal velocity
  const rate = (amount > 1e-3 ? MOVE.acceleration : MOVE.deceleration) * (p.grounded ? 1 : MOVE.airControl)
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

  // vertical: jump, gravity and ground contact
  const ground = groundAt(p.position.x, p.position.z)
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
    // stay glued to the (gently sloping) sand; walk off a drop -> start falling
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
