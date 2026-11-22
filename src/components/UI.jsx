import { useState } from 'react'
import { IS_TOUCH } from '../world/quality.js'
import { useWorld } from '../world/worldStore.js'
import { toggleMode, useMode } from '../game/gameStore.js'
import TimeControls from './ui/TimeControls.jsx'
import CreditsPanel from './ui/CreditsPanel.jsx'

const HINTS = {
  free: {
    desktop: [
      ['Drag', 'Rotate'],
      ['Scroll', 'Zoom'],
      ['WASD / Arrows', 'Pan'],
      ['Right-drag', 'Pan'],
    ],
    touch: [
      ['One finger', 'Rotate'],
      ['Pinch', 'Zoom'],
      ['Two fingers', 'Pan'],
    ],
  },
  player: {
    desktop: [
      ['WASD / Arrows', 'Move'],
      ['Shift', 'Run'],
      ['Space', 'Jump'],
      ['Drag', 'Rotate camera'],
      ['Scroll', 'Zoom'],
    ],
    touch: [
      ['Stick', 'Move (push fully to run)'],
      ['Jump', 'Jump'],
      ['One finger', 'Rotate camera'],
      ['Pinch', 'Zoom'],
    ],
  },
}

// Buttons drop focus after a click so Space / arrows keep controlling the character.
const clickThenBlur = (fn) => (e) => {
  fn()
  e.currentTarget.blur()
}

/** Overlay: title, camera-mode switch, control hints and a reset-view button. */
export default function UI({ onResetView }) {
  const [open, setOpen] = useState(!IS_TOUCH)
  const [credits, setCredits] = useState(false)
  const mode = useMode()
  const hints = HINTS[mode][IS_TOUCH ? 'touch' : 'desktop']
  const world = useWorld()

  return (
    <div className={`ui${IS_TOUCH ? ' ui-touch' : ''}`}>
      <header className="ui-title">
        <h1>Anime World</h1>
        <p>{mode === 'player' ? 'Third-person' : 'Free exploration'}</p>
      </header>

      <TimeControls />

      {!world.envReady && (
        <div className="ui-loading" role="status">
          {world.error ? `Could not generate the world: ${world.error}` : world.ready ? 'Growing forests and placing rocks…' : 'Shaping the island…'}
        </div>
      )}

      <div className="ui-panel">
        <button
          type="button"
          className="ui-mode"
          onClick={clickThenBlur(toggleMode)}
          aria-pressed={mode === 'player'}
          title="Switch between the free camera and the third-person character camera"
        >
          {mode === 'player' ? '🎥 Free camera' : '🧍 Play character'}
        </button>
        {open && (
          <ul className="ui-hints" aria-label="Controls">
            {hints.map(([k, v]) => (
              <li key={k}>
                <kbd>{k}</kbd>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="ui-buttons">
          <button type="button" onClick={clickThenBlur(() => setOpen((o) => !o))} aria-expanded={open}>
            {open ? 'Hide controls' : 'Controls'}
          </button>
          <button type="button" onClick={clickThenBlur(onResetView)}>
            Reset view
          </button>
          <button type="button" onClick={clickThenBlur(() => setCredits(true))}>
            Credits
          </button>
        </div>
      </div>
      {credits && <CreditsPanel onClose={() => setCredits(false)} />}
    </div>
  )
}
