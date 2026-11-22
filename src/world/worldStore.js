// Tiny external store for generated world data (no extra state library needed).
import { useSyncExternalStore } from 'react'
import { ISLANDS, SEA_FLOOR } from './islands.js'
import { sampleGrid } from './terrain.js'
import { QUALITY } from './quality.js'
import { MOUNTAIN_HEIGHTMAP } from '../environment/environmentConfig.js'
import { loadMountainHeightMap } from '../environment/mountain.js'

let state = { islands: ISLANDS.map(() => null), loaded: 0, depth: null, ready: false, envReady: false, spawn: null, sceneReady: false, error: null }
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
  const start = (mountainHeightMap) =>
    worker.postMessage({ terrainSpacing: QUALITY.terrainSpacing, depthSize: QUALITY.depthMapSize, mountainHeightMap })
  // the terrain is shaped around the mountain, so its height map is needed first
  loadMountainHeightMap(MOUNTAIN_HEIGHTMAP).then(start, (err) => {
    console.error('Mountain height map could not be loaded; terrain built without it', err)
    start(null)
  })
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useWorld = () => useSyncExternalStore(subscribe, () => state)

/** Terrain height at a world position (sea floor where there is no land). */
export function terrainHeightAt(wx, wz) {
  let h = SEA_FLOOR
  for (let k = 0; k < ISLANDS.length; k++) {
    const data = state.islands[k]
    if (!data) continue
    const [lx, lz] = ISLANDS[k].toLocal(wx, wz)
    h = Math.max(h, sampleGrid(data.grid, lx, lz))
  }
  return h
}

/** Distance from the coastline in metres (negative offshore). */
export function inlandAt(wx, wz) {
  let d = -1e4
  for (let k = 0; k < ISLANDS.length; k++) {
    const data = state.islands[k]
    if (!data) continue
    const [lx, lz] = ISLANDS[k].toLocal(wx, wz)
    d = Math.max(d, sampleGrid(data.grid, lx, lz, data.grid.inland, -1e4))
  }
  return d
}

// Extra walkable surfaces on top of the terrain (e.g. the mountain model).
const heightFields = []
export const addHeightField = (fn) => heightFields.push(fn)

/** Ground height at a world position: terrain plus any walkable models on it. */
export function heightAt(wx, wz) {
  let h = terrainHeightAt(wx, wz)
  for (const f of heightFields) h = Math.max(h, f(wx, wz))
  return h
}

// Solid obstacles (tree trunks, large rocks) as circles in a spatial hash.
const OB_CELL = 8
const obstacleCells = new Map()
const obKey = (i, j) => i * 100003 + j
export function setObstacles(list) {
  obstacleCells.clear()
  for (const o of list) {
    const k = obKey(Math.floor(o.x / OB_CELL), Math.floor(o.z / OB_CELL))
    if (!obstacleCells.has(k)) obstacleCells.set(k, [])
    obstacleCells.get(k).push(o)
  }
}
/** true if a circle of radius r at (x, z) overlaps an obstacle */
export function blockedAt(x, z, r) {
  const i0 = Math.floor(x / OB_CELL)
  const j0 = Math.floor(z / OB_CELL)
  for (let i = i0 - 2; i <= i0 + 2; i++) {
    for (let j = j0 - 2; j <= j0 + 2; j++) {
      const list = obstacleCells.get(obKey(i, j))
      if (!list) continue
      for (const o of list) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return true
    }
  }
  return false
}

/** Called once the environment (mountain, vegetation, rocks) is in place. */
export const setEnvironmentReady = (spawn) => set({ envReady: true, spawn })

/** Called once everything is drawn and its shaders are compiled: the game can be shown. */
export const setSceneReady = () => set({ sceneReady: true })
