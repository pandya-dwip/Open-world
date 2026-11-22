// Atmosphere state derived from the in-game hour. One shared object: the sky,
// ocean, lights, fog and clouds all reference its colours / vectors, so a
// single update per frame changes the whole scene consistently.
import * as THREE from 'three'
import { KEYFRAMES, TIME } from './timeConfig.js'

const COLOR_KEYS = ['skyTop', 'horizon', 'fog', 'light', 'hemiSky', 'hemiGround', 'cloud']
const NUM_KEYS = ['lightI', 'hemiI', 'stars', 'water', 'exposure']

// keyframe colours converted once (THREE.Color stores linear values)
const FRAMES = KEYFRAMES.map((k) => {
  const f = { h: k.h }
  for (const c of COLOR_KEYS) f[c] = new THREE.Color(k[c])
  for (const n of NUM_KEYS) f[n] = k[n]
  return f
})

export const atmosphere = {
  hours: 0,
  sunDir: new THREE.Vector3(0, 1, 0),
  moonDir: new THREE.Vector3(0, -1, 0),
  lightDir: new THREE.Vector3(0, 1, 0), // direction towards the key light (sun or moon)
  lightColor: new THREE.Color(),
  lightIntensity: 1,
  isMoon: false,
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  hemiIntensity: 1,
  skyTop: new THREE.Color(),
  horizon: new THREE.Color(),
  fog: new THREE.Color(),
  cloud: new THREE.Color(),
  stars: 0,
  water: 1, // overall brightness of the water surface
  exposure: 1,
  sunVisible: 1, // 0..1, sun disc above the horizon
  moonVisible: 0,
}

const smooth = (t) => t * t * (3 - 2 * t)
const smoothstep = (a, b, x) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))))

/** Sun direction for an hour: east at sunrise, high in the south at noon, west at sunset. */
function sunDirection(h, out) {
  const day = TIME.sunset - TIME.sunrise
  let a
  if (h >= TIME.sunrise && h <= TIME.sunset) a = (Math.PI * (h - TIME.sunrise)) / day
  else {
    const since = (h - TIME.sunset + 24) % 24
    a = Math.PI + (Math.PI * since) / (24 - day)
  }
  const t = TIME.sunTilt
  return out.set(Math.cos(a), Math.sin(a) * Math.cos(t), Math.sin(a) * Math.sin(t)).normalize()
}

/** Update `atmosphere` for the given hour (0..24). Allocation-free. */
export function updateAtmosphere(hours) {
  const A = atmosphere
  A.hours = hours
  let i = 0
  while (i < FRAMES.length - 2 && FRAMES[i + 1].h <= hours) i++
  const f0 = FRAMES[i]
  const f1 = FRAMES[i + 1]
  const t = smooth(Math.min(1, Math.max(0, (hours - f0.h) / (f1.h - f0.h))))
  for (const c of COLOR_KEYS) A[c === 'light' ? 'lightColor' : c].lerpColors(f0[c], f1[c], t)
  const lightI = f0.lightI + (f1.lightI - f0.lightI) * t
  A.hemiIntensity = f0.hemiI + (f1.hemiI - f0.hemiI) * t
  A.stars = f0.stars + (f1.stars - f0.stars) * t
  A.water = f0.water + (f1.water - f0.water) * t
  A.exposure = f0.exposure + (f1.exposure - f0.exposure) * t

  sunDirection(hours, A.sunDir)
  // the moon rides roughly opposite the sun, slightly offset so it isn't a mirror image
  A.moonDir.set(-A.sunDir.x * 0.92, -A.sunDir.y, -A.sunDir.z * 0.6 + 0.25).normalize()
  A.sunVisible = smoothstep(-0.06, 0.04, A.sunDir.y)
  A.moonVisible = smoothstep(-0.06, 0.06, A.moonDir.y) * (1 - A.sunVisible)

  // One key light: the sun by day, the moon by night. Both sit at the horizon at
  // the hand-over, where their light has faded out, so shadows never jump.
  const sunUp = smoothstep(-0.02, 0.14, A.sunDir.y)
  const moonUp = smoothstep(-0.02, 0.14, A.moonDir.y)
  A.isMoon = A.moonDir.y > A.sunDir.y
  A.lightDir.copy(A.isMoon ? A.moonDir : A.sunDir)
  A.lightIntensity = lightI * (A.isMoon ? moonUp : sunUp)
  return A
}

updateAtmosphere(TIME.startHour)
