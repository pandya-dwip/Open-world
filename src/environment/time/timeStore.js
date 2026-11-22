// In-game clock for the day-night cycle (no extra state library).
// `time.hours` is a float in [0, 24). The UI subscribes; the 3D scene reads
// `time` directly every frame, so React never re-renders per frame.
import { useSyncExternalStore } from 'react'
import { TIME } from './timeConfig.js'

export const time = {
  hours: TIME.startHour,
  playing: true,
  speed: TIME.defaultSpeed, // key of TIME.speeds
}

const listeners = new Set()
let snapshot = { ...time }
let lastMinute = -1
const emit = () => {
  snapshot = { ...time }
  listeners.forEach((l) => l())
}

/** Advance the clock by `dt` real seconds (called once per frame). */
export function advanceTime(dt) {
  if (!time.playing) return
  time.hours = (time.hours + (dt * TIME.speeds[time.speed].gameMinutesPerSecond) / 60) % 24
  const minute = Math.floor(time.hours * 60)
  if (minute !== lastMinute) {
    lastMinute = minute
    emit() // the UI only needs to refresh once per in-game minute
  }
}

export function setHours(h) {
  time.hours = ((h % 24) + 24) % 24
  emit()
}
export function setPlaying(p) {
  time.playing = p
  emit()
}
export function setSpeed(key) {
  time.speed = key
  emit()
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useTime = () => useSyncExternalStore(subscribe, () => snapshot)

export const formatHours = (h) => {
  const m = Math.floor(h * 60 + 1e-6) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
