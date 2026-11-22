import { Suspense, use, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { KITS, MOUNTAIN_HEIGHTMAP } from '../../environment/environmentConfig.js'
import { buildLibrary } from '../../environment/prototypes.js'
import { planEnvironment } from '../../environment/placement.js'
import { ScatterField } from '../../environment/ScatterField.js'
import { findSpawn, loadMountainHeightMap, setupMountain } from '../../environment/mountain.js'
import { addHeightField, setEnvironmentReady, setObstacles, useWorld } from '../../world/worldStore.js'

const KIT_URLS = [KITS.trees, KITS.rocks, KITS.grass, KITS.mountains]

/**
 * The island's environment: mountain, forests, palms, bushes, grass and rocks,
 * all from the downloaded assets. Builds once the terrain exists.
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
  const [trees, rocks, grass, mountains] = useGLTF(KIT_URLS, false)
  const heightMap = use(loadMountainHeightMap(MOUNTAIN_HEIGHTMAP))

  const env = useMemo(() => {
    if (built) return built
    const t0 = performance.now()
    const lib = buildLibrary({ trees: trees.scene, rocks: rocks.scene, grass: grass.scene, mountains: mountains.scene })
    const mountain = setupMountain(lib, heightMap)
    addHeightField(mountain.heightAt)
    const spawn = findSpawn(mountain)
    const plan = planEnvironment(lib, mountain, spawn)
    setObstacles(plan.obstacles)
    const field = new ScatterField(plan.instances, lib)
    const counts = {}
    for (const i of plan.instances) counts[i.category] = (counts[i.category] || 0) + 1
    if (import.meta.env.DEV) console.info(
      `[environment] ${plan.instances.length} objects ${JSON.stringify(counts)}, ${plan.obstacles.length} colliders, ` +
        `${field.stats.chunks} chunks / ${field.stats.meshes} instanced meshes, built in ${Math.round(performance.now() - t0)} ms`,
    )
    built = { lib, mountain, field, spawn }
    return built
  }, [trees, rocks, grass, mountains, heightMap])

  useEffect(() => setEnvironmentReady(env.spawn), [env])
  useFrame(({ camera }) => env.field.update(camera))

  return (
    <>
      <primitive object={env.mountain.object} />
      <primitive object={env.field.group} />
    </>
  )
}

for (const url of KIT_URLS) useGLTF.preload(url, false)
