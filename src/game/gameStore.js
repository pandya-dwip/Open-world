// Tiny external store for the camera / control mode (no extra state library).
import { useSyncExternalStore } from 'react'

/** 'player' = third-person character control, 'free' = free exploration camera. */
let mode = 'player'
const listeners = new Set()

export const getMode = () => mode
export function setMode(next) {
  if (next === mode) return
  mode = next
  listeners.forEach((l) => l())
}
export const toggleMode = () => setMode(mode === 'player' ? 'free' : 'player')

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useMode = () => useSyncExternalStore(subscribe, getMode)
