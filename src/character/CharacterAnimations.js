// Animation blending for the explorer: idle / walk / run follow the actual
// ground speed (playback rate scaled so feet don't slide), jumping plays
// take-off -> mid-air loop -> landing, and in deep water swim-idle / swim-forward
// take over. All clips play continuously and only their weights change, so
// every transition is a smooth cross-fade.
import * as THREE from 'three'
import { CHARACTER_ASSET as A, MOVE } from './characterConfig.js'

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const damp = (rate, dt) => 1 - Math.exp(-rate * dt)
const NAMES = ['idle', 'walk', 'run', 'jumpStart', 'jumpLoop', 'jumpLand', 'swimIdle', 'swim']

export class CharacterAnimator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root)
    this.actions = {}
    this.weights = {}
    this.target = {}
    for (const name of NAMES) {
      const clip = THREE.AnimationClip.findByName(clips, A.clips[name])
      if (!clip) throw new Error(`Explorer animation clip missing: ${A.clips[name]}`)
      const action = this.mixer.clipAction(clip)
      if (name === 'jumpStart' || name === 'jumpLand') {
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
      }
      action.play()
      action.setEffectiveWeight(name === 'idle' ? 1 : 0)
      this.actions[name] = action
      this.weights[name] = name === 'idle' ? 1 : 0
    }
    this.wasGrounded = true
    this.airTime = 0
    this.landT = 0
  }

  update(dt, speed, grounded, swimming = false) {
    const act = this.actions
    if (swimming) grounded = true // no take-off / landing events in the water
    // events: take-off and landing restart their one-shot clips
    if (!grounded && this.wasGrounded) {
      act.jumpStart.reset().play()
      act.jumpStart.time = A.jumpStartOffset
      act.jumpStart.timeScale = A.jumpStartRate
      this.airTime = 0
    }
    if (grounded && !this.wasGrounded) {
      act.jumpLand.reset().play()
      act.jumpLand.timeScale = A.landRate
      this.landT = A.landTime
    }
    this.wasGrounded = grounded
    if (!grounded) this.airTime += dt
    this.landT = Math.max(0, this.landT - dt)

    // ground locomotion weights from the real speed
    const moving = clamp01(speed / MOVE.walkSpeed)
    const running = clamp01((speed - MOVE.walkSpeed) / (MOVE.runSpeed - MOVE.walkSpeed))
    const t = this.target
    t.idle = 1 - moving
    t.walk = moving * (1 - running)
    t.run = moving * running
    t.jumpStart = t.jumpLoop = t.jumpLand = t.swimIdle = t.swim = 0

    if (swimming) {
      // treading water when still, swimming strokes when moving
      const stroke = clamp01(speed / (MOVE.swimSpeed * 0.6))
      t.idle = t.walk = t.run = 0
      t.swimIdle = 1 - stroke
      t.swim = stroke
      this.landT = 0
    } else if (!grounded) {
      // take-off clip first, then the airborne loop
      const intoLoop = clamp01((this.airTime - 0.3) / 0.25)
      t.idle = t.walk = t.run = 0
      t.jumpStart = 1 - intoLoop
      t.jumpLoop = intoLoop
    } else if (this.landT > 0) {
      // landing: stronger when standing still, light when landing on the run
      const land = (this.landT / A.landTime) * (1 - 0.6 * moving)
      t.idle *= 1 - land
      t.walk *= 1 - land
      t.run *= 1 - land
      t.jumpLand = land
    }

    // playback rate follows real speed: no foot sliding
    act.walk.timeScale = Math.max(speed, 0.5) / A.clipSpeed.walk
    act.run.timeScale = Math.max(speed, 2) / A.clipSpeed.run
    act.swim.timeScale = Math.max(speed, 0.8) / A.clipSpeed.swim

    let sum = 0
    const k = damp(A.blendRate * (grounded ? 1 : 1.6), dt)
    for (const n of NAMES) {
      this.weights[n] += (t[n] - this.weights[n]) * k
      sum += this.weights[n]
    }
    for (const n of NAMES) act[n].setEffectiveWeight(sum > 0 ? this.weights[n] / sum : 0)
    this.mixer.update(dt)
  }
}
