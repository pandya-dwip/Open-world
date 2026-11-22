import * as THREE from 'three'

/** Shared animated time uniform (ocean waves + shoreline effects). */
export const timeUniform = { value: 0 }

/** Direction *towards* the sun, used by lights, sky and ocean highlights. */
export const SUN_DIR = new THREE.Vector3(0.55, 0.52, 0.36).normalize()

export const COLORS = {
  skyTop: '#3a86d8',
  horizon: '#cfe6f5',
  fog: '#cfe6f5',
}

/** Initial camera framing. */
export const HOME_VIEW = {
  position: [820, 820, 1450],
  target: [0, 0, 0],
}

/** Explorable radius for the camera focus point. */
export const WORLD_RADIUS = 1400
