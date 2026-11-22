// Procedural animation: idle, walk, run and jump poses are computed as joint
// angles and blended by weights that follow the character's actual speed and
// airborne state. The gait phase advances with distance travelled, so stride
// matches movement (no foot sliding). Everything runs on preallocated arrays:
// no allocations per frame.
//
// Sign conventions (model faces +Z, left = +X):
//  - hip / shoulder rotation.x < 0 swings the limb forward
//  - knee rotation.x > 0 bends the knee; elbow rotation.x < 0 bends the elbow
//  - spine rotation.x > 0 leans forward; shoulder rotation.z > 0 raises the left arm sideways
import { GAIT, MOVE } from './characterConfig.js'
import { HIP_HEIGHT } from './CharacterModel.js'

const CH = [
  'hipsY', 'hipsX', 'hipsRotY', 'hipsZ', 'spineX', 'spineY', 'neckX', 'headX', 'headY',
  'lShX', 'lShZ', 'lElX', 'lWrX', 'rShX', 'rShZ', 'rElX', 'rWrX',
  'lHipX', 'lHipZ', 'lKneeX', 'lAnkX', 'rHipX', 'rHipZ', 'rKneeX', 'rAnkX',
]
const I = Object.fromEntries(CH.map((c, i) => [c, i]))
const N = CH.length

const THIGH = 0.42
const SHIN = 0.39
const LEG_REST = THIGH + SHIN

const pos = (x) => (x > 0 ? x : 0)
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const damp = (rate, dt) => 1 - Math.exp(-rate * dt)

function idlePose(o, t) {
  const breath = Math.sin(t * 1.7)
  o.fill(0)
  o[I.hipsY] = 0.003 * breath
  o[I.hipsZ] = 0.015 * Math.sin(t * 0.55) // slow weight shift
  o[I.spineX] = 0.02 + 0.012 * breath
  o[I.neckX] = -0.01 * breath
  o[I.headX] = 0.02 * Math.sin(t * 0.5)
  o[I.headY] = 0.07 * Math.sin(t * 0.33)
  o[I.lShX] = 0.03; o[I.rShX] = 0.03
  o[I.lShZ] = 0.1 + 0.012 * breath; o[I.rShZ] = -0.1 - 0.012 * breath
  o[I.lElX] = -0.16; o[I.rElX] = -0.16
  o[I.lHipX] = -0.02; o[I.rHipX] = 0.02
  o[I.lHipZ] = 0.035; o[I.rHipZ] = -0.035
  o[I.lKneeX] = 0.04; o[I.rKneeX] = 0.04
}

function walkPose(o, p) {
  const s = Math.sin(p)
  const c = Math.cos(p)
  o.fill(0)
  o[I.hipsY] = 0.012 * Math.cos(2 * p)
  o[I.hipsRotY] = 0.07 * s
  o[I.hipsZ] = 0.025 * c
  o[I.spineX] = 0.05
  o[I.spineY] = -0.1 * s
  o[I.headY] = 0.04 * s
  o[I.lHipX] = -0.42 * s - 0.04
  o[I.rHipX] = 0.42 * s - 0.04
  o[I.lKneeX] = 0.08 + 0.75 * pos(c) ** 1.4
  o[I.rKneeX] = 0.08 + 0.75 * pos(-c) ** 1.4
  o[I.lAnkX] = -(o[I.lHipX] + o[I.lKneeX]) * 0.75 + 0.2 * pos(-s) * pos(c)
  o[I.rAnkX] = -(o[I.rHipX] + o[I.rKneeX]) * 0.75 + 0.2 * pos(s) * pos(-c)
  o[I.lHipZ] = 0.02; o[I.rHipZ] = -0.02
  // arms swing opposite to the legs
  o[I.lShX] = 0.34 * s; o[I.rShX] = -0.34 * s
  o[I.lShZ] = 0.08; o[I.rShZ] = -0.08
  o[I.lElX] = -0.22 - 0.28 * pos(-s); o[I.rElX] = -0.22 - 0.28 * pos(s)
}

function runPose(o, p) {
  const s = Math.sin(p)
  const c = Math.cos(p)
  o.fill(0)
  o[I.hipsY] = 0.035 * Math.abs(s) // extra lift in the flight phase
  o[I.hipsX] = 0.08
  o[I.hipsRotY] = 0.12 * s
  o[I.spineX] = 0.26 // forward lean
  o[I.spineY] = -0.18 * s
  o[I.headX] = -0.2 // keep looking ahead despite the lean
  o[I.lHipX] = -0.8 * s - 0.2
  o[I.rHipX] = 0.8 * s - 0.2
  o[I.lKneeX] = 0.25 + 1.35 * pos(c)
  o[I.rKneeX] = 0.25 + 1.35 * pos(-c)
  o[I.lAnkX] = -(o[I.lHipX] + o[I.lKneeX] + o[I.hipsX]) * 0.6 + 0.25
  o[I.rAnkX] = -(o[I.rHipX] + o[I.rKneeX] + o[I.hipsX]) * 0.6 + 0.25
  // pumping arms with bent elbows and fists
  o[I.lShX] = 0.8 * s - 0.15; o[I.rShX] = -0.8 * s - 0.15
  o[I.lShZ] = 0.12; o[I.rShZ] = -0.12
  o[I.lElX] = -1.35 - 0.3 * pos(-s); o[I.rElX] = -1.35 - 0.3 * pos(s)
  o[I.lWrX] = -0.2; o[I.rWrX] = -0.2
}

function airPose(o, rising) {
  // rising: knees tucked, arms out for balance; falling: legs reach for the ground
  const r = rising
  o.fill(0)
  o[I.spineX] = 0.08 + 0.08 * r
  o[I.headX] = -0.08
  o[I.lHipX] = -0.35 - 0.45 * r; o[I.rHipX] = -0.1 - 0.2 * r
  o[I.lKneeX] = 0.45 + 0.8 * r; o[I.rKneeX] = 0.3 + 0.5 * r
  o[I.lAnkX] = 0.25; o[I.rAnkX] = 0.3
  o[I.lHipZ] = 0.05; o[I.rHipZ] = -0.05
  o[I.lShX] = -0.45 * r - 0.1; o[I.rShX] = -0.2 * r + 0.15
  o[I.lShZ] = 0.45 + 0.15 * r; o[I.rShZ] = -0.45 - 0.15 * r
  o[I.lElX] = -0.5; o[I.rElX] = -0.45
}

/** Vertical reach of a leg (hip joint to ankle) for given angles. */
const legSpan = (hip, knee) => THIGH * Math.cos(hip) + SHIN * Math.cos(hip + knee)

export class CharacterAnimator {
  constructor(joints) {
    this.j = joints
    this.time = 0
    this.phase = 0
    this.airW = 0
    this.landT = 0
    this.wasGrounded = true
    this.idle = new Float32Array(N)
    this.walk = new Float32Array(N)
    this.run = new Float32Array(N)
    this.air = new Float32Array(N)
    this.out = new Float32Array(N)
  }

  /**
   * @param dt seconds
   * @param speed horizontal speed (m/s)
   * @param grounded is the character on the ground
   * @param vy vertical velocity (m/s)
   */
  update(dt, speed, grounded, vy) {
    this.time += dt
    const walkW0 = clamp01(speed / MOVE.walkSpeed)
    const runT = clamp01((speed - MOVE.walkSpeed) / (MOVE.runSpeed - MOVE.walkSpeed))
    const cycle = GAIT.walkCycle + (GAIT.runCycle - GAIT.walkCycle) * runT
    if (grounded) this.phase = (this.phase + (speed * dt * Math.PI * 2) / cycle) % (Math.PI * 2)

    if (grounded && !this.wasGrounded) this.landT = GAIT.landingTime
    this.wasGrounded = grounded
    this.landT = Math.max(0, this.landT - dt)
    this.airW += ((grounded ? 0 : 1) - this.airW) * damp(grounded ? 16 : 12, dt)

    idlePose(this.idle, this.time)
    walkPose(this.walk, this.phase)
    runPose(this.run, this.phase)
    airPose(this.air, clamp01(0.5 + vy / (MOVE.jumpVelocity * 1.2)))

    const wIdle = 1 - walkW0
    const wWalk = walkW0 * (1 - runT)
    const wRun = walkW0 * runT
    const o = this.out
    const a = this.airW
    for (let k = 0; k < N; k++) {
      const ground = this.idle[k] * wIdle + this.walk[k] * wWalk + this.run[k] * wRun
      o[k] = ground + (this.air[k] - ground) * a
    }

    // landing: brief knee bend that eases out
    const land = this.landT / GAIT.landingTime
    if (land > 0) {
      const k = Math.sin(land * Math.PI * 0.5) * (1 - runT * 0.5)
      o[I.lHipX] -= 0.45 * k; o[I.rHipX] -= 0.45 * k
      o[I.lKneeX] += 0.8 * k; o[I.rKneeX] += 0.8 * k
      o[I.lAnkX] -= 0.3 * k; o[I.rAnkX] -= 0.3 * k
      o[I.spineX] += 0.18 * k
      o[I.lElX] -= 0.3 * k; o[I.rElX] -= 0.3 * k
    }
    this.apply(o)
  }

  apply(o) {
    const j = this.j
    // Foot planting: the hips sit exactly as high as the longer (stance) leg
    // reaches, so the supporting foot stays on the ground in every pose.
    const span = Math.max(legSpan(o[I.hipsX] + o[I.lHipX], o[I.lKneeX]), legSpan(o[I.hipsX] + o[I.rHipX], o[I.rKneeX]))
    const planted = HIP_HEIGHT - (LEG_REST - span) + o[I.hipsY]
    j.hips.position.y = planted + (HIP_HEIGHT - planted) * this.airW

    j.hips.rotation.set(o[I.hipsX], o[I.hipsRotY], o[I.hipsZ])
    j.spine.rotation.set(o[I.spineX] - o[I.hipsX], o[I.spineY], -o[I.hipsZ] * 0.7)
    j.neck.rotation.set(o[I.neckX], 0, 0)
    j.head.rotation.set(o[I.headX], o[I.headY] - o[I.spineY] * 0.5, 0)
    j.lShoulder.rotation.set(o[I.lShX], 0, o[I.lShZ])
    j.rShoulder.rotation.set(o[I.rShX], 0, o[I.rShZ])
    j.lElbow.rotation.set(o[I.lElX], 0, 0)
    j.rElbow.rotation.set(o[I.rElX], 0, 0)
    j.lWrist.rotation.set(o[I.lWrX], 0, 0)
    j.rWrist.rotation.set(o[I.rWrX], 0, 0)
    j.lHip.rotation.set(o[I.lHipX], 0, o[I.lHipZ] - o[I.hipsZ])
    j.rHip.rotation.set(o[I.rHipX], 0, o[I.rHipZ] - o[I.hipsZ])
    j.lKnee.rotation.set(o[I.lKneeX], 0, 0)
    j.rKnee.rotation.set(o[I.rKneeX], 0, 0)
    j.lAnkle.rotation.set(o[I.lAnkX], 0, 0)
    j.rAnkle.rotation.set(o[I.rAnkX], 0, 0)
  }
}
