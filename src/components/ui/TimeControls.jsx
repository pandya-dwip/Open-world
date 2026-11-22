import { useState } from 'react'
import { TIME } from '../../environment/time/timeConfig.js'
import { formatHours, setHours, setPlaying, setSpeed, useTime } from '../../environment/time/timeStore.js'
import { IS_TOUCH } from '../../world/quality.js'

const phaseOf = (h) =>
  h < 4.5 ? 'Night' : h < 5 ? 'Pre-dawn' : h < 7 ? 'Sunrise' : h < 11 ? 'Morning' : h < 15 ? 'Afternoon' : h < 17.5 ? 'Late afternoon' : h < 19.5 ? 'Sunset' : 'Night'
const isNight = (h) => h < 5.5 || h > 19.2

/**
 * Small time-of-day panel: current time and phase, play / pause, speed and a
 * 00:00-23:59 slider. Collapses to a clock pill on touch screens.
 */
export default function TimeControls() {
  const t = useTime()
  const [open, setOpen] = useState(!IS_TOUCH)
  const minutes = Math.floor(t.hours * 60 + 1e-6)

  return (
    <div className={`time-controls${open ? '' : ' collapsed'}`} role="group" aria-label="Time of day">
      <div className="time-row">
        <button
          type="button"
          className="time-clock"
          onClick={(e) => {
            setOpen((o) => !o)
            e.currentTarget.blur()
          }}
          aria-expanded={open}
          title={open ? 'Hide time controls' : 'Show time controls'}
        >
          <span aria-hidden="true">{isNight(t.hours) ? '🌙' : '☀️'}</span>
          <strong>{formatHours(t.hours)}</strong>
          {open && <span className="time-phase">{phaseOf(t.hours)}</span>}
        </button>
        {open && (
          <>
            <button
              type="button"
              className="time-play"
              onClick={(e) => {
                setPlaying(!t.playing)
                e.currentTarget.blur()
              }}
              aria-label={t.playing ? 'Pause the day-night cycle' : 'Play the day-night cycle'}
            >
              {t.playing ? '⏸' : '▶'}
            </button>
            <div className="time-speeds" role="radiogroup" aria-label="Time speed">
              {Object.entries(TIME.speeds).map(([key, s]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={t.speed === key}
                  className={t.speed === key ? 'active' : ''}
                  onClick={(e) => {
                    setSpeed(key)
                    e.currentTarget.blur()
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {open && (
        <input
          className="time-slider"
          type="range"
          min={0}
          max={24 * 60 - 1}
          step={1}
          value={minutes}
          aria-label="Time of day"
          aria-valuetext={formatHours(t.hours)}
          onChange={(e) => setHours(Number(e.target.value) / 60)}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.currentTarget.blur()} // give the keyboard back to the game after dragging
        />
      )}
    </div>
  )
}
