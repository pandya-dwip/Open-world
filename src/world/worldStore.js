// Tiny external store for generated world data (no extra state library needed).
import { useSyncExternalStore } from 'react'
import { ISLANDS, SEA_FLOOR } from './islands.js'
import { sampleGrid } from './terrain.js'
import { QUALITY } from './quality.js'

let state = { islands: ISLANDS.map(() => null), loaded: 0, depth: null, ready: false, error: null }
const listeners = new Set()
const set = (patch) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let started = false
export function startWorldGeneration() {
  if (started) return
  started = true
  const worker = new Worker(new URL('./generator.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    if (data.type === 'island') {
      const islands = state.islands.slice()
      islands[data.index] = data
      set({ islands, loaded: state.loaded + 1 })
    } else if (data.type === 'depth') {
      set({ depth: data, ready: true })
      worker.terminate()
    }
  }
  worker.onerror = (err) => {
    console.error('World generation failed', err)
    set({ error: err.message || 'World generation failed' })
  }
  worker.postMessage({
    terrainSpacing: QUALITY.terrainSpacing,
    depthSize: QUALITY.depthMapSize,
  })
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useWorld = () => useSyncExternalStore(subscribe, () => state)

/** Terrain height at a world position (sea floor where there is no land). */
export function heightAt(wx, wz) {
  let h = SEA_FLOOR
  for (let k = 0; k < ISLANDS.length; k++) {
    const data = state.islands[k]
    if (!data) continue
    const [lx, lz] = ISLANDS[k].toLocal(wx, wz)
    h = Math.max(h, sampleGrid(data.grid, lx, lz))
  }
  return h
}
