// Player input: keyboard (desktop) and virtual joystick / buttons (touch).
// Keyboard events are only consumed in third-person mode, so the free camera's
// WASD panning and the character's WASD movement never fight over the keys.
import { getMode } from '../game/gameStore.js'

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
}

export const input = {
  keys: new Set(),
  jumpQueued: false, // edge-triggered: one press = one jump attempt
  joystick: { x: 0, y: 0 }, // touch stick, y > 0 = forward, magnitude <= 1
}

export function clearInput() {
  input.keys.clear()
  input.jumpQueued = false
  input.joystick.x = 0
  input.joystick.y = 0
}

export const queueJump = () => {
  input.jumpQueued = true
}

const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable

function onKeyDown(e) {
  const action = KEYMAP[e.code]
  if (!action || getMode() !== 'player' || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
  e.preventDefault() // stop arrows / space from scrolling or pressing focused buttons
  if (action === 'jump' && !e.repeat) input.jumpQueued = true
  input.keys.add(action)
}

function onKeyUp(e) {
  const action = KEYMAP[e.code]
  if (action) input.keys.delete(action)
}

let attached = 0
/** Attach the keyboard listeners; returns a cleanup function. Safe to call twice. */
export function attachKeyboard() {
  if (attached++ === 0) {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearInput)
  }
  return () => {
    if (--attached === 0) {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearInput)
    }
  }
}

/**
 * Current movement intent in camera space: x = right, y = forward.
 * Magnitude is at most 1, so diagonals are never faster than straight lines.
 */
export function readMoveIntent(out) {
  const k = input.keys
  let x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0)
  let y = (k.has('forward') ? 1 : 0) - (k.has('back') ? 1 : 0)
  x += input.joystick.x
  y += input.joystick.y
  const len = Math.hypot(x, y)
  if (len > 1) {
    x /= len
    y /= len
  }
  out.x = x
  out.y = y
  // sprint: Shift on desktop, or pushing the stick right to its edge on touch
  out.sprint = k.has('sprint') || Math.hypot(input.joystick.x, input.joystick.y) > 0.92
  return out
}
