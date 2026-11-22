import { useRef } from 'react'
import { input, queueJump } from './playerInput.js'
import { IS_TOUCH } from '../world/quality.js'
import { useMode } from '../game/gameStore.js'

const RADIUS = 52 // px the stick can travel from its centre

/**
 * Touch controls for third-person mode: a virtual joystick (push to the edge
 * to run) and a jump button. They sit above the canvas, so touches on them
 * never reach the camera; one-finger drag / pinch on the scene still rotate
 * and zoom the camera.
 */
export default function MobileControls() {
  const mode = useMode()
  const base = useRef(null)
  const knob = useRef(null)
  const pointer = useRef(null)

  if (!IS_TOUCH || mode !== 'player') return null

  const update = (e) => {
    const r = base.current.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2)
    let dy = e.clientY - (r.top + r.height / 2)
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    knob.current.style.transform = `translate(${dx}px, ${dy}px)`
    input.joystick.x = dx / RADIUS
    input.joystick.y = -dy / RADIUS
  }
  const release = () => {
    pointer.current = null
    knob.current.style.transform = 'translate(0px, 0px)'
    input.joystick.x = 0
    input.joystick.y = 0
  }

  return (
    <div className="mobile-controls">
      <div
        ref={base}
        className="joystick"
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          pointer.current = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          update(e)
        }}
        onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div ref={knob} className="joystick-knob" />
      </div>
      <button
        type="button"
        className="jump-button"
        aria-label="Jump"
        onPointerDown={(e) => {
          e.preventDefault()
          queueJump()
        }}
      >
        Jump
      </button>
    </div>
  )
}
