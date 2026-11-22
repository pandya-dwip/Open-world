import { useEffect } from 'react'
import Ocean from './Ocean.jsx'
import Island from './Island.jsx'
import Lighting from './Lighting.jsx'
import Sky from './Sky.jsx'
import EnvironmentManager from './environment/EnvironmentManager.jsx'
import { ISLANDS } from '../world/islands.js'
import { startWorldGeneration, useWorld } from '../world/worldStore.js'

/** The world: sky, light, sea, the island terrain and its environment (added once generated). */
export default function World() {
  const world = useWorld()
  useEffect(startWorldGeneration, [])

  return (
    <>
      <Lighting />
      <Sky />
      <Ocean depth={world.depth} />
      <EnvironmentManager />
      {ISLANDS.map((isl, k) =>
        world.islands[k] ? <Island key={isl.id} island={isl} data={world.islands[k]} /> : null,
      )}
    </>
  )
}
