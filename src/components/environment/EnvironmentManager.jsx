import { Suspense, use, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { KITS, MOUNTAIN_HEIGHTMAP } from '../../environment/environmentConfig.js'
import { buildLibrary } from '../../environment/prototypes.js'
import { planLayout } from '../../environment/layout.js'
import { planEnvironment } from '../../environment/placement.js'
import { ScatterField } from '../../environment/ScatterField.js'
import { buildLandmarks } from '../../environment/landmarks.js'
import { findSpawn, loadMountainHeightMap, setupMountain } from '../../environment/mountain.js'
import { addHeightField, setEnvironmentReady, setObstacles, useWorld } from '../../world/worldStore.js'
import Ships from './Ships.jsx'
import BeachWaves from './BeachWaves.jsx'
import WaterfallSplash from './WaterfallSplash.jsx'

const KIT_NAMES = ['trees', 'rocks', 'grass', 'mountains', 'houses', 'waterfalls']
const KIT_URLS = KIT_NAMES.map((k) => KITS[k])

/**
 * The island's environment, all from the downloaded assets: mountains,
 * forests with a beach-to-dense-forest gradient, houses and tree houses,
 * waterfalls, rocks, grass, ships and beach waves.
 * Builds once the terrain exists; the loading screen waits for all of it.
 */
export default function EnvironmentManager() {
  const { ready } = useWorld()
  if (!ready) return null
  return (
    <Suspense fallback={null}>
      <Environment />
    </Suspense>
  )
}

let built = null // built once per page; survives React StrictMode's double render
function Environment() {
  const gltfs = useGLTF(KIT_URLS, false)
  const heightMap = use(loadMountainHeightMap(MOUNTAIN_HEIGHTMAP))

  const env = useMemo(() => {
    if (built) return built
    const t0 = performance.now()
    const scenes = Object.fromEntries(KIT_NAMES.map((k, i) => [k, gltfs[i].scene]))
    const lib = buildLibrary(scenes)
    const mountain = setupMountain(lib, heightMap)
    addHeightField(mountain.heightAt)
    const spawn = findSpawn(mountain)
    const layout = planLayout(mountain, spawn)
    const plan = planEnvironment(lib, mountain, spawn, layout)
    const landmarks = buildLandmarks(lib, layout)
    setObstacles([...plan.obstacles, ...landmarks.obstacles])
    const field = new ScatterField(plan.instances, lib)
    if (import.meta.env.DEV) {
      const counts = {}
      for (const i of plan.instances) counts[i.category] = (counts[i.category] || 0) + 1
      const kinds = {}
      for (const s of layout.sites) kinds[s.kind] = (kinds[s.kind] || 0) + 1
      console.info(
        `[environment] ${plan.instances.length} objects ${JSON.stringify(counts)}; sites ${JSON.stringify(kinds)}; ` +
          `${layout.ships.length} ships; ` +
          `${layout.waves.length} wave patches; zones ${JSON.stringify(Object.fromEntries(Object.entries(layout.zones).map(([k, v]) => [k, Math.round(v)])))}; ` +
          `built in ${Math.round(performance.now() - t0)} ms`,
      )
    }
    built = { mountain, field, spawn, layout, landmarks }
    return built
  }, [gltfs, heightMap])

  useEffect(() => setEnvironmentReady(env.spawn), [env])
  useFrame(({ camera }) => env.field.update(camera))

  return (
    <>
      <primitive object={env.mountain.object} />
      <primitive object={env.landmarks.group} />
      <primitive object={env.field.group} />
      <Ships ships={env.layout.ships} />
      <BeachWaves waves={env.layout.waves} />
      <WaterfallSplash splashes={env.landmarks.splashes} />
    </>
  )
}

for (const url of KIT_URLS) useGLTF.preload(url, false)
