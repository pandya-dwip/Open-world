// All tunable values for the playable character in one place.
// World units are metres: the explorer model is about 1.8 units tall.

export const MOVE = {
  walkSpeed: 1.5, // m/s
  runSpeed: 6.0, // m/s with Shift (or a full joystick push on touch)
  acceleration: 9, // how quickly velocity approaches the target (1/s)
  deceleration: 11, // how quickly the character stops when input is released
  airControl: 0.35, // fraction of ground acceleration while airborne
  turnSpeed: 11, // how quickly the body turns towards the movement direction (1/s)
  jumpVelocity: 6.4, // m/s upwards; ~1 m high with the gravity below
  gravity: 20, // m/s²
  minGroundHeight: -0.4, // the character may wade into ankle-deep water, no further
  maxClimb: 1.2, // steepest walkable slope (rise / run, ~50°); steeper rock faces block
}

/** The explorer model and its animation clips (see public/assets/characters/explorer). */
export const CHARACTER_ASSET = {
  model: 'assets/characters/explorer/model.glb',
  animations: 'assets/characters/explorer/animations/locomotion.glb',
  clips: {
    idle: 'Idle_Loop',
    walk: 'Walk_Loop',
    run: 'Jog_Fwd_Loop',
    jumpStart: 'Jump_Start',
    jumpLoop: 'Jump_Loop',
    jumpLand: 'Jump_Land',
  },
  // distance each locomotion clip covers per second at normal playback speed (measured
  // from the library's root-motion version); playback is scaled to the real speed so feet don't slide
  clipSpeed: { walk: 0.98, run: 5.38 },
  jumpStartOffset: 0.38, // skip the clip's wind-up: the jump itself starts at once on Space
  jumpStartRate: 1.5,
  landRate: 1.7,
  landTime: 0.35, // seconds the landing clip stays blended in
  blendRate: 10, // how quickly animation weights follow their targets (1/s)
  // the hair texture is a neutral base meant to be tinted; dark brown as in the reference art
  hairColor: '#4a3020',
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

