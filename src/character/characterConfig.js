// All tunable values for the playable character in one place.
// World units are metres: the character is about 1.8 units tall.

export const MOVE = {
  walkSpeed: 2.3, // m/s
  runSpeed: 6.2, // m/s with Shift (or a full joystick push on touch)
  acceleration: 9, // how quickly velocity approaches the target (1/s)
  deceleration: 11, // how quickly the character stops when input is released
  airControl: 0.35, // fraction of ground acceleration while airborne
  turnSpeed: 11, // how quickly the body turns towards the movement direction (1/s)
  jumpVelocity: 6.4, // m/s upwards; ~1 m high with the gravity below
  gravity: 20, // m/s²
  minGroundHeight: -0.4, // the character may wade into ankle-deep water, no further
}

export const GAIT = {
  walkCycle: 1.55, // metres travelled per full walk cycle (two steps)
  runCycle: 2.7, // metres travelled per full run cycle
  landingTime: 0.28, // seconds of knee-bend after touching down
}

export const THIRD_PERSON = {
  targetHeight: 1.35, // camera looks at the upper chest
  distance: 4.6, // default distance behind the character
  minDistance: 2.2,
  maxDistance: 22,
  zoomSpeed: 2.6, // wheel / pinch zoom sensitivity
  maxPolarAngle: Math.PI * 0.495,
  minHeightAboveGround: 0.45,
  transitionTime: 1.4, // seconds for the free-camera -> third-person fly-in
  verticalFollow: 8, // smoothing of the camera's vertical follow during jumps (1/s)
  near: 0.15,
  far: 9000,
}

export const FREE_CAMERA = {
  near: 1,
  far: 16000,
}

/** Colours sampled from the reference sheets in Assets/. */
export const PALETTE = {
  skin: '#f3d2b6',
  skinShadow: '#e2b597',
  hair: '#3b2a20',
  eyeIris: '#7a4f2a',
  eyeDark: '#2a1a12',
  eyeWhite: '#fbf8f3',
  brow: '#2e2019',
  mouth: '#b9746a',
  jacket: '#3b6142',
  jacketDark: '#2c4b32',
  piping: '#b89c5e',
  shirt: '#ebe3cf',
  pants: '#4a4f4b',
  pantsDark: '#393d3a',
  leather: '#7a4a2a',
  leatherDark: '#5b351d',
  pack: '#8a5632',
  packDark: '#6c4024',
  metal: '#b8a27a',
  boot: '#a8672f',
  bootDark: '#7c4a22',
  sole: '#3b2a1f',
  lace: '#4a3022',
  glove: '#3a2f2a',
  watchFace: '#f2ead8',
  watchGold: '#c9a55a',
}
